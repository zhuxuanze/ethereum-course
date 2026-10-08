const getter = (name) => ({
  type: 'function', name, inputs: [],
  outputs: [{ name: '', type: 'uint256' }],
  stateMutability: 'view',
});

module.exports = [
  ...['minimumBet', 'totalBet', 'numberOfBets', 'maxAmountOfBets',
    'numberWinner', 'LIMIT_AMOUNT_BETS'].map(getter),
  {
    type: 'function', name: 'checkPlayerExists',
    inputs: [{ name: 'player', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function', name: 'bet',
    inputs: [{ name: 'numberToBet', type: 'uint256' }],
    outputs: [], stateMutability: 'payable',
  },
];
