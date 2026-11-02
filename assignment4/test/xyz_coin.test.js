const XYZCoin = artifacts.require("XYZCoin");
const truffleAssert = require("truffle-assertions");

contract("XYZCoin", accounts => {
  const [owner, alice, bob, spender] = accounts;
  let coin;
  beforeEach(async () => { coin = await XYZCoin.new({ from: owner }); });
  it("sets metadata and gives the complete supply to the creator", async () => {
    assert.equal(await coin.name(), "XYZCoin");
    assert.equal(await coin.symbol(), "XYZ");
    assert.equal((await coin.decimals()).toString(), "0");
    assert.equal((await coin.totalSupply()).toString(), "1000");
    assert.equal((await coin.balanceOf(owner)).toString(), "1000");
    assert.equal((await coin.balanceOf(alice)).toString(), "0");
  });
  it("transfers tokens and emits Transfer with exact values", async () => {
    assert.equal(await coin.transfer.call(alice, 125, { from: owner }), true);
    const tx = await coin.transfer(alice, 125, { from: owner });
    assert.equal((await coin.balanceOf(owner)).toString(), "875");
    assert.equal((await coin.balanceOf(alice)).toString(), "125");
    truffleAssert.eventEmitted(tx, "Transfer", e => e.from === owner && e.to === alice && e.value.toString() === "125");
  });
  it("sets, reads, replaces and revokes allowance and emits Approval", async () => {
    const tx = await coin.approve(spender, 70, { from: owner });
    assert.equal((await coin.allowance(owner, spender)).toString(), "70");
    truffleAssert.eventEmitted(tx, "Approval", e => e.owner === owner && e.spender === spender && e.value.toString() === "70");
    await coin.approve(spender, 20, { from: owner });
    assert.equal((await coin.allowance(owner, spender)).toString(), "20");
    await coin.approve(spender, 0, { from: owner });
    assert.equal((await coin.allowance(owner, spender)).toString(), "0");
  });
  it("transfers on behalf of the owner and consumes allowance", async () => {
    await coin.approve(spender, 70, { from: owner });
    const tx = await coin.transferFrom(owner, bob, 30, { from: spender });
    assert.equal((await coin.balanceOf(owner)).toString(), "970");
    assert.equal((await coin.balanceOf(bob)).toString(), "30");
    assert.equal((await coin.allowance(owner, spender)).toString(), "40");
    truffleAssert.eventEmitted(tx, "Transfer", e => e.from === owner && e.to === bob && e.value.toString() === "30");
  });
  it("reverts an insufficient-balance transfer without changing balances", async () => {
    await truffleAssert.reverts(coin.transfer(bob, 1, { from: alice }), "SafeMath: subtraction underflow");
    assert.equal((await coin.balanceOf(alice)).toString(), "0");
    assert.equal((await coin.balanceOf(bob)).toString(), "0");
  });
  it("reverts a positive transfer without authorization", async () => {
    await truffleAssert.reverts(coin.transferFrom(owner, bob, 1, { from: spender }), "SafeMath: subtraction underflow");
  });
  it("reverts spending beyond allowance", async () => {
    await coin.approve(spender, 10, { from: owner });
    await truffleAssert.reverts(coin.transferFrom(owner, bob, 11, { from: spender }), "SafeMath: subtraction underflow");
    assert.equal((await coin.allowance(owner, spender)).toString(), "10");
  });
  it("rolls allowance back if the owner's balance is insufficient", async () => {
    await coin.approve(spender, 1001, { from: owner });
    await truffleAssert.reverts(coin.transferFrom(owner, bob, 1001, { from: spender }), "SafeMath: subtraction underflow");
    assert.equal((await coin.allowance(owner, spender)).toString(), "1001");
    assert.equal((await coin.balanceOf(owner)).toString(), "1000");
  });
  it("emits Transfer for a zero-value transfer", async () => {
    const tx = await coin.transfer(bob, 0, { from: alice });
    truffleAssert.eventEmitted(tx, "Transfer", e => e.from === alice && e.to === bob && e.value.toString() === "0");
  });
  it("emits Transfer for zero-value transferFrom with zero allowance", async () => {
    const tx = await coin.transferFrom(alice, bob, 0, { from: spender });
    truffleAssert.eventEmitted(tx, "Transfer", e => e.from === alice && e.to === bob && e.value.toString() === "0");
    assert.equal((await coin.allowance(alice, spender)).toString(), "0");
  });
  it("preserves the balance on self-transfer", async () => {
    await coin.transfer(owner, 100, { from: owner });
    assert.equal((await coin.balanceOf(owner)).toString(), "1000");
  });
  it("rejects the zero recipient and conserves total supply across transfers", async () => {
    await truffleAssert.reverts(coin.transfer("0x0000000000000000000000000000000000000000", 1), "XYZCoin: zero recipient");
    await coin.transfer(alice, 100, { from: owner });
    await coin.transfer(bob, 40, { from: alice });
    const sum = (await coin.balanceOf(owner)).add(await coin.balanceOf(alice)).add(await coin.balanceOf(bob));
    assert.equal(sum.toString(), (await coin.totalSupply()).toString());
  });
});
