import {
  Amount,
  Transaction as CsTransaction,
  CsWallet,
  errors,
} from '@coinspace/cs-common';

import * as symbols from './symbols.js';
import API from './API.js';

import {
  ADDRESS_PREFIXES,
  Address,
  MAXIMUM_STANDARD_TRANSACTION_MASS,
  OutScript,
  SOMPI_PER_KASPA,
  Transaction,
  bytesToHex,
  hexToBytes,
  transactionMass,
} from 'kaspalib';
import {
  HDKey,
  MAINNET_VERSIONS,
  TESTNET_VERSIONS,
} from 'kaspalib/hdkey.js';
import {
  estimateMaxInputsPerTx,
  select,
  sortUtxos,
} from 'kaspalib/utxo.js';

const BIP44_GAP_LIMIT = 1;
const BIP44_BATCH_SIZE = 3;
const BIP44_BATCH_SIZE_MAX = 10;

export class KaspaTransaction extends CsTransaction {
  get url() {
    if (this.development) {
      return `https://explorer-tn10.kaspa.org/txs/${this.id}`;

    }
    return `https://explorer.kaspa.org/txs/${this.id}`;
  }
}

export default class KaspaWallet extends CsWallet {
  #api;
  #balance = 0n;
  #account;
  #addresses = new Map();
  #usedAddresses = [];
  #lastUsedAddressIndexes = [-1, -1];
  #utxos = [];
  #bip32Versions;
  #addressCoder;
  #transactions = [];
  #feeRates = new Map();
  #dustThreshold = SOMPI_PER_KASPA;

  static ADDRESS_TYPE_P2PK = symbols.ADDRESS_TYPE_P2PK;

  static FEE_RATE_MINIMUM = symbols.FEE_RATE_MINIMUM;
  static FEE_RATE_FASTEST = symbols.FEE_RATE_FASTEST;

  get balance() {
    if (this.crypto.type === 'coin') {
      return new Amount(this.#balance, this.crypto.decimals);
    }
    throw new errors.InternalWalletError('Unsupported crypto type');
  }

  get address() {
    return this.#getAddress();
  }

  get defaultSettings() {
    return {
      bip44: "m/44'/111111'/0'",
    };
  }

  get isSettingsSupported() {
    return this.crypto.type === 'coin';
  }

  get isCsFeeSupported() {
    return this.crypto.type === 'coin';
  }

  get isFeeRatesSupported() {
    return true;
  }

  get feeRates() {
    return [...this.#feeRates.keys()];
  }

  get dummyExchangeDepositAddress() {
    return 'kaspa:qpauqsvk7yf9unexwmxsnmg547mhyga37csh0kj53q6xxgl24ydxjsgzthw5j';
  }

  constructor(options = {}) {
    super(options);
    this.#api = new API(this);
    this.#bip32Versions = this.development ? TESTNET_VERSIONS : MAINNET_VERSIONS;
    this.#addressCoder = Address({
      prefix: this.development ? ADDRESS_PREFIXES.testnet : ADDRESS_PREFIXES.mainnet,
    });
  }

  async create(seed) {
    this.typeSeed(seed);
    this.state = CsWallet.STATE_INITIALIZING;
    this.#account = HDKey.fromMasterSeed(seed, this.#bip32Versions)
      .derive(this.settings.bip44)
      .wipePrivateData();
    this.#init();
    this.state = CsWallet.STATE_INITIALIZED;
  }

  async open(publicKey) {
    this.typePublicKey(publicKey);
    this.state = CsWallet.STATE_INITIALIZING;
    const extendedKey = publicKey.data[symbols.ADDRESS_TYPE_P2PK.description];
    if (extendedKey?.path !== this.settings.bip44) {
      this.state = CsWallet.STATE_NEED_INITIALIZATION;
      return;
    }
    this.#account = HDKey.fromExtendedKey(extendedKey.key, this.#bip32Versions);
    this.#init();
    this.state = CsWallet.STATE_INITIALIZED;
  }

