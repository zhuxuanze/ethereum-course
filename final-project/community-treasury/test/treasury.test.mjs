import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import ganache from 'ganache';
import { BrowserProvider, ContractFactory, ZeroAddress, ZeroHash, parseEther, keccak256, toUtf8Bytes } from 'ethers';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = Object.fromEntries(['CommunityTreasury', 'ToggleReceiver', 'ReentrantOwnerReceiver'].map(name => [name, JSON.parse(fs.readFileSync(path.join(ROOT, 'artifacts', `${name}.json`)))]));
const descriptionHash = keccak256(toUtf8Bytes('Contributor documentation reward'));
const results = [];
const gasObservations = [];
const startedAt = new Date().toISOString();

async function receipt(txPromise) {
  const tx = await txPromise;
  return await tx.wait();
}

async function deploy(name, signer, args = []) {
  const artifact = artifacts[name];
  const contract = await new ContractFactory(artifact.abi, artifact.bytecode, signer).deploy(...args);
  await contract.waitForDeployment();
  return contract;
}

async function fixture({ initialFunds = '5', maliciousOwner = false } = {}) {
  const raw = ganache.provider({
    logging: { quiet: true },
    chain: { chainId: 1337, hardfork: 'shanghai', time: new Date('2026-11-04T00:00:00Z') },
    wallet: { deterministic: true, totalAccounts: 8, defaultBalance: 1000 },
    miner: { blockGasLimit: 30_000_000 }
  });
  const provider = new BrowserProvider(raw, undefined, { cacheTimeout: -1 });
  provider.pollingInterval = 10;
  const signers = await Promise.all(Array.from({ length: 8 }, (_, index) => provider.getSigner(index)));
  const addresses = await Promise.all(signers.map(signer => signer.getAddress()));
  const attacker = maliciousOwner ? await deploy('ReentrantOwnerReceiver', signers[0]) : null;
  const owners = maliciousOwner ? [addresses[0], addresses[1], await attacker.getAddress()] : addresses.slice(0, 3);
  const treasury = await deploy('CommunityTreasury', signers[0], [owners]);
  const treasuryAddress = await treasury.getAddress();
  if (initialFunds !== '0') await receipt(signers[3].sendTransaction({ to: treasuryAddress, value: parseEther(initialFunds) }));
  return { raw, provider, signers, addresses, owners, treasury, treasuryAddress, attacker,
    async close() { provider.destroy(); await raw.disconnect(); } };
}

async function submit(f, { to = f.addresses[4], value = parseEther('1'), hash = descriptionHash, signer = f.signers[0] } = {}) {
  const id = await f.treasury.getTransactionCount();
  await receipt(f.treasury.connect(signer).submitTransaction(to, value, hash));
  return id;
}

async function approveTwo(f, id) {
  await receipt(f.treasury.connect(f.signers[0]).confirmTransaction(id));
  await receipt(f.treasury.connect(f.signers[1]).confirmTransaction(id));
}

function errorData(error) {
  const candidates = [error?.data, error?.info?.error?.data?.result, error?.info?.error?.data, error?.error?.data];
  return candidates.find(value => typeof value === 'string' && value.startsWith('0x'));
}

async function expectError(action, treasury, expectedName) {
  let caught;
  try { await action(); } catch (error) { caught = error; }
  assert.ok(caught, `Expected ${expectedName}`);
  const data = errorData(caught);
  assert.ok(data, `Missing revert data for ${expectedName}: ${caught.shortMessage ?? caught.message}`);
  assert.equal(treasury.interface.parseError(data)?.name, expectedName);
}

async function expectFailedReceipt(action) {
  let caught;
  try { await receipt(action()); } catch (error) { caught = error; }
  assert.ok(caught, 'Expected a mined reverting transaction');
  assert.equal(caught.receipt?.status, 0, 'Failure must be a mined revert, not a transport or estimation error');
}

function caseTest(name, fn, options = {}) {
  test(name, async () => {
    const start = performance.now();
    let f;
    try {
      f = await fixture(options);
      await fn(f);
      results.push({ name, status: 'passed', durationMs: Math.round(performance.now() - start) });
    } catch (error) {
      results.push({ name, status: 'failed', durationMs: Math.round(performance.now() - start), error: String(error.message) });
      throw error;
    } finally {
      if (f) await f.close();
    }
  });
}

