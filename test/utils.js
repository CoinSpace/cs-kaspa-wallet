import sinon from 'sinon';

import {
  bytesToHex,
} from 'kaspalib/utils.js';
import {
  Address,
  OutScript,
  SOMPI_PER_KASPA,
} from 'kaspalib';

export function stubActive(request, activeAddresses = []) {
  let counter = 1762935671752;
  request.withArgs({
    seed: 'device',
    method: 'GET',
    url: sinon.match(/api\/v1\/addresses\/([^/]+)\/active/),
    baseURL: 'node',
    headers: sinon.match.object,
  }).callsFake((args) => {
    counter++;
    const addresses = args.url.match(/api\/v1\/addresses\/([^/]+)\/active/)[1].split(',');
    return addresses.map((address) => {
      return {
        address,
        active: activeAddresses.includes(address),
        lastTxBlockTime: counter,
      };
    });
  });
}

export function stubUtxos(request, utxos = [], amount = SOMPI_PER_KASPA) {
  let counter = 1762935671752;
  request.withArgs({
    seed: 'device',
    method: 'GET',
    url: sinon.match(/api\/v1\/addresses\/([^/]+)\/utxos/),
    baseURL: 'node',
    headers: sinon.match.object,
  }).callsFake((args) => {
    counter++;
    const addresses = args.url.match(/api\/v1\/addresses\/([^/]+)\/utxos/)[1].split(',');
    return addresses.map((address) => {
      const items = utxos.filter((item) => item === address || item.address === address);
      return items.map((utxo) => {
        utxo = typeof utxo === 'string' ? { address: utxo } : utxo;
        return {
          address,
          outpoint: {
            transactionId: counter.toString(16).padStart(64, '0'),
            index: 0,
          },
          utxoEntry: {
            amount: `${utxo.amount ?? amount}`,
            scriptPublicKey: {
              scriptPublicKey: bytesToHex(OutScript.encode({ version: 0, ...Address().decode(address) }).script),
            },
            blockDaaScore: utxo.blockDaaScore ?? counter,
            isCoinbase: false,
          },
        };
      });
    }).flat();
  });
}

export function stubFeerates(request) {
  request.withArgs({
    seed: 'device',
    method: 'GET',
    url: 'api/v1/info/feerates',
    baseURL: 'node',
    headers: sinon.match.object,
  }).callsFake(() => {
    return [{
      name: 'default',
      value: 1,
    }, {
      name: 'fastest',
      value: 2,
    }];
  });
}

export function stubCsFee(request, csFee) {
  request.withArgs({
    seed: 'device',
    method: 'GET',
    url: 'api/v4/csfee',
    params: { crypto: 'kaspa@kaspa' },
  }).resolves(csFee);
}

export function stubSubmitTransaction(request, transaction) {
  request.withArgs({
    seed: 'device',
    method: 'POST',
    url: 'api/v1/transaction/submit',
    baseURL: 'node',
    data: { transaction },
    headers: sinon.match.object,
  }).resolves({ transactionId: '01'.repeat(32) });
}

export function stubLoadTransactions(request, transactions) {
  request.withArgs({
    seed: 'device',
    method: 'GET',
    url: sinon.match(/api\/v1\/addresses\/([^/]+)\/transactions/),
    baseURL: 'node',
    headers: sinon.match.object,
  }).callsFake(() => {
    return transactions;
  });
}