  async load() {
    this.state = CsWallet.STATE_LOADING;
    try {
      await this.#discovery();
      this.#balance = this.#calculateBalance();
      this.storage.set('balance', this.#balance.toString());
      await this.storage.save();
      this.state = CsWallet.STATE_LOADED;
    } catch (err) {
      this.state = CsWallet.STATE_ERROR;
      throw err;
    }
  }

  #init() {
    this.#balance = BigInt(this.storage.get('balance') || 0);
  }

  async loadFeeRates() {
    const fees = await this.#api.feerates();
    this.#feeRates.clear();
    fees.forEach((fee) => {
      if (fee.name === 'minimum') this.#feeRates.set(KaspaWallet.FEE_RATE_MINIMUM, BigInt(fee.value));
      if (fee.name === 'default') this.#feeRates.set(KaspaWallet.FEE_RATE_DEFAULT, BigInt(fee.value));
      if (fee.name === 'fastest') this.#feeRates.set(KaspaWallet.FEE_RATE_FASTEST, BigInt(fee.value));
    });
  }

  async cleanup() {
    await super.cleanup();
    this.#api.cleanup();
  }

  getPublicKey() {
    const data = {
      [symbols.ADDRESS_TYPE_P2PK.description]: {
        key: this.#account.publicExtendedKey,
        path: this.settings.bip44,
      },
    };
    return { data };
  }

  getPrivateKey(seed) {
    this.typeSeed(seed);
    const account = HDKey.fromMasterSeed(seed, this.#bip32Versions).derive(this.settings.bip44);
    const privateKey = [];
    const exported = {};
    for (const utxo of this.#utxos) {
      if (exported[utxo.address]) return;
      exported[utxo.address] = true;
      const key = account
        .deriveChild(utxo.bip32DerivationPath[0])
        .deriveChild(utxo.bip32DerivationPath[1]);
      privateKey.push({
        address: this.#getAddressFromPublicKey(key.publicKeySchnorr),
        privatekey: bytesToHex(key.privateKey),
      });
      key.wipePrivateData();
    }
    account.wipePrivateData();
    return privateKey;
  }

  #calculateBalance() {
    return this.#utxos.reduce((balance, { utxo }) => balance + utxo.amount, 0n);
  }