caseTest('constructor stores three distinct owners and a fixed threshold of two', async f => {
  assert.equal(await f.treasury.REQUIRED_CONFIRMATIONS(), 2n);
  for (let i = 0; i < 3; i++) {
    assert.equal(await f.treasury.owners(i), f.addresses[i]);
    assert.equal(await f.treasury.isOwner(f.addresses[i]), true);
  }
  assert.equal(await f.treasury.isOwner(f.addresses[3]), false);
});

caseTest('constructor rejects a zero owner', async f => {
  const factory = new ContractFactory(artifacts.CommunityTreasury.abi, artifacts.CommunityTreasury.bytecode, f.signers[0]);
  await expectError(() => factory.deploy([f.addresses[0], ZeroAddress, f.addresses[2]]), f.treasury, 'InvalidOwner');
});

caseTest('constructor rejects duplicate owners', async f => {
  const factory = new ContractFactory(artifacts.CommunityTreasury.abi, artifacts.CommunityTreasury.bytecode, f.signers[0]);
  await expectError(() => factory.deploy([f.addresses[0], f.addresses[0], f.addresses[2]]), f.treasury, 'DuplicateOwner');
});

caseTest('any supporter can deposit ETH and the receipt emits the correct balance', async f => {
  const result = await receipt(f.signers[3].sendTransaction({ to: f.treasuryAddress, value: parseEther('2') }));
  const event = result.logs.map(log => f.treasury.interface.parseLog(log)).find(log => log?.name === 'Deposit');
  assert.equal(event.args.sender, f.addresses[3]);
  assert.equal(event.args.amount, parseEther('2'));
  assert.equal(event.args.balance, parseEther('7'));
  assert.equal(await f.provider.getBalance(f.treasuryAddress), parseEther('7'));
});

caseTest('submission records exact payment fields and does not implicitly approve', async f => {
  const id = await submit(f);
  const payment = await f.treasury.getTransaction(id);
  assert.equal(id, 0n);
  assert.equal(payment.proposer, f.addresses[0]);
  assert.equal(payment.to, f.addresses[4]);
  assert.equal(payment.value, parseEther('1'));
  assert.equal(payment.descriptionHash, descriptionHash);
  assert.equal(payment.executed, false);
  assert.equal(payment.numConfirmations, 0n);
  assert.equal(await f.treasury.isConfirmed(id, f.addresses[0]), false);
  assert.equal(await f.treasury.getTransactionCount(), 1n);
});

caseTest('a non-owner cannot submit a request', async f => {
  await expectError(() => f.treasury.connect(f.signers[3]).submitTransaction.staticCall(f.addresses[4], 1n, descriptionHash), f.treasury, 'NotOwner');
  assert.equal(await f.treasury.getTransactionCount(), 0n);
});

caseTest('a non-owner cannot confirm a request', async f => {
  const id = await submit(f);
  await expectError(() => f.treasury.connect(f.signers[3]).confirmTransaction.staticCall(id), f.treasury, 'NotOwner');
  assert.equal((await f.treasury.getTransaction(id)).numConfirmations, 0n);
});

caseTest('a non-owner cannot revoke another owner approval', async f => {
  const id = await submit(f);
  await receipt(f.treasury.confirmTransaction(id));
  await expectError(() => f.treasury.connect(f.signers[3]).revokeConfirmation.staticCall(id), f.treasury, 'NotOwner');
  assert.equal((await f.treasury.getTransaction(id)).numConfirmations, 1n);
});

caseTest('a non-owner cannot execute an otherwise approved payment', async f => {
  const id = await submit(f); await approveTwo(f, id);
  await expectError(() => f.treasury.connect(f.signers[3]).executeTransaction.staticCall(id), f.treasury, 'NotOwner');
  assert.equal((await f.treasury.getTransaction(id)).executed, false);
});

caseTest('submission rejects the zero recipient', async f => {
  await expectError(() => f.treasury.submitTransaction.staticCall(ZeroAddress, 1n, descriptionHash), f.treasury, 'InvalidRecipient');
});

