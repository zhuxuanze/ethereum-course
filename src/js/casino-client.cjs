const { Web3 } = require('web3');
const ABI = require('./casino-abi.cjs');
const config = require('./config.cjs');

function errorMessage(error) {
  if (Number(error?.code) === 4001) return 'The wallet request was rejected.';
  if (Number(error?.code) === -32002) return 'A wallet request is already open. Check MetaMask.';
  return error?.cause?.message || error?.message || String(error);
}

function validateBet(number, amount, snapshot) {
  if (!Number.isInteger(number) || number < 1 || number > 10) {
    throw new Error('Choose an integer from 1 to 10.');
  }
  if (!/^\d+(\.\d{1,18})?$/.test(amount)) {
    throw new Error('Enter an ETH amount with at most 18 decimal places.');
  }
  const value = BigInt(Web3.utils.toWei(amount, 'ether'));
  if (value <= 0n || value < BigInt(snapshot.minimumBet)) {
    throw new Error(`The minimum bet is ${Web3.utils.fromWei(snapshot.minimumBet, 'ether')} Sepolia ETH.`);
  }
  if (snapshot.playerExists) {
    throw new Error('This account already has a recorded bet. Use another funded Sepolia account.');
  }
  if (BigInt(snapshot.numberOfBets) >= BigInt(snapshot.maxAmountOfBets)) {
    throw new Error('Betting is closed. The contract is waiting for its oracle callback and prize distribution.');
  }
  return value.toString();
}

function receiptSucceeded(status) {
  return status === true || status === 1 || status === 1n || status === '1' || status === '0x1';
}

class CasinoClient {
  constructor(provider, address = config.contractAddress) {
    this.provider = provider;
    this.web3 = new Web3(provider);
    this.casino = new this.web3.eth.Contract(ABI, address);
    this.account = '';
  }

  async assertSepolia() {
    const chain = await this.provider.request({ method: 'eth_chainId' });
    if (BigInt(chain) !== BigInt(config.chainId)) {
      throw new Error('Select Sepolia Test Network in MetaMask, then reconnect.');
    }
  }

  async connect(prompt = true) {
    await this.assertSepolia();
    const accounts = await this.provider.request({
      method: prompt ? 'eth_requestAccounts' : 'eth_accounts',
    });
    this.account = accounts[0] || '';
    if (!this.account) throw new Error('Connect a MetaMask account first.');
    return this.readSnapshot();
  }

  async readSnapshot() {
    await this.assertSepolia();
    if (!this.account) throw new Error('Connect a MetaMask account first.');
    const account = this.account;
    const block = await this.web3.eth.getBlockNumber();
    const code = await this.web3.eth.getCode(this.casino.options.address, block);
    if (!code || /^0x0*$/.test(code)) throw new Error('No Casino contract was found at this Sepolia address.');
    const names = ['minimumBet', 'totalBet', 'numberOfBets', 'maxAmountOfBets', 'numberWinner'];
    const values = await Promise.all(names.map(name => this.casino.methods[name]().call({}, block)));
    // eth_call simulates the non-view check; it does not send a paid transaction.
    const playerExists = await this.casino.methods.checkPlayerExists(account).call({ from: account }, block);
    await this.assertSepolia();
    if (account !== this.account) throw new Error('The account changed; reconnect to refresh the data.');
    return {
      ...Object.fromEntries(names.map((name, i) => [name, values[i].toString()])),
      playerExists, account, block: block.toString(),
    };
  }

  async placeBet(number, amount, onHash = () => {}) {
    const snapshot = await this.readSnapshot();
    const account = snapshot.account;
    const value = validateBet(number, amount, snapshot);
    const tx = this.casino.methods.bet(number);
    const estimate = await tx.estimateGas({ from: account, value });
    await this.assertSepolia();
    const accounts = await this.provider.request({ method: 'eth_accounts' });
    if (!accounts[0] || accounts[0].toLowerCase() !== account.toLowerCase()) {
      throw new Error('The wallet account changed. Reconnect before betting.');
    }
    const gas = (BigInt(estimate) * 120n + 99n) / 100n;
    const receipt = await tx.send({ from: account, value, gas: gas.toString() })
      .on('transactionHash', onHash);
    if (!receiptSucceeded(receipt.status)) throw new Error('The transaction was included but failed. Check its Etherscan receipt.');
    return receipt;
  }
}

module.exports = { CasinoClient, validateBet, receiptSucceeded, errorMessage };