  #getAddressFromPublicKey(payload) {
    return this.#addressCoder.encode({
      type: 'pk',
      payload,
    });
  }

  #getAddress(change = false) {
    const index = change ? 1 : 0;
    const key = this.#account
      .deriveChild(index)
      .deriveChild(this.#lastUsedAddressIndexes[index] + 1);
    return this.#getAddressFromPublicKey(key.publicKeySchnorr);
  }

  async #discovery() {
    this.#addresses.clear();
    this.#usedAddresses = [];
    this.#lastUsedAddressIndexes = [-1, -1];
    for (const change of [0, 1]) {
      const key = this.#account.deriveChild(change);
      let batchSize = BIP44_BATCH_SIZE;
      let k = 0;
      let gap = 0;
      while (gap < BIP44_GAP_LIMIT) {
        const batch = [];
        for (let i = 0; i < batchSize; i++) {
          const address = this.#getAddressFromPublicKey(key.deriveChild(k).publicKeySchnorr);
          batch.push(address);
          this.#addresses.set(address, [change, k]);
          k++;
        }
        const infos = await this.#api.active(batch);
        for (const address of batch) {
          const info = infos.find((item) => item.address === address);
          if (info?.active) {
            gap = 0;
            this.#usedAddresses.push(address);
            this.#lastUsedAddressIndexes[change] = this.#addresses.get(address)[1];
          } else {
            gap++;
          }
        }
        batchSize++;
        batchSize = Math.min(batchSize, BIP44_BATCH_SIZE_MAX);
      }
    }
    if (this.#usedAddresses.length) {
      const utxos = await this.#api.utxos(this.#usedAddresses);
      this.#utxos = utxos.map((item) => {
        return {
          ...item,
          bip32DerivationPath: this.#addresses.get(item.address),
        };
      });
    }
  }

  async validateAddress({ address }) {
    super.validateAddress({ address });
    try {
      this.#addressCoder.decode(address);
    } catch (err) {
      throw new errors.InvalidAddressError(address, { cause: err });
    }
    return true;
  }

  async validateAmount({ feeRate, address, amount, price }) {
    super.validateAmount({ feeRate, address, amount, price });
    const { value } = amount;
    if (value < this.#dustThreshold) {
      throw new errors.SmallAmountError(new Amount(this.#dustThreshold, this.crypto.decimals));
    }
    const maxAmount = await this.#estimateMaxAmount({ feeRate, price });
    if (value > maxAmount) {
      throw new errors.BigAmountError(new Amount(maxAmount, this.crypto.decimals));
    }
    return true;
  }

  async #estimateMaxAmount({ feeRate, price }) {
    if (this.#utxos.length === 0) return 0n;
    const csFeeConfig = await this.getCsFeeConfig();
    const maxInputs = estimateMaxInputsPerTx(new Array(csFeeConfig.enabled ? 2 : 1));
    const inputs = sortUtxos(this.#utxos, 'amount', false).slice(0, maxInputs);
    const total = inputs.reduce((accum, input) => accum += input.utxo.amount, 0n);
    if (total < this.#dustThreshold) return 0n;
    let minerFee = this.#feeRates.get(feeRate) * MAXIMUM_STANDARD_TRANSACTION_MASS;
    // estimate max csfee
    let csFee = await this.calculateCsFee(total - minerFee, {
      dustThreshold: this.#dustThreshold,
      price,
    });
    let maxAmount = total - minerFee - csFee;
    if (maxAmount < this.#dustThreshold) return 0n;
    let bestMaxAmount = 0n;
    for (let i = 0; i < 16; i++) {
      // more precision csfee calculation
      csFee = await this.calculateCsFee(maxAmount, {
        dustThreshold: this.#dustThreshold,
        price,
      });
      const mass = transactionMass({
        inputs,
        outputs: [{
          amount: maxAmount,
        }, ...(csFee !== 0n ? [{
          amount: csFee,
        }] : [])],
      });
      if (mass > MAXIMUM_STANDARD_TRANSACTION_MASS) break;
      minerFee = this.#feeRates.get(feeRate) * mass;
      const waste = total - maxAmount - csFee - minerFee;
      if (waste < 0n) {
        maxAmount += waste;
      } else {
        if (maxAmount > bestMaxAmount) bestMaxAmount = maxAmount;
        if (waste < 10n) break;
        maxAmount += waste - await this.calculateCsFee(waste, {
          dustThreshold: 1n,
          minFee: 0,
          price,
        });
      }
    }
    return bestMaxAmount;
  }

  async estimateMaxAmount(options) {
    super.estimateMaxAmount(options);
    const maxAmount = await this.#estimateMaxAmount(options);
    return new Amount(maxAmount, this.crypto.decimals);
  }

  async estimateTransactionFee({ address, amount, feeRate, price }) {
    super.estimateTransactionFee({ address, amount, feeRate, price });
    const { fee } = await this.#prepareTransaction({
      address,
      value: amount.value,
      feeRate,
      price,
    });
    return new Amount(fee, this.crypto.decimals);
  }

  async createTransaction({ feeRate, address, amount, price }, seed, rand) {
    super.createTransaction({ feeRate, address, amount, price }, seed);
    const { inputs, outputs } = await this.#prepareTransaction({
      address,
      value: amount.value,
      feeRate,
      price,
    });
    const tx = new Transaction({
      inputs,
      outputs,
    });
    const account = HDKey.fromMasterSeed(seed, this.#bip32Versions)
      .derive(this.settings.bip44);
    tx.sign(account, rand);
    const id = await this.#api.submutTrandsaction(tx.toRPCTransaction());

    this.#utxos = this.#utxos.filter((utxo) => !inputs.includes(utxo));
    const addresses = [this.#getAddress(), this.#getAddress(true)];
    tx.outputs.forEach((output, index) => {
      if (addresses.includes(output.address)) {
        this.#usedAddresses.push(output.address);
        this.#lastUsedAddressIndexes[addresses.indexOf(output.address)]++;
      }
      if (this.#usedAddresses.includes(output.address)) {
        this.#utxos.push({
          address: output.address,
          utxo: {
            transactionId: hexToBytes(id),
            index,
            amount: output.amount,
            script: output.script,
            daaScore: 0,
          },
        });
      }
    });
    this.#balance = this.#calculateBalance();
    this.storage.set('balance', this.#balance.toString());
    await this.storage.save();
    return id;
  }

  async #prepareTransaction({ address, value, feeRate, price }) {
    const csFee = await this.calculateCsFee(value, {
      dustThreshold: this.#dustThreshold,
      price,
    });
    const outputs = [{
      address,
      amount: value,
      ...OutScript.encode(this.#addressCoder.decode(address)),
    }];
    if (csFee > 0n) {
      const { address: csFeeAddress } = await this.getCsFeeConfig();
      outputs.push({
        address: csFeeAddress,
        amount: csFee,
        ...OutScript.encode(this.#addressCoder.decode(csFeeAddress)),
      });
    }
    const { selected, fee, change } = select(this.#utxos, outputs, {
      feerate: this.#feeRates.get(feeRate),
    });
    if (change > 0n) {
      const changeAddress = this.#getAddress(true);
      outputs.push({
        address: changeAddress,
        amount: change,
        ...OutScript.encode(this.#addressCoder.decode(changeAddress)),
      });
    }
    return {
      inputs: selected,
      outputs,
      fee: fee + csFee,
    };
  }

  async #loadTransactions() {
    this.#transactions = (await this.#api.getTransactions(this.#usedAddresses)).sort((a, b) => {
      if (a.is_accepted === false) return -1;
      if (b.is_accepted === false) return 1;
      return b.block_time - a.block_time;
    }).map((tx) => {
      let inputValue = 0n;
      let outputValue = 0n;
      let csFee = 0n;

      for (const input of tx.inputs) {
        if (this.#addresses.has(input.previous_outpoint_address)) {
          inputValue += BigInt(input.previous_outpoint_amount);
        }
      }
      for (const output of tx.outputs) {
        if (this.#addresses.has(output.script_public_key_address)) {
          outputValue += BigInt(output.amount);
        } else if (output.csfee === true) {
          csFee += BigInt(output.amount);
        }
      }
      const minerFee = tx.inputs ?
        tx.inputs.reduce((accum, input) => accum += BigInt(input.previous_outpoint_amount), 0n)
        - tx.outputs.reduce((accum, output) => accum += BigInt(output.amount), 0n)
        : 0n;

      const totalFee = csFee + minerFee;
      const value = outputValue - inputValue;
      let amount;
      let incoming;
      let to;
      if (value > 0n) {
        incoming = true;
        amount = new Amount(value, this.crypto.decimals);
      } else {
        incoming = false;
        amount = new Amount(-1n * value - totalFee, this.crypto.decimals);
        to = tx.outputs[0].script_public_key_address;
      }
      return new KaspaTransaction({
        incoming,
        status: tx.is_accepted ? KaspaTransaction.STATUS_SUCCESS : KaspaTransaction.STATUS_PENDING,
        id: tx.transaction_id,
        amount,
        to,
        fee: new Amount(totalFee, this.crypto.decimals),
        timestamp: new Date(tx.block_time),
        // TODO unconfirmed
        confirmations: tx.is_accepted ? 10 : 0,
        minConfirmations: 10,
        development: this.development,
      });
    });
  }

  async loadTransactions({ cursor = 0 } = {}) {
    if (!cursor) {
      await this.#loadTransactions();
    }
    return {
      transactions: this.#transactions.slice(cursor, cursor + this.txPerPage),
      hasMore: this.#transactions.length > cursor + this.txPerPage,
      cursor: cursor + this.txPerPage,
    };
  }
}
