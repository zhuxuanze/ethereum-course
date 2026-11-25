'use strict';

const $ = id => document.getElementById(id);
const chainId = 11155111n;
const storageKey = 'community-treasury-sepolia-deployment';
const inputs = [...document.querySelectorAll('input[name=owner]')];
let plan = null;
let submitted = null;
let busyAction = null;
let walletRevision = 0;
let selectedWallet = null;
let detachWallet = () => {};
let recordUrl;

function ownersFrom(values) {
  const owners = values.map(value => ethers.getAddress(value.trim()));
  if (owners.length !== 3 || new Set(owners).size !== 3 || owners.includes(ethers.ZeroAddress)) {
    throw new Error('Enter three different, nonzero manager addresses.');
  }
  return owners;
}

function invalidate() {
  plan = null;
  $('send').disabled = true;
  $('quote').hidden = true;
}

function showSubmitted() {
  inputs.forEach((field, index) => { field.value = submitted.owners[index]; field.disabled = true; });
  $('review').disabled = true;
  $('send').disabled = true;
  $('receipt').hidden = false;
  $('explorer').textContent = submitted.hash;
  $('explorer').href = 'https://sepolia.etherscan.io/tx/' + submitted.hash;
  $('verify').hidden = false;
}

function ensureCurrent(wallet, revision) {
  if (selectedWallet !== wallet || revision !== walletRevision) throw new Error('Wallet selection changed. Refresh the preview.');
}

async function walletProvider(wallet, revision) {
  ensureCurrent(wallet, revision);
  if (!wallet) throw new Error('Open this page in a browser with an Ethereum wallet.');
  if (BigInt(await wallet.request({ method: 'eth_chainId' })) !== chainId) {
    throw new Error('Switch the wallet to Sepolia (chain ID 11155111), then retry.');
  }
  ensureCurrent(wallet, revision);
  return new ethers.BrowserProvider(wallet, undefined, { cacheTimeout: -1 });
}

async function loadArtifact() {
  const response = await fetch('./artifacts/CommunityTreasury.json');
  if (!response.ok) throw new Error('The compiled treasury contract could not be loaded.');
  return response.json();
}

function updateActions() {
  inputs.forEach(field => { field.disabled = Boolean(busyAction || submitted); });
  $('review').disabled = Boolean(busyAction || submitted);
  $('send').disabled = Boolean(busyAction || submitted || !plan);
  $('verify').disabled = Boolean(busyAction);
}

async function run(action) {
  if (busyAction) return;
  const wallet = picker.getProvider();
  const revision = walletRevision;
  const operation = { action };
  busyAction = operation;
  updateActions();
  try {
    await action(wallet, revision);
  } catch (error) {
    if (revision === walletRevision) $('status').textContent = error.code === 4001 || error.code === 'ACTION_REJECTED'
      ? 'The wallet request was declined.' : error.shortMessage || error.message || 'The wallet request did not complete.';
  } finally {
    if (busyAction === operation) {
      busyAction = null;
      updateActions();
    }
  }
}