caseTest('submission rejects a zero amount', async f => {
  await expectError(() => f.treasury.submitTransaction.staticCall(f.addresses[4], 0n, descriptionHash), f.treasury, 'InvalidAmount');
});

caseTest('submission rejects an empty description commitment', async f => {
  await expectError(() => f.treasury.submitTransaction.staticCall(f.addresses[4], 1n, ZeroHash), f.treasury, 'InvalidDescriptionHash');
});

caseTest('nonexistent request identifiers are rejected by reads and all actions', async f => {
  await expectError(() => f.treasury.getTransaction(99), f.treasury, 'TransactionDoesNotExist');
  for (const method of ['confirmTransaction', 'revokeConfirmation', 'executeTransaction']) {
    await expectError(() => f.treasury[method].staticCall(99), f.treasury, 'TransactionDoesNotExist');
  }
});

caseTest('one owner cannot count a duplicate approval twice', async f => {
  const id = await submit(f);
  await receipt(f.treasury.confirmTransaction(id));
  await expectError(() => f.treasury.confirmTransaction.staticCall(id), f.treasury, 'AlreadyConfirmed');
  assert.equal((await f.treasury.getTransaction(id)).numConfirmations, 1n);
});

caseTest('zero approvals cannot release funds', async f => {
  const id = await submit(f);
  await expectError(() => f.treasury.executeTransaction.staticCall(id), f.treasury, 'NotEnoughConfirmations');
  assert.equal(await f.provider.getBalance(f.treasuryAddress), parseEther('5'));
});

caseTest('one approval cannot release funds even in a mined transaction', async f => {
  const id = await submit(f);
  await receipt(f.treasury.confirmTransaction(id));
  await expectError(() => f.treasury.executeTransaction.staticCall(id), f.treasury, 'NotEnoughConfirmations');
  await expectFailedReceipt(() => f.treasury.executeTransaction(id, { gasLimit: 300000 }));
  assert.equal((await f.treasury.getTransaction(id)).executed, false);
  assert.equal(await f.provider.getBalance(f.treasuryAddress), parseEther('5'));
});

caseTest('two distinct approvals allow exactly the requested ETH transfer', async f => {
  const id = await submit(f); await approveTwo(f, id);
  const before = await f.provider.getBalance(f.addresses[4]);
  const result = await receipt(f.treasury.executeTransaction(id));
  assert.equal(await f.provider.getBalance(f.addresses[4]) - before, parseEther('1'));
  assert.equal(await f.provider.getBalance(f.treasuryAddress), parseEther('4'));
  assert.equal((await f.treasury.getTransaction(id)).executed, true);
  const event = result.logs.map(log => f.treasury.interface.parseLog(log)).find(log => log?.name === 'ExecuteTransaction');
  assert.equal(event.args.txIndex, id);
});

caseTest('the third owner can execute a payment approved by the other two', async f => {
  const id = await submit(f); await approveTwo(f, id);
  assert.equal(await f.treasury.isConfirmed(id, f.addresses[2]), false);
  await receipt(f.treasury.connect(f.signers[2]).executeTransaction(id));
  assert.equal((await f.treasury.getTransaction(id)).executed, true);
});

caseTest('revocation removes authority until a second distinct approval is restored', async f => {
  const id = await submit(f); await approveTwo(f, id);
  await receipt(f.treasury.connect(f.signers[1]).revokeConfirmation(id));
  assert.equal(await f.treasury.isConfirmed(id, f.addresses[1]), false);
  assert.equal((await f.treasury.getTransaction(id)).numConfirmations, 1n);
  await expectError(() => f.treasury.executeTransaction.staticCall(id), f.treasury, 'NotEnoughConfirmations');
  await receipt(f.treasury.connect(f.signers[2]).confirmTransaction(id));
  await receipt(f.treasury.executeTransaction(id));
  assert.equal((await f.treasury.getTransaction(id)).executed, true);
});

caseTest('an owner cannot revoke an approval they did not give', async f => {
  const id = await submit(f);
  await expectError(() => f.treasury.revokeConfirmation.staticCall(id), f.treasury, 'NotConfirmed');
  assert.equal((await f.treasury.getTransaction(id)).numConfirmations, 0n);
});

