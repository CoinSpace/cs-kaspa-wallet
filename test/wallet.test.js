/* eslint-disable max-len */
import assert from 'assert/strict';
import sinon from 'sinon';

import { SOMPI_PER_KASPA } from 'kaspalib';
import { hexToBytes } from 'kaspalib/utils.js';

import { Amount } from '@coinspace/cs-common';
import Wallet from '@coinspace/cs-kaspa-wallet';

import {
  stubActive,
  stubCsFee,
  stubFeerates,
  stubLoadTransactions,
  stubSubmitTransaction,
  stubUtxos,
} from './utils.js';

// either dismiss upset disease clump hazard paddle twist fetch tissue hello buyer
const WALLET_SEED = hexToBytes('3e818cec5efc7505369fae3f162af61130b673fa9b40e5955d5cde22a85afa03748d074356a281a5fc1dbd0b721357c56095a54de8d4bc6ecaa288f300776ae4');
const WALLET_PUBLIC_KEY = {
  data: {
    p2pk: {
      key: 'kpub2JfcaYbvx1xhtvb7mprkcoGRcKi5o3KJ6LXcvqEix1jnvCErRSAK81ZMW6ceRyuQUXwtkWCaGTySAFhDQqKFitNtxpVpmFC6oaWkNHPkgcq',
      path: "m/44'/111111'/0'",
    },
  },
};
const WALLET_PUBLIC_KEY_TESTNET = {
  data: {
    p2pk: {
      key: 'ktub23MYGHTbuzgd4yoybb3dwZ5NrybJhJ4KyapMSzZ37otmcVGG6H5xhERPHXieWwGtKKaMiH9AHZ8MsLBmwAouBvZFyDwYTYVWPKhJyB6ay25',
      path: "m/44'/111111'/0'",
    },
  },
};

import ADDRESSES from './fixtures/addresses.json' with { type: 'json' };
import TRANSACTIONS from './fixtures/transactions.json' with { type: 'json' };
import TRANSACTIONS_RAW from './fixtures/transactions-raw.json' with { type: 'json' };

const kaspaATkaspa = {
  _id: 'kaspa@kaspa',
  asset: 'kaspa',
  platform: 'kaspa',
  type: 'coin',
  name: 'Kaspa',
  symbol: 'KAS',
  decimals: 8,
};

const SECOND_ADDRESS = 'kaspa:qpauqsvk7yf9unexwmxsnmg547mhyga37csh0kj53q6xxgl24ydxjsgzthw5j';
const COIN_PRICE = 0.05139;
const CS_FEE = {
  address: 'kaspa:qpyu9ndr2yxs7l9rfzlfe826me23y2ahew5eeum0xtys5809u273kpgjmd3s3',
  fee: 0.005,
  maxFee: 100,
  minFee: 0.3,
  feeAddition: 0,
};

let defaultOptions;