async function review(wallet, revision) {
  invalidate();
  const owners = ownersFrom(inputs.map(input => input.value));
  if (!wallet) throw new Error('Open this page in a browser with an Ethereum wallet.');
  $('status').textContent = 'Connect the funding account to this site in your wallet.';
  const authorized = await wallet.request({ method: 'eth_requestAccounts' });
  ensureCurrent(wallet, revision);
  if (!authorized.length) throw new Error('Select a funding account in your wallet.');
  if (BigInt(await wallet.request({ method: 'eth_chainId' })) !== chainId) {
    ensureCurrent(wallet, revision);
    $('status').textContent = 'Confirm the switch to Sepolia in your wallet to preview deployment.';
    try {
      await wallet.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: ethers.toQuantity(chainId) }] });
    } catch (error) {
      if (error.code === 4001 || error.code === 'ACTION_REJECTED') throw new Error('Sepolia network switch declined. Click preview to try again.');
      if (error.code === 4902) throw new Error('Enable the Sepolia test network in your wallet, then retry the preview.');
      throw error;
    }
  }
  const provider = await walletProvider(wallet, revision);
  const accounts = await wallet.request({ method: 'eth_accounts' });
  if (!accounts[0] || ethers.getAddress(accounts[0]) !== ethers.getAddress(authorized[0])) {
    throw new Error('The wallet account changed. Refresh the preview.');
  }
  const from = ethers.getAddress(accounts[0]);
  const artifact = await loadArtifact();
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode);
  const { data } = await factory.getDeployTransaction(owners);
  const [gas, fees, balance] = await Promise.all([
    provider.estimateGas({ from, data }), provider.getFeeData(), provider.getBalance(from)
  ]);
  ensureCurrent(wallet, revision);
  const cap = fees.maxFeePerGas ?? fees.gasPrice;
  if (cap == null) throw new Error('The connected node did not return a gas estimate.');
  const feeFields = fees.maxFeePerGas != null && fees.maxPriorityFeePerGas != null
    ? { maxFeePerGas: ethers.toQuantity(fees.maxFeePerGas), maxPriorityFeePerGas: ethers.toQuantity(fees.maxPriorityFeePerGas) }
    : { gasPrice: ethers.toQuantity(cap) };
  $('quote').textContent = ['Sepolia · 11155111', 'Deployer: ' + from,
    ...owners.map((owner, index) => 'Manager ' + (index + 1) + ': ' + owner),
    'Wallet balance: ' + ethers.formatEther(balance) + ' test ETH',
    'Estimated maximum fee: ' + ethers.formatEther(gas * cap) + ' test ETH'].join('\n');
  $('quote').hidden = false;
  if (balance < gas * cap) throw new Error('Fund the deployment wallet with enough Sepolia test ETH, then refresh the preview.');
  plan = { wallet, revision, from, owners, createdAt: Date.now(), transaction: { chainId: ethers.toQuantity(chainId),
    from, data, value: '0x0', gas: ethers.toQuantity(gas), ...feeFields } };
  $('status').textContent = 'Review the permanent manager addresses and estimated fee before signing.';
}

async function send(wallet, revision) {
  const preview = plan;
  invalidate();
  if (!preview || Date.now() - preview.createdAt > 120000) throw new Error('Refresh the fee preview before signing.');
  ensureCurrent(preview.wallet, preview.revision);
  await walletProvider(wallet, revision);
  const accounts = await wallet.request({ method: 'eth_accounts' });
  ensureCurrent(wallet, revision);
  if (!accounts[0] || ethers.getAddress(accounts[0]) !== preview.from) throw new Error('The wallet account changed. Refresh the preview.');
  $('status').textContent = 'Review the contract creation in your wallet.';
  const hash = await wallet.request({ method: 'eth_sendTransaction', params: [preview.transaction] });
  if (!ethers.isHexString(hash, 32)) throw new Error('The wallet returned an invalid transaction hash. Check the wallet activity before retrying.');
  submitted = { from: preview.from, owners: preview.owners, hash };
  try { sessionStorage.setItem(storageKey, JSON.stringify(submitted)); } catch { /* Wallet activity also retains the hash. */ }
  showSubmitted();
  $('status').textContent = 'Transaction submitted. Check the receipt after it is mined.';
  if (revision === walletRevision) await verifyReceipt(wallet, revision);
}

