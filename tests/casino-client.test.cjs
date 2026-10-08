const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Web3 } = require('web3');
const { CasinoClient, validateBet, receiptSucceeded } = require('../src/js/casino-client.cjs');
const ABI = require('../src/js/casino-abi.cjs');
const config = require('../src/js/config.cjs');
const abi = new Web3().eth.abi;
const account = '0x36d75c031f2e84683e4d19a2212f946a3a7bd792';
const other = '0x0000000000000000000000000000000000000001';
const state = { minimumBet: '100000000000000000', totalBet: '100000000000000000',
  numberOfBets: '1', maxAmountOfBets: '100', numberWinner: '0', playerExists: false };

function providerMock(overrides = {}) {
  const calls = [];
  let chain = config.chainId;
  const provider = {
    calls, on() {}, removeListener() {},
    setChain(value) { chain = value; },
    async request({ method, params }) {
      calls.push({ method, params });
      if (overrides[method]) return overrides[method](params);
      if (method === 'eth_chainId') return chain;
      if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [account];
      if (method === 'eth_blockNumber') return '0x123';
      if (method === 'eth_getCode') return '0x60006000';
      if (method === 'eth_call') {
        const entry = ABI.find(item => abi.encodeFunctionSignature(item) === params[0].data.slice(0, 10));
        const value = entry.name === 'checkPlayerExists' ? state.playerExists : state[entry.name];
        return abi.encodeParameter(entry.outputs[0].type, value);
      }
      throw new Error(`Unexpected RPC method: ${method}`);
    },
  };
  return provider;
}

test('all five displayed values and player eligibility are decoded from a single block', async () => {
  const provider = providerMock();
  const client = new CasinoClient(provider);
  const snapshot = await client.connect();
  assert.equal(snapshot.account.toLowerCase(), account);
  for (const key of Object.keys(state)) assert.equal(snapshot[key], state[key]);
  const reads = provider.calls.filter(call => call.method === 'eth_call');
  assert.equal(reads.length, 6);
  assert.ok(reads.every(call => call.params[1] === '0x123'));
  assert.ok(!provider.calls.some(call => call.method === 'eth_sendTransaction'));
});

test('mainnet is rejected before requesting access or sending a transaction', async () => {
  const provider = providerMock();
  provider.setChain('0x1');
  await assert.rejects(new CasinoClient(provider).connect(), /Select Sepolia/);
  assert.ok(!provider.calls.some(call => call.method === 'eth_requestAccounts'));
});

test('an address with no deployed contract is rejected', async () => {
  const client = new CasinoClient(providerMock({ eth_getCode: () => '0x' }));
  await assert.rejects(client.connect(), /No Casino contract/);
});

test('stake conversion is exact at the minimum and at 18-decimal precision', () => {
  assert.equal(validateBet(5, '0.1', state), '100000000000000000');
  assert.equal(validateBet(5, '0.100000000000000001', state), '100000000000000001');
  assert.throws(() => validateBet(5, '0.099999999999999999', state), /minimum bet/);
});

test('invalid numbers and malformed amounts are blocked before sending', () => {
  for (const number of [null, 0, 11, 1.5, '5']) assert.throws(() => validateBet(number, '0.1', state), /integer/);
  for (const amount of ['-1', 'NaN', '1e-1', '', '0.1000000000000000001']) {
    assert.throws(() => validateBet(5, amount, state), /ETH amount/);
  }
});

test('duplicate accounts and full rounds cannot submit a bet', () => {
  assert.throws(() => validateBet(5, '0.1', { ...state, playerExists: true }), /already/);
  assert.throws(() => validateBet(5, '0.1', { ...state, numberOfBets: '100' }), /closed/);
});

test('a rejected duplicate is stopped before gas estimation or sending', async () => {
  const client = new CasinoClient(providerMock());
  client.readSnapshot = async () => ({ ...state, account, playerExists: true });
  let requested = false;
  client.casino.methods.bet = () => { requested = true; throw new Error('Unexpected send'); };
  await assert.rejects(client.placeBet(5, '0.1'), /already/);
  assert.equal(requested, false);
});

test('account changes after gas estimation stop the transaction', async () => {
  const client = new CasinoClient(providerMock({ eth_accounts: () => [other] }));
  client.readSnapshot = async () => ({ ...state, account });
  let sent = false;
  client.casino.methods.bet = () => ({ estimateGas: async () => 100000n,
    send: () => { sent = true; } });
  await assert.rejects(client.placeBet(5, '0.1'), /account changed/);
  assert.equal(sent, false);
});

test('the bet sends the exact number, amount and estimated gas; waits for a successful receipt', async () => {
  const client = new CasinoClient(providerMock());
  client.readSnapshot = async () => ({ ...state, account });
  const hash = '0x' + 'ab'.repeat(32);
  let receivedHash = '';
  let sent;
  client.casino.methods.bet = number => {
    assert.equal(number, 5);
    return { estimateGas: async () => 100001n, send: args => {
      sent = args;
      const receipt = Promise.resolve({ status: 1n, transactionHash: hash });
      receipt.on = (event, callback) => { assert.equal(event, 'transactionHash'); callback(hash); return receipt; };
      return receipt;
    } };
  };
  const receipt = await client.placeBet(5, '0.1', hash => { receivedHash = hash; });
  assert.deepEqual(sent, { from: account, value: '100000000000000000', gas: '120002' });
  assert.equal(receivedHash, hash);
  assert.equal(receipt.transactionHash, hash);
});

test('failed receipt status is never interpreted as successful confirmation', () => {
  for (const status of [false, 0, 0n, '0', '0x0', undefined]) assert.equal(receiptSucceeded(status), false);
  for (const status of [true, 1, 1n, '1', '0x1']) assert.equal(receiptSucceeded(status), true);
});
