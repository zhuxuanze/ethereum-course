const FlawedVoting = artifacts.require("FlawedVoting");
const FixedVoting = artifacts.require("FixedVoting");
const truffleAssert = require("truffle-assertions");

contract("Voting arithmetic regression", ([owner, voter, attacker]) => {
  const ether = amount => web3.utils.toWei(String(amount), "ether");
  it("reproduces the original underflow and unauthorized payout on the local chain", async () => {
    const flawed = await FlawedVoting.new(2, { from: owner });
    await flawed.buyVotes({ from: voter, value: ether(2) });
    await flawed.vote(0, 1, { from: attacker });
    assert.equal((await flawed.remainingVotes(attacker)).toString(), ((1n << 256n) - 1n).toString());
    await flawed.payoutVotes(1, { from: attacker });
    assert.equal(await web3.eth.getBalance(flawed.address), ether(1));
  });
  it("rejects the same attack and preserves the funded contract balance", async () => {
    const fixed = await FixedVoting.new(2, { from: owner });
    await fixed.buyVotes({ from: voter, value: ether(2) });
    await truffleAssert.reverts(fixed.vote(0, 1, { from: attacker }), "SafeMath: subtraction underflow");
    await truffleAssert.reverts(fixed.payoutVotes(1, { from: attacker }), "SafeMath: subtraction underflow");
    assert.equal((await fixed.remainingVotes(attacker)).toString(), "0");
    assert.equal((await fixed.candidates(0)).toString(), "0");
    assert.equal(await web3.eth.getBalance(fixed.address), ether(2));
  });
  it("refunds fractional Ether, counts votes and pays out unspent votes", async () => {
    const fixed = await FixedVoting.new(2, { from: owner });
    await fixed.buyVotes({ from: voter, value: ether(2.5) });
    assert.equal(await web3.eth.getBalance(fixed.address), ether(2));
    await fixed.vote(1, 1, { from: voter });
    await fixed.payoutVotes(1, { from: voter });
    assert.equal((await fixed.candidates(1)).toString(), "1");
    assert.equal((await fixed.remainingVotes(voter)).toString(), "0");
    assert.equal(await web3.eth.getBalance(fixed.address), ether(1));
  });
  it("rejects invalid candidates and restricts ending to the owner", async () => {
    const fixed = await FixedVoting.new(2, { from: owner });
    await fixed.buyVotes({ from: voter, value: ether(1) });
    await truffleAssert.reverts(fixed.vote(2, 0, { from: voter }), "Invalid candidate");
    await truffleAssert.reverts(fixed.endVoting({ from: attacker }), "Owner only");
    await fixed.endVoting({ from: owner });
    assert.equal(await web3.eth.getBalance(fixed.address), "0");
    await truffleAssert.reverts(fixed.vote(0, 0, { from: voter }), "Voting ended");
    await truffleAssert.reverts(fixed.buyVotes({ from: voter, value: ether(1) }), "Voting ended");
    await truffleAssert.reverts(fixed.payoutVotes(0, { from: voter }), "Voting ended");
  });
});
