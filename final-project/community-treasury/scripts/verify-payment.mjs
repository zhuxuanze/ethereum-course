import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Contract, JsonRpcProvider, getAddress, isHexString, keccak256, toBeHex } from 'ethers';

const scriptPath = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(scriptPath), '..');
const artifact = JSON.parse(await fs.readFile(path.join(root, 'artifacts/CommunityTreasury.json'), 'utf8'));

async function receiptFor(provider, address, hash) {
  if (!isHexString(hash, 32)) throw new Error('Supply a 32-byte transaction hash for each step.');
  const receipt = await provider.getTransactionReceipt(hash);
  if (!receipt || receipt.status !== 1 || receipt.to !== address) throw new Error('Missing successful direct treasury receipt.');
  return receipt;
}

function matchingEvent(contract, receipt, name) {
  for (const log of receipt.logs.filter(log => log.address === receipt.to)) {
    const event = contract.interface.parseLog(log);
    if (event?.name === name) return { event, position: log.index };
  }
  throw new Error('Missing treasury event: ' + name);
}

/** Read-only reconstruction of one payment and its funding example. */
export async function verifyPayment(provider, { chainId, address, owners, depositHash, submitHash, executeHash }) {
  address = getAddress(address);
  if (!chainId || String((await provider.getNetwork()).chainId) !== String(chainId)) throw new Error('Unexpected chain ID.');
  if (owners.length !== 3 || new Set(owners.map(getAddress)).size !== 3) throw new Error('Three different expected managers are required.');
  const contract = new Contract(address, artifact.abi, provider);
  const [code, threshold, actualOwners, deposit, submit, execute] = await Promise.all([
    provider.getCode(address), contract.REQUIRED_CONFIRMATIONS(), Promise.all([0, 1, 2].map(i => contract.owners(i))),
    receiptFor(provider, address, depositHash), receiptFor(provider, address, submitHash), receiptFor(provider, address, executeHash)
  ]);
  if (code.toLowerCase() !== artifact.deployedBytecode.toLowerCase() || threshold !== 2n ||
      actualOwners.some((owner, i) => owner !== getAddress(owners[i]))) throw new Error('Runtime, threshold or managers differ.');
  const { event: funding } = matchingEvent(contract, deposit, 'Deposit');
  const { event: proposed } = matchingEvent(contract, submit, 'SubmitTransaction');
  const { event: paid } = matchingEvent(contract, execute, 'ExecuteTransaction');
  const requestId = proposed.args.txIndex;
  const earlier = (a, b) => a.blockNumber < b.blockNumber || (a.blockNumber === b.blockNumber && a.index < b.index);
  if (funding.args.amount <= 0n || !earlier(deposit, execute) || !earlier(submit, execute) || paid.args.txIndex !== requestId) {
    throw new Error('Expected an earlier positive deposit, then this request and its execution.');
  }
  const names = ['SubmitTransaction', 'ConfirmTransaction', 'RevokeConfirmation', 'ExecuteTransaction'];
  const topics = [names.map(name => contract.interface.getEvent(name).topicHash), null, toBeHex(requestId, 32)];
  const timeline = [];
  const votes = new Set();
  let sawSubmission = false;
  let sawExecution = false;
  for (let fromBlock = submit.blockNumber; fromBlock <= execute.blockNumber; fromBlock += 256) {
    const logs = await provider.getLogs({ address, topics, fromBlock, toBlock: Math.min(fromBlock + 255, execute.blockNumber) });
    logs.sort((a, b) => a.blockNumber - b.blockNumber || a.index - b.index);
    for (const log of logs) {
      const { name, args } = contract.interface.parseLog(log);
      if (!actualOwners.includes(args.owner) || sawExecution) throw new Error('Unexpected manager or event order.');
      if (name === 'SubmitTransaction') {
        if (sawSubmission || log.transactionHash !== submit.hash) throw new Error('Submission history differs from its receipt.');
        sawSubmission = true;
      } else if (!sawSubmission) {
        throw new Error('The RPC did not return the complete request history.');
      } else if (name === 'ConfirmTransaction') {
        if (votes.has(args.owner)) throw new Error('Duplicate approval in returned history.');
        votes.add(args.owner);
      } else if (name === 'RevokeConfirmation') {
        if (!votes.delete(args.owner)) throw new Error('Missing approval before revocation.');
      } else if (name === 'ExecuteTransaction') {
        if (votes.size < 2 || log.transactionHash !== execute.hash) throw new Error('Execution history differs from its receipt or lacks two approvals.');
        sawExecution = true;
      }
      timeline.push({ action: name, actor: args.owner, approvals: votes.size, blockNumber: log.blockNumber,
        blockHash: log.blockHash, logIndex: log.index, transactionHash: log.transactionHash });
    }
  }
  if (!sawExecution) throw new Error('The RPC did not return the execution event.');
  const [request, balanceBefore, balanceAfter, recipientBefore, recipientAfter, executionBlock] = await Promise.all([
    contract.getTransaction(requestId, { blockTag: execute.blockNumber }),
    provider.getBalance(address, execute.blockNumber - 1), provider.getBalance(address, execute.blockNumber),
    provider.getBalance(proposed.args.to, execute.blockNumber - 1), provider.getBalance(proposed.args.to, execute.blockNumber),
    provider.getBlock(execute.blockNumber)
  ]);
  if (executionBlock?.hash !== execute.blockHash) throw new Error('The execution block changed during verification. Retry on the canonical chain.');
  if (!request.executed || request.numConfirmations !== BigInt(votes.size) || request.proposer !== proposed.args.owner ||
      request.to !== proposed.args.to || request.value !== proposed.args.value || request.descriptionHash !== proposed.args.descriptionHash) {
    throw new Error('The request at the execution block differs from the reconstructed history.');
  }
  return { checkedAt: new Date().toISOString(), chainId: String(chainId), contractAddress: address,
    runtimeKeccak256: keccak256(code), owners: actualOwners, threshold: Number(threshold), requestId: String(requestId),
    deposit: { from: funding.args.sender, amountWei: String(funding.args.amount), transactionHash: deposit.hash, blockHash: deposit.blockHash },
    payment: { asset: 'native ETH', recipient: request.to, amountWei: String(request.value), purposeHash: request.descriptionHash,
      executed: true, executor: execute.from, executionReceiptHash: execute.hash, executionFeeWei: String(execute.fee) },
    balances: { beforeBlock: execute.blockNumber - 1, executionBlock: execute.blockNumber, executionBlockHash: execute.blockHash,
      executionBlockTransactionCount: executionBlock.transactions.length, treasuryBeforeWei: String(balanceBefore),
      treasuryAfterWei: String(balanceAfter), treasuryDeltaWei: String(balanceAfter - balanceBefore),
      recipientBeforeWei: String(recipientBefore), recipientAfterWei: String(recipientAfter),
      recipientDeltaWei: String(recipientAfter - recipientBefore), recipientPaidExecutionFee: request.to === execute.from,
      measurement: 'Whole-block balances include gas, other transfers, and any payments made by the recipient.'
    }, timeline };
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  const env = process.env;
  if (!env.RPC_URL || !env.EXPECTED_CHAIN_ID) throw new Error('Set RPC_URL and EXPECTED_CHAIN_ID.');
  const provider = new JsonRpcProvider(env.RPC_URL, undefined, { cacheTimeout: -1 });
  try {
    const result = await verifyPayment(provider, { chainId: env.EXPECTED_CHAIN_ID, address: env.CONTRACT_ADDRESS,
      owners: (env.OWNER_ADDRESSES || '').split(',').map(s => s.trim()), depositHash: env.DEPOSIT_TX_HASH,
      submitHash: env.SUBMIT_TX_HASH, executeHash: env.EXECUTE_TX_HASH });
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } catch (error) {
    // Some providers include private RPC URLs in their error message.
    console.error(error.code ? 'Payment verification failed. Check RPC history support, addresses and receipts.' : error.message);
    process.exitCode = 1;
  } finally {
    provider.destroy();
  }
}