caseTest('insufficient balance rejects execution and a later deposit permits retry', async f => {
  const id = await submit(f, { value: parseEther('6') }); await approveTwo(f, id);
  await expectError(() => f.treasury.executeTransaction.staticCall(id), f.treasury, 'InsufficientBalance');
  await expectFailedReceipt(() => f.treasury.executeTransaction(id, { gasLimit: 300000 }));
  assert.equal((await f.treasury.getTransaction(id)).executed, false);
  assert.equal((await f.treasury.getTransaction(id)).numConfirmations, 2n);
  await receipt(f.signers[3].sendTransaction({ to: f.treasuryAddress, value: parseEther('2') }));
  await receipt(f.treasury.executeTransaction(id));
  assert.equal(await f.provider.getBalance(f.treasuryAddress), parseEther('1'));
});

caseTest('an executed request cannot pay twice', async f => {
  const id = await submit(f); await approveTwo(f, id);
  await receipt(f.treasury.executeTransaction(id));
  const before = await f.provider.getBalance(f.addresses[4]);
  await expectError(() => f.treasury.executeTransaction.staticCall(id), f.treasury, 'AlreadyExecuted');
  await expectFailedReceipt(() => f.treasury.executeTransaction(id, { gasLimit: 300000 }));
  assert.equal(await f.provider.getBalance(f.addresses[4]), before);
  assert.equal(await f.provider.getBalance(f.treasuryAddress), parseEther('4'));
});

caseTest('executed requests reject further confirmations and revocations', async f => {
  const id = await submit(f); await approveTwo(f, id);
  await receipt(f.treasury.executeTransaction(id));
  await expectError(() => f.treasury.connect(f.signers[2]).confirmTransaction.staticCall(id), f.treasury, 'AlreadyExecuted');
  await expectError(() => f.treasury.revokeConfirmation.staticCall(id), f.treasury, 'AlreadyExecuted');
});

caseTest('a reverting receiver rolls back execution and can be paid after recovery', async f => {
  const receiver = await deploy('ToggleReceiver', f.signers[0]);
  const to = await receiver.getAddress();
  const id = await submit(f, { to }); await approveTwo(f, id);
  await expectError(() => f.treasury.executeTransaction.staticCall(id), f.treasury, 'TransferFailed');
  await expectFailedReceipt(() => f.treasury.executeTransaction(id, { gasLimit: 300000 }));
  assert.equal((await f.treasury.getTransaction(id)).executed, false);
  assert.equal((await f.treasury.getTransaction(id)).numConfirmations, 2n);
  assert.equal(await f.provider.getBalance(f.treasuryAddress), parseEther('5'));
  assert.equal(await f.provider.getBalance(to), 0n);
  await receipt(receiver.setAcceptsPayment(true));
  await receipt(f.treasury.executeTransaction(id, { gasLimit: 300000 }));
  assert.equal(await f.provider.getBalance(to), parseEther('1'));
});

caseTest('an owner-recipient cannot reenter the same request', async f => {
  const attackerAddress = await f.attacker.getAddress();
  const id = await submit(f, { to: attackerAddress }); await approveTwo(f, id);
  await receipt(f.attacker.configure(f.treasuryAddress, id));
  await receipt(f.attacker.trigger(id));
  assert.equal(await f.attacker.attempts(), 1n);
  assert.equal(await f.attacker.reentrySucceeded(), false);
  assert.equal(await f.attacker.revertSelector(), f.treasury.interface.getError('ReentrantCall').selector);
  assert.equal(await f.provider.getBalance(attackerAddress), parseEther('1'));
  assert.equal(await f.provider.getBalance(f.treasuryAddress), parseEther('4'));
}, { maliciousOwner: true });

caseTest('an owner-recipient cannot reenter a different approved request', async f => {
  const outer = await submit(f, { to: await f.attacker.getAddress() }); await approveTwo(f, outer);
  const inner = await submit(f); await approveTwo(f, inner);
  await receipt(f.attacker.configure(f.treasuryAddress, inner));
  const before = await f.provider.getBalance(f.addresses[4]);
  await receipt(f.treasury.executeTransaction(outer));
  assert.equal(await f.attacker.reentrySucceeded(), false);
  assert.equal(await f.attacker.revertSelector(), f.treasury.interface.getError('ReentrantCall').selector);
  assert.equal((await f.treasury.getTransaction(inner)).executed, false);
  assert.equal(await f.provider.getBalance(f.addresses[4]), before);
  await receipt(f.treasury.executeTransaction(inner));
  assert.equal((await f.treasury.getTransaction(inner)).executed, true);
}, { maliciousOwner: true });