async function verifyReceipt(wallet, revision) {
  const provider = await walletProvider(wallet, revision);
  const [receipt, tx, artifact] = await Promise.all([
    provider.getTransactionReceipt(submitted.hash), provider.getTransaction(submitted.hash), loadArtifact()
  ]);
  ensureCurrent(wallet, revision);
  if (!receipt) { $('status').textContent = 'The transaction is waiting for a block. Check the receipt again after confirmation.'; return; }
  if (receipt.status === 0) {
    try { sessionStorage.removeItem(storageKey); } catch {}
    throw new Error('The deployment reverted. Review this receipt and reload the page for a new preview.');
  }
  const { data } = await new ethers.ContractFactory(artifact.abi, artifact.bytecode).getDeployTransaction(submitted.owners);
  if (!tx || tx.chainId !== chainId || tx.blockHash !== receipt.blockHash || tx.from !== submitted.from ||
      tx.to !== null || receipt.status !== 1 || tx.value !== 0n || tx.data.toLowerCase() !== data.toLowerCase() ||
      receipt.contractAddress !== ethers.getCreateAddress({ from: tx.from, nonce: tx.nonce })) {
    throw new Error('The mined transaction does not match the reviewed deployment.');
  }
  const address = receipt.contractAddress;
  const contract = new ethers.Contract(address, artifact.abi, provider);
  const [code, threshold, ...owners] = await Promise.all([
    provider.getCode(address), contract.REQUIRED_CONFIRMATIONS(), ...[0, 1, 2].map(i => contract.owners(i))
  ]);
  ensureCurrent(wallet, revision);
  if (code.toLowerCase() !== artifact.deployedBytecode.toLowerCase() || threshold !== 2n ||
      owners.some((owner, i) => owner !== submitted.owners[i])) throw new Error('Contract bytecode or manager verification failed.');
  const record = { verifiedAt: new Date().toISOString(), chainId: String(chainId), address, deployer: tx.from,
    transactionHash: tx.hash, blockNumber: receipt.blockNumber, blockHash: receipt.blockHash, gasUsed: String(receipt.gasUsed),
    status: receipt.status, threshold: Number(threshold), owners, creationDataMatches: true, runtimeMatches: true,
    runtimeKeccak256: ethers.keccak256(code), sourceSha256: artifact.sourceSha256, compiler: artifact.compiler };
  if (recordUrl) URL.revokeObjectURL(recordUrl);
  recordUrl = URL.createObjectURL(new Blob([JSON.stringify(record, null, 2) + '\n'], { type: 'application/json' }));
  $('proof').href = recordUrl;
  $('proof').hidden = false;
  $('result').textContent = 'Contract: ' + address + '\nBlock: ' + receipt.blockNumber + '\nApproval rule: 2 of 3 managers';
  $('result').hidden = false;
  $('status').textContent = 'Deployment verified. Copy the contract address into the treasury wallet connection.';
}

$('form').addEventListener('submit', event => { event.preventDefault(); run(review); });
$('send').addEventListener('click', () => run(send));
$('verify').addEventListener('click', () => run(verifyReceipt));
inputs.forEach(input => input.addEventListener('input', invalidate));
const picker = window.TreasuryWallets.bind($('wallet-choice'), wallet => {
  detachWallet();
  walletRevision++;
  selectedWallet = wallet;
  invalidate();
  $('result').hidden = $('proof').hidden = true;
  if (busyAction?.action !== send) busyAction = null;
  updateActions();
  $('status').textContent = submitted ? 'Check the submitted transaction with the selected wallet.' : 'Select Sepolia and preview deployment with this wallet.';
  const handleChange = () => {
    if (wallet !== selectedWallet) return;
    invalidate();
    if (!busyAction && !submitted) $('status').textContent = 'Wallet settings changed. Refresh the preview.';
  };
  for (const event of ['accountsChanged', 'chainChanged']) wallet?.on?.(event, handleChange);
  detachWallet = () => { for (const event of ['accountsChanged', 'chainChanged']) wallet?.removeListener?.(event, handleChange); };
});
try {
  const saved = JSON.parse(sessionStorage.getItem(storageKey));
  if (saved && ethers.isHexString(saved.hash, 32)) {
    submitted = { hash: saved.hash, from: ethers.getAddress(saved.from), owners: ownersFrom(saved.owners) };
    showSubmitted();
    $('status').textContent = 'A deployment was submitted from this tab. Check its receipt to resume.';
  }
} catch { /* A new preview is available if this tab has no saved submission. */ }