describe('Kaspa Wallet', () => {
  beforeEach(() => {
    defaultOptions = {
      crypto: kaspaATkaspa,
      platform: kaspaATkaspa,
      cache: { get() {}, set() {} },
      settings: {},
      request(...args) { console.log(args); },
      apiNode: 'node',
      storage: { get() {}, set() {}, save() {} },
      txPerPage: 10,
    };
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('constructor', () => {
    it('create wallet instance', () => {
      const wallet = new Wallet({
        ...defaultOptions,
      });
      assert.equal(wallet.state, Wallet.STATE_CREATED);
    });
  });

  describe('create wallet', () => {
    it('should create new wallet with seed ', async () => {
      const wallet = new Wallet({
        ...defaultOptions,
      });
      await wallet.create(WALLET_SEED);
      assert.equal(wallet.state, Wallet.STATE_INITIALIZED);
      assert.equal(wallet.address, ADDRESSES.MAINNET[0][0]);
    });

    it('should create new testnet wallet with seed', async () => {
      const wallet = new Wallet({
        ...defaultOptions,
        development: true,
      });
      await wallet.create(WALLET_SEED);
      assert.equal(wallet.state, Wallet.STATE_INITIALIZED);
      assert.equal(wallet.address, ADDRESSES.TESTNET[0][0]);
    });

    it('should fails without seed', async () => {
      const wallet = new Wallet({
        ...defaultOptions,
      });
      await assert.rejects(async () => {
        await wallet.create();
      }, {
        name: 'TypeError',
        message: 'seed must be an instance of Uint8Array or Buffer, undefined provided',
      });
    });
  });

  describe('open wallet', () => {
    it('should open wallet with public key', async () => {
      const wallet = new Wallet({
        ...defaultOptions,
      });
      await wallet.open(WALLET_PUBLIC_KEY);
      assert.equal(wallet.state, Wallet.STATE_INITIALIZED);
      assert.equal(wallet.address, ADDRESSES.MAINNET[0][0]);
    });

    it('should open testnet wallet with public key', async () => {
      const wallet = new Wallet({
        ...defaultOptions,
        development: true,
      });
      await wallet.open(WALLET_PUBLIC_KEY_TESTNET);
      assert.equal(wallet.state, Wallet.STATE_INITIALIZED);
      assert.equal(wallet.address, ADDRESSES.TESTNET[0][0]);
    });

    it('should fails without public key', async () => {
      const wallet = new Wallet({
        ...defaultOptions,
      });
      await assert.rejects(async () => {
        await wallet.open();
      }, {
        name: 'TypeError',
        message: 'publicKey must be an instance of Object with data property',
      });
    });

    it('should set STATE_NEED_INITIALIZATION for wrong public key', async () => {
      const wallet = new Wallet({
        ...defaultOptions,
      });
      await wallet.open({
        data: {
          p2pk: {
            key: WALLET_PUBLIC_KEY.data.p2pk.key,
            path: "m/0'",
          },
        },
      });
      assert.equal(wallet.state, Wallet.STATE_NEED_INITIALIZATION);
    });
  });

  describe('storage', () => {
    it('should load initial balance from storage', async () => {
      sinon.stub(defaultOptions.storage, 'get')
        .withArgs('balance').returns('1234567890');
      const wallet = new Wallet({
        ...defaultOptions,
      });
      await wallet.open(WALLET_PUBLIC_KEY);
      assert.equal(wallet.balance.value, 12_3456_7890n);
    });
  });

  describe('load', () => {
    it('should load empty wallet', async () => {
      const request = sinon.stub(defaultOptions, 'request');
      stubActive(request, []);
      const storage = sinon.mock(defaultOptions.storage);
      storage.expects('set').once().withArgs('balance', '0');
      storage.expects('save').once();
      const wallet = new Wallet({
        ...defaultOptions,
      });
      await wallet.open(WALLET_PUBLIC_KEY);
      await wallet.load();
      assert.equal(wallet.state, Wallet.STATE_LOADED);
      assert.equal(wallet.balance.value, 0n);
      assert.equal(wallet.address, ADDRESSES.MAINNET[0][0]);
      storage.verify();
    });

    it('should load normal wallet', async () => {
      const request = sinon.stub(defaultOptions, 'request');
      stubActive(request, [
        ...ADDRESSES.MAINNET[0].slice(0, 4),
        ...ADDRESSES.MAINNET[1].slice(0, 1),
      ]);
      stubUtxos(request, [
        ...ADDRESSES.MAINNET[0].slice(0, 4),
        ...ADDRESSES.MAINNET[1].slice(0, 1),
      ]);
      const storage = sinon.mock(defaultOptions.storage);
      storage.expects('set').once().withArgs('balance', '500000000');
      storage.expects('save').once();
      const wallet = new Wallet({
        ...defaultOptions,
      });
      await wallet.open(WALLET_PUBLIC_KEY);
      await wallet.load();
      assert.equal(wallet.state, Wallet.STATE_LOADED);
      assert.equal(wallet.balance.value, 5_0000_0000n);
      assert.equal(wallet.address, ADDRESSES.MAINNET[0][4]);
      storage.verify();
    });

    it('should load full wallet', async () => {
      const request = sinon.stub(defaultOptions, 'request');
      stubActive(request, [
        ...ADDRESSES.MAINNET[0],
        ...ADDRESSES.MAINNET[1],
      ]);
      stubUtxos(request, [
        ...ADDRESSES.MAINNET[0],
        ...ADDRESSES.MAINNET[0],
        ...ADDRESSES.MAINNET[0],
        ...ADDRESSES.MAINNET[1],
        ...ADDRESSES.MAINNET[1],
        ...ADDRESSES.MAINNET[1],
      ]);
      const storage = sinon.mock(defaultOptions.storage);
      storage.expects('set').once().withArgs('balance', '12000000000');
      storage.expects('save').once();
      const wallet = new Wallet({
        ...defaultOptions,
      });
      await wallet.open(WALLET_PUBLIC_KEY);
      await wallet.load();
      assert.equal(wallet.state, Wallet.STATE_LOADED);
      assert.equal(wallet.balance.value, 120_0000_0000n);
      // 21st address
      assert.equal(wallet.address, 'kaspa:qr6r50k0776efwmca4l24zg5rf6m8ur5mffdrwy5z7qln5tsk08gc6l0mvwtf');
      storage.verify();
    });

    it('should set STATE_ERROR on error', async () => {
      sinon.stub(defaultOptions, 'request')
        .withArgs(sinon.match.any).rejects();
      const wallet = new Wallet({
        ...defaultOptions,
      });
      await wallet.create(WALLET_SEED);
      await assert.rejects(async () => {
        await wallet.load();
      });
      assert.equal(wallet.state, Wallet.STATE_ERROR);
    });
  });

  describe('getPublicKey', () => {
    it('should export public key', async () => {
      const wallet = new Wallet({
        ...defaultOptions,
      });
      await wallet.create(WALLET_SEED);
      const publicKey = wallet.getPublicKey();
      assert.deepEqual(publicKey, WALLET_PUBLIC_KEY);
    });

    it('public key is valid', async () => {
      const wallet = new Wallet({
        ...defaultOptions,
      });
      await wallet.create(WALLET_SEED);
      const publicKey = wallet.getPublicKey();
      const secondWalet = new Wallet({
        ...defaultOptions,
      });
      secondWalet.open(publicKey);
      assert.equal(wallet.address, secondWalet.address);
    });
  });

  describe('getPrivateKey', () => {
    it('should export private key', async () => {
      const request = sinon.stub(defaultOptions, 'request');
      stubActive(request, ADDRESSES.MAINNET[0].slice(0, 2));
      stubUtxos(request, ADDRESSES.MAINNET[0].slice(0, 2));
      const wallet = new Wallet({
        ...defaultOptions,
      });
      await wallet.open(WALLET_PUBLIC_KEY);
      await wallet.load();
      const privateKey = wallet.getPrivateKey(WALLET_SEED);
      assert.deepEqual(privateKey, [{
        address: 'kaspa:qpd0mgtcj7r25phumvmuf2637x6g2ppa0w928yrxfe3rxpatefpa2eqawyx4h',
        privatekey: '4af659ff32c37794cd968864f5e2c3f501edee0102c161dd83ad7c45f0056f81',
      },
      {
        address: 'kaspa:qp3qauzpsk63mljx2rqagj38m3v5l6zjazr0tlnhggp6amueayvqswpcnkahz',
        privatekey: 'e72f7a24514462264791f23530c1320c39cce8519b6bcae50a2a16b31b82451d',
      }]);
    });

    it('should export private key (empty wallet)', async () => {
      const request = sinon.stub(defaultOptions, 'request');
      stubActive(request, []);
      const wallet = new Wallet({
        ...defaultOptions,
      });
      await wallet.open(WALLET_PUBLIC_KEY);
      await wallet.load();
      const privateKey = wallet.getPrivateKey(WALLET_SEED);
      assert.deepEqual(privateKey, []);
    });
  });

  describe('validators', () => {
    describe('validateAddress', () => {
      let wallet;
      beforeEach(async () => {
        const request = sinon.stub(defaultOptions, 'request');
        stubActive(request, []);
        wallet = new Wallet({
          ...defaultOptions,
        });
        await wallet.open(WALLET_PUBLIC_KEY);
        await wallet.load();
      });

      it('valid address', async () => {
        assert.ok(await wallet.validateAddress({ address: 'kaspa:qqkqkzjvr7zwxxmjxjkmxxdwju9kjs6e9u82uh59z07vgaks6gg62v8707g73' }));
        assert.ok(await wallet.validateAddress({ address: 'kaspa:qpauqsvk7yf9unexwmxsnmg547mhyga37csh0kj53q6xxgl24ydxjsgzthw5j' }));
        assert.ok(await wallet.validateAddress({ address: 'kaspa:qpz2vgvlxhmyhmt22h538pjzmvvd52nuut80y5zulgpvyerlskvvwm7n4uk5a' }));
        assert.ok(await wallet.validateAddress({ address: 'kaspa:qr8k05f9n6xtrd0eex5lr6878mc5n7dgrtn8xv3frfvuxgfchx9077jtz5tsk' }));
      });

      it('invalid address', async () => {
        await assert.rejects(async () => {
          await wallet.validateAddress({ address: 'my invalid address' });
        }, {
          name: 'InvalidAddressError',
          message: 'Invalid address "my invalid address"',
        });
      });

      it('invalid (testnet) address', async () => {
        await assert.rejects(async () => {
          await wallet.validateAddress({ address: 'kaspatest:qqnapngv3zxp305qf06w6hpzmyxtx2r99jjhs04lu980xdyd2ulwwmx9evrfz' });
        }, {
          name: 'InvalidAddressError',
          message: 'Invalid address "kaspatest:qqnapngv3zxp305qf06w6hpzmyxtx2r99jjhs04lu980xdyd2ulwwmx9evrfz"',
        });
      });
    });

    describe('validateAmount', () => {
      let wallet;
      beforeEach(async () => {
        const request = sinon.stub(defaultOptions, 'request');
        stubActive(request, ADDRESSES.MAINNET[0].slice(0, 10));
        stubUtxos(request, ADDRESSES.MAINNET[0].slice(0, 10));
        stubFeerates(request);
        stubCsFee(request, CS_FEE);
        wallet = new Wallet({
          ...defaultOptions,
        });
        await wallet.open(WALLET_PUBLIC_KEY);
        await wallet.load();
        await wallet.loadFeeRates();
      });

      it('should be valid amount', async () => {
        const valid = await wallet.validateAmount({
          feeRate: Wallet.FEE_RATE_DEFAULT,
          address: SECOND_ADDRESS,
          amount: new Amount(2_0000_0000n, wallet.crypto.decimals),
          price: COIN_PRICE,
        });
        assert.ok(valid);
      });

      it('throw on zero amount', async () => {
        await assert.rejects(async () => {
          await wallet.validateAmount({
            feeRate: Wallet.FEE_RATE_DEFAULT,
            address: SECOND_ADDRESS,
            amount: new Amount(0n, wallet.crypto.decimals),
            price: COIN_PRICE,
          });
        }, {
          name: 'SmallAmountError',
          message: 'Small amount',
          amount: new Amount(1_0000_0000n, wallet.crypto.decimals),
        });
      });

      it('throw on small amount', async () => {
        await assert.rejects(async () => {
          await wallet.validateAmount({
            feeRate: Wallet.FEE_RATE_DEFAULT,
            address: SECOND_ADDRESS,
            amount: new Amount(1_0000_0000n - 1n, wallet.crypto.decimals),
            price: COIN_PRICE,
          });
        }, {
          name: 'SmallAmountError',
          message: 'Small amount',
          amount: new Amount(1_0000_0000n, wallet.crypto.decimals),
        });
      });

      it('throw on big amount', async () => {
        await assert.rejects(async () => {
          await wallet.validateAmount({
            feeRate: Wallet.FEE_RATE_DEFAULT,
            address: SECOND_ADDRESS,
            amount: new Amount(20_0000_0000n, wallet.crypto.decimals),
            price: COIN_PRICE,
          });
        }, {
          name: 'BigAmountError',
          message: 'Big amount',
          amount: new Amount(4_1621_6738n, wallet.crypto.decimals),
        });
      });
    });
  });

  describe('estimateMaxAmount', () => {
    it('should works for normal wallet', async () => {
      const request = sinon.stub(defaultOptions, 'request');
      stubActive(request, ADDRESSES.MAINNET[0].slice(0, 10));
      stubUtxos(request, ADDRESSES.MAINNET[0].slice(0, 10));
      stubFeerates(request);
      stubCsFee(request, CS_FEE);
      const wallet = new Wallet({
        ...defaultOptions,
      });
      await wallet.open(WALLET_PUBLIC_KEY);
      await wallet.load();
      await wallet.loadFeeRates();

      assert.equal(wallet.balance.value, 10_0000_0000n);
      const maxAmount = await wallet.estimateMaxAmount({
        address: SECOND_ADDRESS,
        feeRate: Wallet.FEE_RATE_DEFAULT,
        price: COIN_PRICE,
      });
      assert.equal(maxAmount.value, 4_1621_6738n);
      const maxAmountFastest = await wallet.estimateMaxAmount({
        address: SECOND_ADDRESS,
        feeRate: Wallet.FEE_RATE_FASTEST,
        price: COIN_PRICE,
      });
      assert.equal(maxAmountFastest.value, 4_1620_4638n);
    });

    it('should works for normal wallet with big price', async () => {
      const request = sinon.stub(defaultOptions, 'request');
      stubActive(request, ADDRESSES.MAINNET[0].slice(0, 10));
      stubUtxos(request, ADDRESSES.MAINNET[0].slice(0, 10));
      stubFeerates(request);
      stubCsFee(request, CS_FEE);
      const wallet = new Wallet({
        ...defaultOptions,
      });
      await wallet.open(WALLET_PUBLIC_KEY);
      await wallet.load();
      await wallet.loadFeeRates();

      assert.equal(wallet.balance.value, 10_0000_0000n);
      const maxAmount = await wallet.estimateMaxAmount({
        address: SECOND_ADDRESS,
        feeRate: Wallet.FEE_RATE_DEFAULT,
        price: 100,
      });
      assert.equal(maxAmount.value, 89_998_7900n);
      const maxAmountFastest = await wallet.estimateMaxAmount({
        address: SECOND_ADDRESS,
        feeRate: Wallet.FEE_RATE_FASTEST,
        price: 100,
      });
      assert.equal(maxAmountFastest.value, 89_997_5800n);
    });

    it('should works for normal wallet (no csfee)', async () => {
      const request = sinon.stub(defaultOptions, 'request');
      stubActive(request, ADDRESSES.MAINNET[0].slice(0, 10));
      stubUtxos(request, ADDRESSES.MAINNET[0].slice(0, 10));
      stubFeerates(request);
      stubCsFee(request, {});
      const wallet = new Wallet({
        ...defaultOptions,
      });
      await wallet.open(WALLET_PUBLIC_KEY);
      await wallet.load();
      await wallet.loadFeeRates();

      assert.equal(wallet.balance.value, 10_0000_0000n);
      const maxAmount = await wallet.estimateMaxAmount({
        address: SECOND_ADDRESS,
        feeRate: Wallet.FEE_RATE_DEFAULT,
        price: COIN_PRICE,
      });
      assert.equal(maxAmount.value, 9_9998_8314n);
      const maxAmountFastest = await wallet.estimateMaxAmount({
        address: SECOND_ADDRESS,
        feeRate: Wallet.FEE_RATE_FASTEST,
        price: COIN_PRICE,
      });
      assert.equal(maxAmountFastest.value, 9_9997_6628n);
    });

    it('should return 0 for empty wallet', async () => {
      const request = sinon.stub(defaultOptions, 'request');
      stubActive(request, ADDRESSES.MAINNET[0].slice(0, 10));
      stubUtxos(request, []);
      stubFeerates(request);
      stubCsFee(request, CS_FEE);
      const wallet = new Wallet({
        ...defaultOptions,
      });
      await wallet.open(WALLET_PUBLIC_KEY);
      await wallet.load();
      await wallet.loadFeeRates();

      assert.equal(wallet.balance.value, 0n);
      const maxAmount = await wallet.estimateMaxAmount({
        address: SECOND_ADDRESS,
        feeRate: Wallet.FEE_RATE_DEFAULT,
        price: COIN_PRICE,
      });
      assert.equal(maxAmount.value, 0n);
    });

    it('should return 0 for low balance', async () => {
      const request = sinon.stub(defaultOptions, 'request');
      stubActive(request, ADDRESSES.MAINNET[0].slice(0, 6));
      stubUtxos(request, ADDRESSES.MAINNET[0].slice(0, 6));
      stubFeerates(request);
      stubCsFee(request, CS_FEE);
      const wallet = new Wallet({
        ...defaultOptions,
      });
      await wallet.open(WALLET_PUBLIC_KEY);
      await wallet.load();
      await wallet.loadFeeRates();

      assert.equal(wallet.balance.value, 6_0000_0000n);
      const maxAmount = await wallet.estimateMaxAmount({
        address: SECOND_ADDRESS,
        feeRate: Wallet.FEE_RATE_DEFAULT,
        price: COIN_PRICE,
      });
      assert.equal(maxAmount.value, 0n);
    });

    it('should work for wallet with many dust inputs', async () => {
      const request = sinon.stub(defaultOptions, 'request');
      stubActive(request, ADDRESSES.MAINNET[0].slice(0, 1));
      stubUtxos(request, Array(100).fill({
        address: ADDRESSES.MAINNET[0][0],
        amount: 2_000_000n,
      }));
      stubFeerates(request);
      stubCsFee(request, CS_FEE);
      const wallet = new Wallet({
        ...defaultOptions,
      });
      await wallet.open(WALLET_PUBLIC_KEY);
      await wallet.load();
      await wallet.loadFeeRates();

      assert.equal(wallet.balance.value, 2_0000_0000n);
      const maxAmount = await wallet.estimateMaxAmount({
        address: SECOND_ADDRESS,
        feeRate: Wallet.FEE_RATE_DEFAULT,
        price: COIN_PRICE,
      });
      assert.equal(maxAmount.value, 0n);
    });

    it('should work for wallet with many big inputs', async () => {
      const request = sinon.stub(defaultOptions, 'request');
      stubActive(request, ADDRESSES.MAINNET[0].slice(0, 1));
      stubUtxos(request, Array(100).fill({
        address: ADDRESSES.MAINNET[0][0],
        amount: 1000n * SOMPI_PER_KASPA,
      }));
      stubFeerates(request);
      stubCsFee(request, CS_FEE);
      const wallet = new Wallet({
        ...defaultOptions,
      });
      await wallet.open(WALLET_PUBLIC_KEY);
      await wallet.load();
      await wallet.loadFeeRates();

      assert.equal(wallet.balance.value, 100000_0000_0000n);
      const maxAmount = await wallet.estimateMaxAmount({
        address: SECOND_ADDRESS,
        feeRate: Wallet.FEE_RATE_DEFAULT,
        price: COIN_PRICE,
      });
      assert.equal(maxAmount.value, 87562_1880_6665n);
    });

    it('should work for wallet with single big input', async () => {
      const request = sinon.stub(defaultOptions, 'request');
      stubActive(request, ADDRESSES.MAINNET[0].slice(0, 1));
      stubUtxos(request, [{
        address: ADDRESSES.MAINNET[0][0],
        amount: 1000n * SOMPI_PER_KASPA,
      }]);
      stubFeerates(request);
      stubCsFee(request, CS_FEE);
      const wallet = new Wallet({
        ...defaultOptions,
      });
      await wallet.open(WALLET_PUBLIC_KEY);
      await wallet.load();
      await wallet.loadFeeRates();

      assert.equal(wallet.balance.value, 100_00000_0000n);
      const maxAmount = await wallet.estimateMaxAmount({
        address: SECOND_ADDRESS,
        feeRate: Wallet.FEE_RATE_DEFAULT,
        price: COIN_PRICE,
      });
      assert.equal(maxAmount.value, 994_1622_6800n);
    });
  });

  describe('estimateTransactionFee', () => {
    it('should estimate transaction fee for normal wallet', async () => {
      const request = sinon.stub(defaultOptions, 'request');
      stubActive(request, ADDRESSES.MAINNET[0].slice(0, 10));
      stubUtxos(request, ADDRESSES.MAINNET[0].slice(0, 10));
      stubFeerates(request);
      stubCsFee(request, CS_FEE);
      const wallet = new Wallet({
        ...defaultOptions,
      });
      await wallet.open(WALLET_PUBLIC_KEY);
      await wallet.load();
      await wallet.loadFeeRates();

      assert.equal(wallet.balance.value, 10_0000_0000n);
      const feeMin = await wallet.estimateTransactionFee({
        address: SECOND_ADDRESS,
        amount: new Amount(SOMPI_PER_KASPA, wallet.crypto.decimals),
        feeRate: Wallet.FEE_RATE_DEFAULT,
        price: COIN_PRICE,
      });
      assert.equal(feeMin.value, 5_8378_0318n);
      const fee = await wallet.estimateTransactionFee({
        address: SECOND_ADDRESS,
        amount: new Amount(4n * SOMPI_PER_KASPA, wallet.crypto.decimals),
        feeRate: Wallet.FEE_RATE_DEFAULT,
        price: COIN_PRICE,
      });
      assert.equal(fee.value, 5_8378_3672n);
      const feeFastest = await wallet.estimateTransactionFee({
        address: SECOND_ADDRESS,
        amount: new Amount(4n * SOMPI_PER_KASPA, wallet.crypto.decimals),
        feeRate: Wallet.FEE_RATE_FASTEST,
        price: COIN_PRICE,
      });
      assert.equal(feeFastest.value, 5_8379_6182n);
      const feeMax = await wallet.estimateTransactionFee({
        address: SECOND_ADDRESS,
        amount: new Amount(4_1621_6738n, wallet.crypto.decimals), // max amount
        feeRate: Wallet.FEE_RATE_DEFAULT,
        price: COIN_PRICE,
      });
      assert.equal(feeMax.value, 5_8378_3262n);
      const feeMaxDust = await wallet.estimateTransactionFee({
        address: SECOND_ADDRESS,
        amount: new Amount(4_1621_6738n - 2_000_000n, wallet.crypto.decimals), // max amount - soft dust
        feeRate: Wallet.FEE_RATE_DEFAULT,
        price: COIN_PRICE,
      });
      // soft dust goes to fee
      assert.equal(feeMaxDust.value, 5_8578_3262n);
    });

    it('should estimate transaction fee for normal wallet with big price', async () => {
      const request = sinon.stub(defaultOptions, 'request');
      stubActive(request, ADDRESSES.MAINNET[0].slice(0, 10));
      stubUtxos(request, ADDRESSES.MAINNET[0].slice(0, 10));
      stubFeerates(request);
      stubCsFee(request, CS_FEE);
      const wallet = new Wallet({
        ...defaultOptions,
      });
      await wallet.open(WALLET_PUBLIC_KEY);
      await wallet.load();
      await wallet.loadFeeRates();

      assert.equal(wallet.balance.value, 10_0000_0000n);

      const feeMin = await wallet.estimateTransactionFee({
        address: SECOND_ADDRESS,
        amount: new Amount(SOMPI_PER_KASPA, wallet.crypto.decimals),
        feeRate: Wallet.FEE_RATE_DEFAULT,
        price: 10,
      });
      assert.equal(feeMin.value, 1_0000_4684n);

      const fee = await wallet.estimateTransactionFee({
        address: SECOND_ADDRESS,
        amount: new Amount(4n * SOMPI_PER_KASPA, wallet.crypto.decimals),
        feeRate: Wallet.FEE_RATE_DEFAULT,
        price: 10,
      });
      assert.equal(fee.value, 1_0000_8038n);

      const feeFastest = await wallet.estimateTransactionFee({
        address: SECOND_ADDRESS,
        amount: new Amount(4n * SOMPI_PER_KASPA, wallet.crypto.decimals),
        feeRate: Wallet.FEE_RATE_FASTEST,
        price: 10,
      });
      assert.equal(feeFastest.value, 1_0001_6076n);

      const feeMax = await wallet.estimateTransactionFee({
        address: SECOND_ADDRESS,
        amount: new Amount(89_998_7900n, wallet.crypto.decimals), // max amount
        feeRate: Wallet.FEE_RATE_DEFAULT,
        price: 10,
      });
      assert.equal(feeMax.value, 1_0001_2100n);

      const feeMaxDust = await wallet.estimateTransactionFee({
        address: SECOND_ADDRESS,
        amount: new Amount(89_998_7900n - 2_000_000n, wallet.crypto.decimals), // max amount - soft dust
        feeRate: Wallet.FEE_RATE_DEFAULT,
        price: 10,
      });
      // soft dust goes to fee
      assert.equal(feeMaxDust.value, 1_0201_2100n);
    });

    it('should estimate transaction fee for wallet with big inputs', async () => {
      const request = sinon.stub(defaultOptions, 'request');
      stubActive(request, ADDRESSES.MAINNET[0].slice(0, 1));
      stubUtxos(request, Array(100).fill({
        address: ADDRESSES.MAINNET[0][0],
        amount: 1000n * SOMPI_PER_KASPA,
      }));
      stubFeerates(request);
      stubCsFee(request, CS_FEE);
      const wallet = new Wallet({
        ...defaultOptions,
      });
      await wallet.open(WALLET_PUBLIC_KEY);
      await wallet.load();
      await wallet.loadFeeRates();

      assert.equal(wallet.balance.value, 100000_0000_0000n);

      const feeMin = await wallet.estimateTransactionFee({
        address: SECOND_ADDRESS,
        amount: new Amount(SOMPI_PER_KASPA, wallet.crypto.decimals),
        feeRate: Wallet.FEE_RATE_DEFAULT,
        price: COIN_PRICE,
      });
      assert.equal(feeMin.value, 5_8378_2874n);

      const fee = await wallet.estimateTransactionFee({
        address: SECOND_ADDRESS,
        amount: new Amount(4n * SOMPI_PER_KASPA, wallet.crypto.decimals),
        feeRate: Wallet.FEE_RATE_DEFAULT,
        price: COIN_PRICE,
      });
      assert.equal(fee.value, 5_8377_5374n);

      const feeFastest = await wallet.estimateTransactionFee({
        address: SECOND_ADDRESS,
        amount: new Amount(4n * SOMPI_PER_KASPA, wallet.crypto.decimals),
        feeRate: Wallet.FEE_RATE_FASTEST,
        price: COIN_PRICE,
      });
      assert.equal(feeFastest.value, 5_8377_9586n);

      const feeMax = await wallet.estimateTransactionFee({
        address: SECOND_ADDRESS,
        amount: new Amount(994_1622_6800n, wallet.crypto.decimals), // max amount
        feeRate: Wallet.FEE_RATE_DEFAULT,
        price: COIN_PRICE,
      });
      assert.equal(feeMax.value, 5_8377_3200n);

      const feeMaxDust = await wallet.estimateTransactionFee({
        address: SECOND_ADDRESS,
        amount: new Amount(994_1622_6800n - 2_000_000n, wallet.crypto.decimals), // max amount - soft dust
        feeRate: Wallet.FEE_RATE_DEFAULT,
        price: COIN_PRICE,
      });
      assert.equal(feeMaxDust.value, 5_8377_4728n);
    });
  });

  describe('createTransaction', () => {
    it('should works', async () => {
      const request = sinon.stub(defaultOptions, 'request');
      stubActive(request, ADDRESSES.MAINNET[0].slice(0, 10));
      stubUtxos(request, ADDRESSES.MAINNET[0], 2000n * SOMPI_PER_KASPA);
      stubFeerates(request);
      stubCsFee(request, CS_FEE);
      stubSubmitTransaction(request, TRANSACTIONS_RAW[0]);
      const wallet = new Wallet({
        ...defaultOptions,
      });
      await wallet.open(WALLET_PUBLIC_KEY);
      await wallet.load();
      await wallet.loadFeeRates();

      assert.equal(wallet.balance.value, 20000_0000_0000n);
      const amount = new Amount(2000n * SOMPI_PER_KASPA, wallet.crypto.decimals);
      const estimate = await wallet.estimateTransactionFee({
        feeRate: Wallet.FEE_RATE_DEFAULT,
        address: SECOND_ADDRESS,
        amount,
        price: COIN_PRICE,
      });
      const id = await wallet.createTransaction({
        feeRate: Wallet.FEE_RATE_DEFAULT,
        address: SECOND_ADDRESS,
        amount,
        price: COIN_PRICE,
      }, WALLET_SEED, new Uint8Array(32).fill(0));
      assert.equal(wallet.balance.value, 20000_0000_0000n - amount.value - estimate.value);
      assert(id);
    });

    it('should create sequential transactions without reload', async () => {
      const request = sinon.stub(defaultOptions, 'request');
      stubActive(request, [ADDRESSES.MAINNET[0][0]]);
      stubUtxos(request, [ADDRESSES.MAINNET[0][0]], 2000n * SOMPI_PER_KASPA);
      stubFeerates(request);
      stubCsFee(request, CS_FEE);
      stubSubmitTransaction(request, sinon.match.object);
      const wallet = new Wallet({
        ...defaultOptions,
      });
      await wallet.open(WALLET_PUBLIC_KEY);
      await wallet.load();
      await wallet.loadFeeRates();

      for (const value of [10n, 50n, 100n, 1000n, 10n, 2n, 1n, 1n]) {
        const balance = wallet.balance.value;
        const amount = new Amount(value * SOMPI_PER_KASPA, wallet.crypto.decimals);
        assert(balance > 0n);
        const estimate = await wallet.estimateTransactionFee({
          feeRate: Wallet.FEE_RATE_DEFAULT,
          address: SECOND_ADDRESS,
          amount,
          price: COIN_PRICE,
        });
        const id = await wallet.createTransaction({
          feeRate: Wallet.FEE_RATE_DEFAULT,
          address: SECOND_ADDRESS,
          amount,
          price: COIN_PRICE,
        }, WALLET_SEED, new Uint8Array(32).fill(0));
        assert.equal(wallet.balance.value, balance - amount.value - estimate.value);
        assert(id);
      }
    });

    it('should works tx to own wallet', async () => {
      const request = sinon.stub(defaultOptions, 'request');
      stubActive(request, ADDRESSES.MAINNET[0].slice(0, 10));
      stubUtxos(request, ADDRESSES.MAINNET[0], 2000n * SOMPI_PER_KASPA);
      stubFeerates(request);
      stubCsFee(request, CS_FEE);
      stubSubmitTransaction(request, TRANSACTIONS_RAW[1]);
      const wallet = new Wallet({
        ...defaultOptions,
      });
      await wallet.open(WALLET_PUBLIC_KEY);
      await wallet.load();
      await wallet.loadFeeRates();

      assert.equal(wallet.balance.value, 20000_0000_0000n);
      assert.equal(wallet.address, ADDRESSES.MAINNET[0][10]);
      const amount = new Amount(2000n * SOMPI_PER_KASPA, wallet.crypto.decimals);
      const estimate = await wallet.estimateTransactionFee({
        feeRate: Wallet.FEE_RATE_DEFAULT,
        address: SECOND_ADDRESS,
        amount,
        price: COIN_PRICE,
      });
      const id = await wallet.createTransaction({
        feeRate: Wallet.FEE_RATE_DEFAULT,
        address: ADDRESSES.MAINNET[0][10],
        amount,
        price: COIN_PRICE,
      }, WALLET_SEED, new Uint8Array(32).fill(0));
      assert.equal(wallet.balance.value, 20000_0000_0000n - estimate.value);
      assert.equal(wallet.address, ADDRESSES.MAINNET[0][11]);
      assert(id);
    });

    it('should works (no csfee)', async () => {
      const request = sinon.stub(defaultOptions, 'request');
      stubActive(request, ADDRESSES.MAINNET[0].slice(0, 10));
      stubUtxos(request, ADDRESSES.MAINNET[0], 2000n * SOMPI_PER_KASPA);
      stubFeerates(request);
      stubCsFee(request, {});
      stubSubmitTransaction(request, TRANSACTIONS_RAW[2]);
      const wallet = new Wallet({
        ...defaultOptions,
      });
      await wallet.open(WALLET_PUBLIC_KEY);
      await wallet.load();
      await wallet.loadFeeRates();

      assert.equal(wallet.balance.value, 20000_0000_0000n);
      const amount = new Amount(2n * SOMPI_PER_KASPA, wallet.crypto.decimals);
      const estimate = await wallet.estimateTransactionFee({
        feeRate: Wallet.FEE_RATE_DEFAULT,
        address: SECOND_ADDRESS,
        amount,
        price: COIN_PRICE,
      });
      const id = await wallet.createTransaction({
        feeRate: Wallet.FEE_RATE_DEFAULT,
        address: SECOND_ADDRESS,
        amount,
        price: COIN_PRICE,
      }, WALLET_SEED, new Uint8Array(32).fill(0));
      assert.equal(wallet.balance.value, 20000_0000_0000n - amount.value - estimate.value);
      assert(id);
    });

    for (const inputAmount of [1n, 5n, 10n, 50n, 100n, 200n, 1000n]) {
      it(`should works (max amount, inputs ${inputAmount} KAS)`, async () => {
        const request = sinon.stub(defaultOptions, 'request');
        stubActive(request, ADDRESSES.MAINNET[0].slice(0, 10));
        stubUtxos(request, ADDRESSES.MAINNET[0].slice(0, 10), inputAmount * SOMPI_PER_KASPA);
        stubFeerates(request);
        stubCsFee(request, CS_FEE);
        stubSubmitTransaction(request, sinon.match.object);
        const wallet = new Wallet({
          ...defaultOptions,
        });
        await wallet.open(WALLET_PUBLIC_KEY);
        await wallet.load();
        await wallet.loadFeeRates();

        const balance = wallet.balance.value;
        assert.equal(balance, 10n * inputAmount * SOMPI_PER_KASPA);
        const amount = await wallet.estimateMaxAmount({
          address: SECOND_ADDRESS,
          feeRate: Wallet.FEE_RATE_DEFAULT,
          price: COIN_PRICE,
        });
        const estimate = await wallet.estimateTransactionFee({
          feeRate: Wallet.FEE_RATE_DEFAULT,
          address: SECOND_ADDRESS,
          amount,
          price: COIN_PRICE,
        });
        const id = await wallet.createTransaction({
          feeRate: Wallet.FEE_RATE_DEFAULT,
          address: SECOND_ADDRESS,
          amount,
          price: COIN_PRICE,
        }, WALLET_SEED, new Uint8Array(32).fill(0));
        assert.equal(wallet.balance.value, balance - amount.value - estimate.value);
        assert(id);
      });
    }

    for (const inputAmount of [1n, 5n, 10n, 50n, 100n, 200n, 1000n]) {
      it(`should works (min amount, inputs ${inputAmount} KAS)`, async () => {
        const request = sinon.stub(defaultOptions, 'request');
        stubActive(request, ADDRESSES.MAINNET[0].slice(0, 10));
        stubUtxos(request, ADDRESSES.MAINNET[0].slice(0, 10), inputAmount * SOMPI_PER_KASPA);
        stubFeerates(request);
        stubCsFee(request, CS_FEE);
        stubSubmitTransaction(request, sinon.match.object);
        const wallet = new Wallet({
          ...defaultOptions,
        });
        await wallet.open(WALLET_PUBLIC_KEY);
        await wallet.load();
        await wallet.loadFeeRates();

        const balance = wallet.balance.value;
        assert.equal(balance, 10n * inputAmount * SOMPI_PER_KASPA);
        const amount = new Amount(1n * SOMPI_PER_KASPA, wallet.crypto.decimals);
        const estimate = await wallet.estimateTransactionFee({
          feeRate: Wallet.FEE_RATE_DEFAULT,
          address: SECOND_ADDRESS,
          amount,
          price: COIN_PRICE,
        });
        const id = await wallet.createTransaction({
          feeRate: Wallet.FEE_RATE_DEFAULT,
          address: SECOND_ADDRESS,
          amount,
          price: COIN_PRICE,
        }, WALLET_SEED, new Uint8Array(32).fill(0));
        assert.equal(wallet.balance.value, balance - amount.value - estimate.value);
        assert(id);
      });
    }
  });

  describe('loadTransactions', () => {
    it('should load transactions', async () => {
      const request = sinon.stub(defaultOptions, 'request');
      stubActive(request, [
        ...ADDRESSES.MAINNET[0],
        ...ADDRESSES.MAINNET[1],
      ]);
      stubUtxos(request, [
        ...ADDRESSES.MAINNET[0],
        ...ADDRESSES.MAINNET[1],
      ]);
      stubLoadTransactions(request, TRANSACTIONS);
      const wallet = new Wallet({
        ...defaultOptions,
      });
      await wallet.open(WALLET_PUBLIC_KEY);
      await wallet.load();

      const res = await wallet.loadTransactions();
      assert.equal(res.hasMore, false);
      assert.equal(res.transactions.length, 8);
      assert.equal(res.transactions[0].incoming, false);
      assert.equal(res.transactions[0].amount.value, 36042564827n);
      assert.equal(res.transactions[0].fee.value, 240287954n);
      assert.equal(res.transactions[1].incoming, true);
      assert.equal(res.transactions[1].amount.value, 12384574511n);
      assert.equal(res.transactions[1].fee.value, 3154n);
    });

    it('should load empty wallet', async () => {
      const request = sinon.stub(defaultOptions, 'request');
      stubActive(request, []);
      stubUtxos(request, []);
      stubLoadTransactions(request, []);
      const wallet = new Wallet({
        ...defaultOptions,
      });
      await wallet.open(WALLET_PUBLIC_KEY);
      await wallet.load();

      const res = await wallet.loadTransactions();
      assert.equal(res.hasMore, false);
      assert.equal(res.transactions.length, 0);
    });
  });
});