caseTest('approval count matches the set of owners across revoke and reconfirm sequences', async f => {
  const id = await submit(f);
  const approved = new Set();
  const operations = [['confirm',2],['confirm',0],['revoke',2],['confirm',1],['confirm',2],['revoke',0],['revoke',1],['confirm',0]];
  for (const [action, index] of operations) {
    if (action === 'confirm') {
      await receipt(f.treasury.connect(f.signers[index]).confirmTransaction(id)); approved.add(index);
    } else {
      await receipt(f.treasury.connect(f.signers[index]).revokeConfirmation(id)); approved.delete(index);
    }
    assert.equal((await f.treasury.getTransaction(id)).numConfirmations, BigInt(approved.size));
    for (let owner = 0; owner < 3; owner++) assert.equal(await f.treasury.isConfirmed(id, f.addresses[owner]), approved.has(owner));
  }
});

caseTest('competing approved requests cannot spend more than the current treasury balance', async f => {
  const first = await submit(f, { value: parseEther('4') }); await approveTwo(f, first);
  const second = await submit(f, { value: parseEther('4') }); await approveTwo(f, second);
  await receipt(f.treasury.executeTransaction(first));
  await expectError(() => f.treasury.executeTransaction.staticCall(second), f.treasury, 'InsufficientBalance');
  assert.equal((await f.treasury.getTransaction(second)).executed, false);
  assert.equal(await f.provider.getBalance(f.treasuryAddress), parseEther('1'));
});

caseTest('canonical lifecycle records actual gas used by mined transactions', async f => {
  const record = (operation, mined) => gasObservations.push({ operation, gasUsed: mined.gasUsed.toString(), status: mined.status, transactionHash: mined.hash });
  record('deployment', await f.treasury.deploymentTransaction().wait());
  record('deposit', await receipt(f.signers[3].sendTransaction({ to: f.treasuryAddress, value: parseEther('2') })));
  record('submit', await receipt(f.treasury.submitTransaction(f.addresses[4], parseEther('1'), descriptionHash)));
  record('confirm_first', await receipt(f.treasury.confirmTransaction(0)));
  record('confirm_second', await receipt(f.treasury.connect(f.signers[1]).confirmTransaction(0)));
  record('revoke', await receipt(f.treasury.connect(f.signers[1]).revokeConfirmation(0)));
  record('reconfirm', await receipt(f.treasury.connect(f.signers[1]).confirmTransaction(0)));
  record('execute', await receipt(f.treasury.executeTransaction(0)));
  assert.equal(await f.provider.getBalance(f.treasuryAddress), parseEther('1'));
  assert.ok(gasObservations.every(observation => BigInt(observation.gasUsed) > 0n && observation.status === 1));
}, { initialFunds: '0' });

after(() => {
  const sourceSha256 = createHash('sha256').update(fs.readFileSync(path.join(ROOT, 'contracts/CommunityTreasury.sol'))).digest('hex');
  const environment = { chain: 'isolated in-process Ganache', chainId: 1337, hardfork: 'shanghai', compiler: artifacts.CommunityTreasury.compiler, optimizerRuns: 200, node: process.version, sourceSha256 };
  const report = { startedAt, finishedAt: new Date().toISOString(), environment,
    total: results.length, passed: results.filter(r => r.status === 'passed').length, failed: results.filter(r => r.status === 'failed').length,
    tests: results, limitations: ['Local EVM tests only; no public-network deployment established.', 'Not a formal verification or independent security audit.'] };
  fs.mkdirSync(path.join(ROOT, 'evidence'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'evidence/contract-test-results.json'), `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(path.join(ROOT, 'evidence/contract-gas.json'), `${JSON.stringify({ measuredAt: report.finishedAt, environment, observations: gasObservations,
    interpretation: 'Single-run local transaction gas observations, not monetary cost estimates or a throughput benchmark.' }, null, 2)}\n`);
});
