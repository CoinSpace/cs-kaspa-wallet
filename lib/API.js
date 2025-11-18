
import {
  errors,
} from '@coinspace/cs-common';
import {
  hexToBytes,
} from 'kaspalib';

const CHUNK = 10;

export default class API {
  #wallet;
  constructor(wallet) {
    this.#wallet = wallet;
    this.feerates = this.#wallet.memoize(this.feerates);
  }

  cleanup() {
    this.#wallet.memoizeClear(this.feerates);
  }

  async active(addresses) {
    const res = await this.#wallet.requestNode({
      method: 'GET',
      url: `api/v1/addresses/${addresses.join(',')}/active`,
    });
    return res;
  }

  async utxos(addresses) {
    const utxos = [];
    for (let i = 0; i < addresses.length; i += CHUNK) {
      const res = await this.#wallet.requestNode({
        method: 'GET',
        url: `api/v1/addresses/${addresses.slice(i, i + CHUNK).join(',')}/utxos`,
      });
      utxos.push(...res);
    }
    return utxos.map((item) => {
      return {
        address: item.address,
        utxo: {
          transactionId: hexToBytes(item.outpoint.transactionId),
          index: parseInt(item.outpoint.index),
          amount: BigInt(item.utxoEntry.amount),
          script: hexToBytes(item.utxoEntry.scriptPublicKey.scriptPublicKey),
          daaScore: item.utxoEntry.blockDaaScore,
        },
      };
    });
  }

  async feerates() {
    const res = await this.#wallet.requestNode({
      method: 'GET',
      url: 'api/v1/info/feerates',
    });
    return res;
  }

  async submutTrandsaction(transaction) {
    const res = await this.#wallet.requestNode({
      method: 'POST',
      url: 'api/v1/transaction/submit',
      data: {
        transaction,
      },
    });
    if (!res) {
      throw new errors.InternalWalletError('empty response', {
        cause: transaction,
      });
    }
    if (res.error) {
      throw new errors.InternalWalletError(res.error, {
        cause: transaction,
      });
    }
    return res.transactionId;
  }

  async getTransactions(addresses) {
    const transactions = new Map();
    for (let i = 0; i < addresses.length; i += CHUNK) {
      const res = await this.#wallet.requestNode({
        method: 'GET',
        url: `api/v1/addresses/${addresses.slice(i, i + CHUNK).join(',')}/transactions`,
      });
      for (const item of res) {
        transactions.set(item.transaction_id, item);
      }
    }
    return [...transactions.values()];
  }
}
