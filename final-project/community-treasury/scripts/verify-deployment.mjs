import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Contract, ContractFactory, JsonRpcProvider, ZeroAddress, getAddress, getCreateAddress, isHexString, keccak256 } from 'ethers';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifact = JSON.parse(fs.readFileSync(path.join(root, 'artifacts/CommunityTreasury.json'), 'utf8'));
const rpc = process.env.RPC_URL || 'http://127.0.0.1:18545';
const provider = new JsonRpcProvider(rpc, undefined, { cacheTimeout: -1 });

class VerificationError extends Error {}

async function verifyCreation(hash, chainId) {
  if (!isHexString(hash, 32)) throw new VerificationError('Expected a 32-byte deployment transaction hash.');
  const [tx, receipt] = await Promise.all([provider.getTransaction(hash), provider.getTransactionReceipt(hash)]);
  if (!tx || !receipt || receipt.status !== 1) throw new VerificationError('No successful mined deployment receipt on this network.');
  if (tx.to !== null || receipt.to !== null || !receipt.contractAddress || tx.chainId !== chainId ||
      tx.blockHash !== receipt.blockHash || receipt.hash.toLowerCase() !== hash.toLowerCase()) {
    throw new VerificationError('Transaction is not a mined direct contract creation on the expected chain.');
  }
  const address = getAddress(receipt.contractAddress);
  if (getCreateAddress({ from: tx.from, nonce: tx.nonce }) !== address ||
      (process.env.DEPLOYER_ADDRESS && getAddress(process.env.DEPLOYER_ADDRESS) !== getAddress(tx.from))) {
    throw new VerificationError('Deployment address or signer mismatch.');
  }
  return { tx, receipt, address };
}

function saveReceipt(file, result) {
  // Publish an immutable proof atomically, leaving any prior or richer receipt intact.
  const temp = file + '.' + randomUUID() + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  try {
    fs.linkSync(temp, file);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const prior = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (prior.transactionHash !== result.transactionHash || prior.blockHash !== result.blockHash ||
        prior.runtimeKeccak256 !== result.runtimeKeccak256 || prior.address !== result.address ||
        prior.chainId !== result.chainId || prior.threshold !== result.threshold ||
        JSON.stringify(prior.owners) !== JSON.stringify(result.owners)) {
      throw new VerificationError('The existing receipt disagrees with the chain. It has been retained for review.');
    }
  } finally {
    fs.unlinkSync(temp);
  }
}

try {
  const network = await provider.getNetwork();
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(rpc).hostname) && [1337n, 31337n].includes(network.chainId);
  if ((!local || process.env.EXPECTED_CHAIN_ID) && String(network.chainId) !== process.env.EXPECTED_CHAIN_ID) {
    throw new VerificationError('Unexpected chain ID.');
  }
  const hash = process.env.DEPLOYMENT_TX_HASH;
  const creation = hash ? await verifyCreation(hash, network.chainId) : null;
  const address = process.env.CONTRACT_ADDRESS ? getAddress(process.env.CONTRACT_ADDRESS) : creation?.address;
  if (!address || (creation && address !== creation.address)) throw new VerificationError('Expected contract address missing or different from the receipt.');
  const expectedOwners = (process.env.OWNER_ADDRESSES || '').split(',').filter(Boolean).map(x => getAddress(x.trim()));
  if ((!local || expectedOwners.length) && expectedOwners.length !== 3) throw new VerificationError('Three expected owner addresses are required.');
  const code = await provider.getCode(address);
  if (code.toLowerCase() !== artifact.deployedBytecode.toLowerCase()) throw new VerificationError('Deployed runtime bytecode differs from the compiled contract.');
  const contract = new Contract(address, artifact.abi, provider);
  const owners = await Promise.all([0, 1, 2].map(i => contract.owners(i)));
  const threshold = Number(await contract.REQUIRED_CONFIRMATIONS());
  if (threshold !== 2 || new Set(owners).size !== 3 || owners.includes(ZeroAddress)) throw new VerificationError('Owner or threshold readback is invalid.');
  if (expectedOwners.length && owners.some((owner, i) => owner !== expectedOwners[i])) throw new VerificationError('Owner mismatch.');

  const result = {
    verifiedAt: new Date().toISOString(), chainId: String(network.chainId), address,
    runtimeMatches: true, runtimeKeccak256: keccak256(code), owners, threshold,
    expectedOwnersChecked: expectedOwners.length === 3, sourceSha256: artifact.sourceSha256
  };
  if (creation) {
    const { tx, receipt } = creation;
    const request = await new ContractFactory(artifact.abi, artifact.bytecode).getDeployTransaction(owners);
    if (tx.data.toLowerCase() !== request.data.toLowerCase() || tx.value !== 0n) {
      throw new VerificationError('Creation bytecode or constructor arguments differ from the reviewed deployment.');
    }
    Object.assign(result, {
      networkKind: local ? 'local-development' : 'external', transactionHash: tx.hash, blockHash: receipt.blockHash,
      blockNumber: receipt.blockNumber, status: receipt.status, deployer: tx.from, gasUsed: String(receipt.gasUsed),
      creationDataMatches: true, compiler: artifact.compiler
    });
    const dir = path.join(root, 'deployments');
    fs.mkdirSync(dir, { recursive: true });
    saveReceipt(path.join(dir, network.chainId + '-' + address + '-' + tx.hash + '.verified.json'), result);
  } else {
    const dir = path.join(root, 'evidence');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'deployment-verification.json'), JSON.stringify(result, null, 2) + '\n');
  }
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error('Deployment verification failed. ' + (error instanceof VerificationError ? error.message : 'Check the endpoint, addresses, compiled artifact and output directory.'));
  process.exitCode = 1;
} finally {
  provider.destroy();
}
