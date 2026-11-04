/* Common Treasury. All sandbox writes execute the compiled Solidity contract on a browser EVM. */
'use strict';

const $ = (id) => document.getElementById(id);
const state = {
  mode: 'sandbox', provider: null, engine: null, contract: null, signer: null,
  artifact: null, address: null, chainId: null, account: null, owners: [], accounts: [],
  balance: 0n, requests: [], totalCount: 0, pendingCount: 0, paidCount: 0,
  filter: 'all', busy: false, epoch: 0, walletHandlers: null,
  activeOperation: null, broadcasts: []
};
const names = ['Manager A', 'Manager B', 'Manager C'];
const explorers = { '1': 'https://etherscan.io', '11155111': 'https://sepolia.etherscan.io' };
const networkNames = { '1': 'Ethereum mainnet', '11155111': 'Sepolia', '1337': 'Local network', '31337': 'Local network' };
const eq = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
const short = (value) => value ? `${value.slice(0, 6)}…${value.slice(-4)}` : '—';
const ownerIndex = () => state.owners.findIndex((owner) => eq(owner, state.account));
const isManager = () => ownerIndex() !== -1;
const make = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
const eth = (value) => {
  const formatted = ethers.formatEther(value);
  const [whole, decimals] = formatted.split('.');
  const fraction = (decimals || '').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole;
};

function announce(message, type = '') {
  $('status').className = `notice ${type}`.trim();
  $('status-text').textContent = message;
}

function setBusy(busy) {
  state.busy = busy;
  document.body.classList.toggle('busy', busy);
  $('sandbox-mode').disabled = busy;
  $('wallet-mode').disabled = busy;
  $('launch-demo').disabled = busy;
  $('reset-demo').disabled = busy;
  $('connect-wallet').disabled = busy;
  $('contract-address').disabled = busy;
  $('demo-role').disabled = busy;
  $('refresh').disabled = busy || !state.contract;
  const connected = Boolean(state.contract && state.account);
  for (const id of ['deposit-amount', 'deposit-button']) $(id).disabled = busy || !connected;
  for (const id of ['recipient', 'payment-amount', 'purpose', 'submit-request']) $(id).disabled = busy || !connected || !isManager();
  for (const button of document.querySelectorAll('[data-request-action]')) button.disabled = busy || button.dataset.available !== 'true';
}

function errorMessage(error) {
  if (error?.code === 4001 || error?.code === 'ACTION_REJECTED') return 'The wallet request was declined. No payment was sent.';
  const data = error?.data || error?.info?.error?.data?.result || error?.info?.error?.data;
  let parsed;
  try { if (typeof data === 'string' && state.contract) parsed = state.contract.interface.parseError(data); } catch (_) { /* Not contract revert data. */ }
  const name = parsed?.name || error?.revert?.name;
  const messages = {
    NotOwner: 'Only a designated manager can perform this action.',
    AlreadyExecuted: 'This request has already been paid. It cannot execute again.',
    AlreadyConfirmed: 'This manager has already approved the request.',
    NotConfirmed: 'This manager has no approval to revoke.',
    NotEnoughConfirmations: 'Two different managers must approve before payment.',
    InsufficientBalance: 'The treasury does not have enough ETH for this payment.',
    InvalidRecipient: 'Enter a valid, nonzero recipient address.',
    InvalidAmount: 'The payment must be greater than zero.',
    TransferFailed: 'The recipient rejected the transfer. The payment was not completed.',
    ReentrantCall: 'The contract blocked a repeated execution attempt.',
    TransactionDoesNotExist: 'This payment request does not exist.'
  };
  if (messages[name]) return messages[name];
  if (error?.code === 'INSUFFICIENT_FUNDS') return 'Your connected account needs enough ETH for the amount and transaction fee.';
  if (error?.message?.includes('user rejected')) return 'The wallet request was declined.';
  const message = error?.shortMessage || error?.reason || error?.message || 'The action could not be completed.';
  return String(message).split('\n')[0].slice(0, 230);
}

async function loadArtifact() {
  if (state.artifact) return state.artifact;
  const response = await fetch('./artifacts/CommunityTreasury.json');
  if (!response.ok) throw new Error('The treasury contract file could not be loaded. Refresh the application and try again.');
  const artifact = await response.json();
  let bytecode = typeof artifact.bytecode === 'object' ? artifact.bytecode.object : artifact.bytecode;
  let deployedBytecode = typeof artifact.deployedBytecode === 'object' ? artifact.deployedBytecode.object : artifact.deployedBytecode;
  if (bytecode && !bytecode.startsWith('0x')) bytecode = `0x${bytecode}`;
  if (deployedBytecode && !deployedBytecode.startsWith('0x')) deployedBytecode = `0x${deployedBytecode}`;
  if (!Array.isArray(artifact.abi)) throw new Error('The contract interface is unavailable.');
  state.artifact = { abi: artifact.abi, bytecode, deployedBytecode };
  return state.artifact;
}

function interruptOperation() {
  const operation = state.activeOperation;
  state.activeOperation = null;
  if (!operation || operation.mode !== 'wallet') return '';
  operation.interrupted = true;
  return operation.hash
    ? ' A transaction was already broadcast and may still confirm on its original network. Its hash remains in transaction tracking.'
    : ' A wallet request may still be open. Decline it if you did not intend to continue; changing accounts or networks does not cancel a request already sent to the wallet.';
}

function clearSession() {
  const interruption = interruptOperation();
  state.epoch += 1;
  if (state.walletHandlers && window.ethereum?.removeListener) {
    window.ethereum.removeListener('accountsChanged', state.walletHandlers.accounts);
    window.ethereum.removeListener('chainChanged', state.walletHandlers.chain);
  }
  state.walletHandlers = null;
  if (state.engine?.disconnect) {
    try { Promise.resolve(state.engine.disconnect()).catch(() => {}); } catch (_) { /* Already disconnected. */ }
  }
  state.engine = null;
  state.provider = null;
  state.contract = null;
  state.signer = null;
  state.account = null;
  state.address = null;
  state.chainId = null;
  state.owners = [];
  state.accounts = [];
  state.requests = [];
  state.totalCount = 0;
  state.pendingCount = 0;
  state.paidCount = 0;
  $('session-controls').hidden = true;
  $('receipt').hidden = true;
  $('launch-demo').hidden = false;
  $('reset-demo').hidden = true;
  $('balance').textContent = '—';
  $('pending-count').textContent = '—';
  $('executed-count').textContent = '—';
  $('treasury-address').textContent = 'Not connected';
  $('managers').replaceChildren();
  $('activity-list').replaceChildren(make('p', 'muted', 'Confirmed contract events will appear here.'));
  $('activity-network').textContent = 'Not connected';
  $('activity-note').textContent = '';
  $('network-badge').className = 'network-pill';
  $('network-badge').replaceChildren(make('span', 'status-dot'), document.createTextNode('Not connected'));
  renderRequests();
  setBusy(false);
  renderBroadcasts();
  return interruption;
}

function selectMode(mode) {
  if (state.busy || mode === state.mode) return;
  clearSession();
  state.mode = mode;
  $('sandbox-controls').hidden = mode !== 'sandbox';
  $('wallet-connect-form').hidden = mode !== 'wallet';
  $('sandbox-mode').classList.toggle('selected', mode === 'sandbox');
  $('wallet-mode').classList.toggle('selected', mode === 'wallet');
  $('sandbox-mode').setAttribute('aria-pressed', String(mode === 'sandbox'));
  $('wallet-mode').setAttribute('aria-pressed', String(mode === 'wallet'));
  $('balance-unit').textContent = mode === 'sandbox' ? 'demo ETH' : 'ETH';
  $('balance-caption').textContent = mode === 'sandbox' ? 'Temporary demo funds with no monetary value' : 'Funds held by the treasury contract';
  announce(mode === 'sandbox' ? 'Launch a fresh sandbox to try real contract execution with demo funds.' : 'Connect only to a treasury you recognize. Wallet mode uses your selected network and requires your approval for transactions.');
}

async function launchSandbox() {
  if (state.busy) return;
  if (!window.ethers || !window.Ganache) return announce('The sandbox engine could not load. Refresh the page and try again.', 'error');
  if (state.contract && !window.confirm('Reset this sandbox? Its transactions and demo funds will be replaced by a fresh session.')) return;
  clearSession();
  setBusy(true);
  announce('Starting a temporary blockchain and deploying the treasury contract…', 'pending');
  try {
    const artifact = await loadArtifact();
    if (!artifact.bytecode || artifact.bytecode === '0x') throw new Error('The deployable treasury contract is unavailable.');
    state.engine = Ganache.provider({ logging: { quiet: true }, chain: { chainId: 1337, hardfork: 'shanghai' }, wallet: { totalAccounts: 6, defaultBalance: 100 }, miner: { instamine: 'eager' } });
    state.provider = new ethers.BrowserProvider(state.engine, undefined, { cacheTimeout: -1 });
    state.accounts = await state.provider.send('eth_accounts', []);
    state.owners = state.accounts.slice(0, 3).map(ethers.getAddress);
    state.chainId = 1337n;
    state.signer = await state.provider.getSigner(state.accounts[0]);
    state.account = await state.signer.getAddress();
    const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, state.signer);
    const deployed = await factory.deploy(state.owners);
    await deployed.waitForDeployment();
    state.address = await deployed.getAddress();
    state.contract = new ethers.Contract(state.address, artifact.abi, state.provider);
    announce('Treasury deployed. Adding 10 demo ETH to its balance…', 'pending');
    const funding = await state.signer.sendTransaction({ to: state.address, value: ethers.parseEther('10') });
    const receipt = await funding.wait();
    showReceipt(receipt);
    $('demo-role').value = '0';
    $('recipient').value = ethers.getAddress(state.accounts[4]);
    $('payment-amount').value = '0.25';
    $('purpose').value = 'Reward for improving the project documentation';
    $('launch-demo').hidden = true;
    $('reset-demo').hidden = false;
    updateConnection();
    await refreshData();
    announce('Sandbox ready: 10 demo ETH deposited. Create a request, then switch managers to collect two approvals.', 'success');
  } catch (error) {
    clearSession();
    announce(errorMessage(error), 'error');
  } finally { setBusy(false); }
}

async function connectWallet(event) {
  event.preventDefault();
  if (state.busy) return;
  if (!window.ethereum) return announce('No Ethereum wallet was found. Open this page in a wallet-enabled browser, or use the sandbox.', 'error');
  if (!window.ethers) return announce('The wallet library could not load. Refresh this page.', 'error');
  const input = $('contract-address').value.trim();
  if (!ethers.isAddress(input) || eq(input, ethers.ZeroAddress)) return announce('Enter a valid treasury contract address.', 'error');
  clearSession();
  const epoch = state.epoch;
  setBusy(true);
  announce('Waiting for your wallet connection…', 'pending');
  try {
    const artifact = await loadArtifact();
    state.provider = new ethers.BrowserProvider(window.ethereum, undefined, { cacheTimeout: -1 });
    await state.provider.send('eth_requestAccounts', []);
    const network = await state.provider.getNetwork();
    state.chainId = network.chainId;
    if (!Object.hasOwn(networkNames, String(state.chainId))) {
      throw new Error('This prototype supports Ethereum mainnet, Sepolia, and local chains 1337 or 31337. Select one of these networks before connecting.');
    }
    state.address = ethers.getAddress(input);
    const runtimeCode = await state.provider.getCode(state.address);
    if (runtimeCode === '0x') throw new Error('No contract exists at this address on the selected network. Check the address and wallet network.');
    if (!artifact.deployedBytecode || runtimeCode.toLowerCase() !== artifact.deployedBytecode.toLowerCase()) {
      throw new Error('This address does not contain the verified course treasury contract. Check the address and selected network before connecting.');
    }
    state.contract = new ethers.Contract(state.address, artifact.abi, state.provider);
    const threshold = await state.contract.REQUIRED_CONFIRMATIONS();
    if (threshold !== 2n) throw new Error('This treasury does not use the required two-approval policy.');
    state.owners = await Promise.all([0, 1, 2].map((index) => state.contract.owners(index)));
    if (new Set(state.owners.map((owner) => owner.toLowerCase())).size !== 3) throw new Error('This treasury does not expose three distinct managers.');
    state.signer = await state.provider.getSigner();
    state.account = await state.signer.getAddress();
    if (epoch !== state.epoch) return;
    updateConnection();
    await refreshData();
    state.walletHandlers = {
      accounts: async (accounts) => {
        if (state.mode !== 'wallet') return;
        const interruption = interruptOperation();
        const epoch = ++state.epoch;
        const provider = state.provider;
        state.signer = null;
        state.account = null;
        setBusy(true);
        if (!accounts.length) {
          clearSession();
          announce(`Your wallet disconnected. Reconnect to continue.${interruption}`);
          return;
        }
        try {
          const signer = await provider.getSigner(accounts[0]);
          const account = await signer.getAddress();
          if (epoch !== state.epoch) return;
          state.signer = signer;
          state.account = account;
          updateConnection();
          await refreshData();
          if (epoch === state.epoch) announce(`Connected account changed. Review your role before continuing.${interruption}`);
        } catch (error) { if (epoch === state.epoch) announce(errorMessage(error), 'error'); }
        finally { if (epoch === state.epoch) setBusy(false); }
      },
      chain: () => {
        const interruption = clearSession();
        announce(`Your wallet network changed. Check the treasury address and reconnect to this network.${interruption}`);
      }
    };
    window.ethereum.on?.('accountsChanged', state.walletHandlers.accounts);
    window.ethereum.on?.('chainChanged', state.walletHandlers.chain);
    announce(`Connected to ${networkNames[String(state.chainId)] || `chain ${state.chainId}`}. Transactions will require your wallet confirmation.`, 'success');
  } catch (error) {
    if (epoch === state.epoch) {
      const message = errorMessage(error);
      clearSession();
      announce(message, 'error');
    }
  } finally { if (epoch === state.epoch) setBusy(false); }
}

function updateConnection() {
  $('session-controls').hidden = false;
  $('role-switch-wrap').hidden = state.mode !== 'sandbox';
  const manager = ownerIndex();
  $('current-role').textContent = manager >= 0 ? names[manager] : 'Supporter · view & contribute';
  $('current-account').textContent = state.account;
  $('current-account').title = state.account;
  $('treasury-address').textContent = state.address;
  const network = state.mode === 'sandbox' ? 'Sandbox · demo ETH' : networkNames[String(state.chainId)] || `Wallet · chain ${state.chainId}`;
  $('network-badge').replaceChildren(make('span', 'status-dot'), document.createTextNode(network));
  $('network-badge').className = `network-pill connected${state.mode === 'wallet' ? ' live' : ''}`;
  $('activity-network').textContent = state.mode === 'sandbox' ? 'Sandbox chain' : `Chain ${state.chainId}`;
  $('balance-unit').textContent = state.mode === 'sandbox' ? 'demo ETH' : 'ETH';
  $('balance-caption').textContent = state.mode === 'sandbox' ? 'Temporary demo funds with no monetary value' : 'Funds held by the treasury contract';
  $('request-help').textContent = manager >= 0 ? 'A manager proposes a recipient, an amount, and a purpose. The submitted details cannot be changed.' : 'Your account can contribute and review records. Only the three designated managers can submit or approve payments.';
  $('managers').replaceChildren(...state.owners.map((address, i) => {
    const tag = make('span', `manager-tag${eq(address, state.account) ? ' current' : ''}`, `${names[i]} · ${short(address)}`);
    tag.title = address;
    return tag;
  }));
  setBusy(state.busy);
}

function metadataKey(hash) { return `common-treasury:purpose:v1:${state.chainId}:${state.address.toLowerCase()}:${hash.toLowerCase()}`; }
function storePurpose(hash, text) {
  try { localStorage.setItem(metadataKey(hash), text); return true; } catch (_) { return false; }
}
function purposeFor(hash) {
  try {
    const value = localStorage.getItem(metadataKey(hash));
    if (value === null) return { text: null, status: 'missing' };
    if (ethers.keccak256(ethers.toUtf8Bytes(value)) !== hash) return { text: null, status: 'mismatch' };
    return { text: value, status: 'verified' };
  } catch (_) { return { text: null, status: 'missing' }; }
}

async function refreshData() {
  if (!state.contract) return;
  const epoch = state.epoch;
  const [balance, countValue] = await Promise.all([state.provider.getBalance(state.address), state.contract.getTransactionCount()]);
  const count = Number(countValue);
  if (!Number.isSafeInteger(count)) throw new Error('This treasury has too many requests for this interface.');
  const start = Math.max(0, count - 50);
  const requests = await Promise.all(Array.from({ length: count - start }, async (_, offset) => {
    const id = start + offset;
    const tx = await state.contract.getTransaction(id);
    const approvals = await Promise.all(state.owners.map((owner) => state.contract.isConfirmed(id, owner)));
    return { id, proposer: tx[0], to: tx[1], value: tx[2], hash: tx[3], executed: tx[4], confirmations: Number(tx[5]), approvals };
  }));
  if (epoch !== state.epoch) return;
  state.balance = balance;
  state.requests = requests.reverse();
  state.totalCount = count;
  state.pendingCount = requests.filter((request) => !request.executed).length;
  state.paidCount = requests.filter((request) => request.executed).length;
  $('balance').textContent = eth(balance);
  $('pending-count').textContent = String(state.pendingCount);
  $('executed-count').textContent = String(state.paidCount);
  $('request-limit-note').hidden = count <= 50;
  $('request-limit-note').textContent = `Showing the latest 50 of ${count} requests. The summary counts refer to these displayed requests.`;
  renderRequests();
  await refreshActivity(epoch);
}

function actionButton(label, action, id, available, title) {
  const button = make('button', `button small ${action === 'execute' ? 'primary' : 'outline'}`, label);
  button.type = 'button';
  button.dataset.requestAction = action;
  button.dataset.requestId = String(id);
  button.dataset.available = String(available);
  button.disabled = state.busy || !available;
  if (title) button.title = title;
  button.addEventListener('click', () => requestAction(action, id));
  return button;
}

function renderRequests() {
  const list = $('requests');
  const shown = state.requests.filter((request) => state.filter === 'all' || (state.filter === 'executed' ? request.executed : !request.executed));
  list.replaceChildren();
  if (!shown.length) {
    const empty = make('div', 'empty-state');
    empty.append(make('span', 'empty-symbol', '↗'), make('h3', '', state.contract ? 'No requests in this view' : 'Your first shared decision starts here'), make('p', '', state.contract ? 'Propose a payment to start collecting approvals.' : 'Connect a treasury, then propose a payment and collect two approvals.'));
    list.append(empty);
    return;
  }
  for (const request of shown) {
    const purpose = purposeFor(request.hash);
    const card = make('article', 'request-card');
    card.dataset.requestId = String(request.id);
    const top = make('div', 'request-top');
    const heading = make('h3', 'request-title');
    heading.append(make('span', 'request-id', `#${request.id}`), document.createTextNode(purpose.text || 'Purpose text is not available in this browser'));
    const amount = make('div', 'request-amount', eth(request.value));
    amount.append(make('small', '', state.mode === 'sandbox' ? 'demo ETH' : 'ETH'));
    top.append(heading, amount);
    const meta = make('div', 'request-meta');
    const to = make('span', '', 'To ');
    const recipient = make('code', '', request.to);
    recipient.title = request.to;
    to.append(recipient);
    const proposer = make('span', '', `Proposed by ${names[state.owners.findIndex((owner) => eq(owner, request.proposer))] || short(request.proposer)}`);
    meta.append(to, proposer);
    const bottom = make('div', 'request-bottom');
    const approvals = make('div', 'approval-set');
    for (let i = 0; i < 3; i++) {
      const chip = make('span', `approval-chip${request.approvals[i] ? ' yes' : ''}`, `${request.approvals[i] ? '✓ ' : ''}${names[i]}`);
      chip.title = `${state.owners[i]} — ${request.approvals[i] ? 'approved' : 'not approved'}`;
      approvals.append(chip);
    }
    approvals.append(make('span', 'approval-summary', `${request.confirmations}/2 required`));
    const actions = make('div', 'request-actions');
    if (request.executed) {
      actions.append(make('span', 'tag paid', 'Paid · executed once'));
    } else {
      const index = ownerIndex();
      const ready = request.confirmations >= 2;
      const funded = state.balance >= request.value;
      actions.append(make('span', `tag ${ready ? 'ready' : 'pending'}`, ready ? 'Approved' : 'Awaiting approvals'));
      if (index >= 0) {
        const approved = request.approvals[index];
        actions.append(actionButton(approved ? 'Revoke approval' : 'Approve', approved ? 'revoke' : 'confirm', request.id, true));
        actions.append(actionButton('Execute payment', 'execute', request.id, ready && funded, !ready ? 'Two approvals are required' : !funded ? 'The treasury balance is insufficient' : 'Send the approved ETH payment'));
      } else actions.append(make('span', 'tag neutral', 'View only'));
      if (ready && !funded) actions.append(make('span', 'tag warning', 'Insufficient treasury balance'));
    }
    bottom.append(approvals, actions);
    const fingerprint = make('div', `request-fingerprint${purpose.status === 'mismatch' ? ' warning' : ''}`, `${purpose.status === 'verified' ? 'Purpose verified against on-chain fingerprint' : purpose.status === 'mismatch' ? 'Saved purpose was altered and does not match the on-chain fingerprint' : 'Share the original purpose text with other managers to verify this fingerprint'} · ${request.hash}`);
    card.append(top, meta, bottom, fingerprint);
    if (purpose.status !== 'verified') {
      const verify = make('button', 'button quiet small', 'Verify purpose text');
      verify.type = 'button';
      verify.style.marginTop = '9px';
      verify.addEventListener('click', () => {
        const text = window.prompt('Paste the exact original payment purpose to verify it against the on-chain fingerprint.');
        if (text === null) return;
        if (ethers.keccak256(ethers.toUtf8Bytes(text)) !== request.hash) return announce('That purpose does not match the on-chain fingerprint. It was not saved.', 'error');
        if (!storePurpose(request.hash, text)) return announce('The purpose matches, but browser storage is unavailable.', 'error');
        renderRequests();
        announce('Purpose text verified and saved in this browser.', 'success');
      });
      card.append(verify);
    }
    list.append(card);
  }
}

async function refreshActivity(epoch) {
  try {
    const latest = await state.provider.getBlockNumber();
    const from = state.mode === 'sandbox' ? 0 : Math.max(0, latest - 4999);
    const events = await state.contract.queryFilter('*', from, latest);
    if (epoch !== state.epoch) return;
    $('activity-list').replaceChildren();
    if (!events.length) $('activity-list').append(make('p', 'muted', 'No contract events found in this range.'));
    const titles = { Deposit: 'Funds deposited', SubmitTransaction: 'Payment requested', ConfirmTransaction: 'Approval added', RevokeConfirmation: 'Approval revoked', ExecuteTransaction: 'Payment executed' };
    for (const log of events.slice(-20).reverse()) {
      const event = log.fragment ? log : state.contract.interface.parseLog(log);
      if (!event) continue;
      const name = event.fragment?.name || event.name;
      const args = event.args;
      const actor = args.owner || args.sender || args[0];
      const manager = state.owners.findIndex((owner) => eq(owner, actor));
      const label = manager >= 0 ? names[manager] : short(actor);
      const detail = name === 'Deposit' ? `${label} · ${eth(args.amount)} ${state.mode === 'sandbox' ? 'demo ETH' : 'ETH'}` : `${label} · Request #${args.txIndex}`;
      const item = make('div', 'activity-item');
      const content = make('div', 'activity-main');
      content.append(make('div', 'activity-name', titles[name] || name), make('div', 'activity-detail', detail));
      item.append(make('span', 'activity-icon', name === 'Deposit' ? '+' : name === 'ExecuteTransaction' ? '↗' : '✓'), content, make('span', 'activity-block', `Block ${log.blockNumber}`));
      item.title = `Transaction ${log.transactionHash}`;
      $('activity-list').append(item);
    }
    $('activity-note').textContent = state.mode === 'sandbox' ? 'Latest 20 confirmed events from this sandbox session.' : 'Latest 20 events from the most recent 5,000 blocks. Earlier history may not appear here.';
  } catch (error) {
    if (epoch !== state.epoch) return;
    $('activity-note').textContent = 'Recent events could not be loaded from this wallet provider. Balance and payment requests are still available.';
  }
}

function showReceipt(receipt) {
  $('receipt').hidden = false;
  const base = state.mode === 'wallet' ? explorers[String(state.chainId)] : null;
  $('receipt-link').hidden = !base;
  $('receipt-hash').hidden = Boolean(base);
  if (base) {
    $('receipt-link').href = `${base}/tx/${receipt.hash}`;
    $('receipt-link').textContent = short(receipt.hash);
    $('receipt-link').title = receipt.hash;
  } else $('receipt-hash').textContent = receipt.hash;
  $('receipt-details').textContent = `Block ${receipt.blockNumber} · ${receipt.gasUsed.toString()} gas`;
}

function renderBroadcasts() {
  const tracker = $('transaction-tracker');
  tracker.hidden = !state.broadcasts.length;
  tracker.replaceChildren();
  if (!state.broadcasts.length) return;
  tracker.append(make('strong', '', 'Wallet transaction tracking'));
  tracker.append(make('p', '', 'Changing the connected account or network does not cancel a broadcast transaction. Check its original network before retrying.'));
  for (const record of state.broadcasts.slice(-5).reverse()) {
    const row = make('div', 'tracked-transaction');
    row.append(make('span', '', `${record.label} · ${networkNames[String(record.chainId)] || `Chain ${record.chainId}`} · ${record.status}`));
    const base = explorers[String(record.chainId)];
    if (base) {
      const link = make('a', '', record.hash);
      link.href = `${base}/tx/${record.hash}`;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      row.append(link);
    } else row.append(make('code', '', record.hash));
    tracker.append(row);
  }
}

async function preflightWallet(snapshot) {
  if (snapshot.mode !== 'wallet') return;
  if (!window.ethereum) throw new Error('Your Ethereum wallet is unavailable. Reconnect before sending.');
  const [accounts, chain] = await Promise.all([
    window.ethereum.request({ method: 'eth_accounts' }),
    window.ethereum.request({ method: 'eth_chainId' })
  ]);
  if (snapshot.epoch !== state.epoch) throw new Error('The connected session changed. Review the account and network before trying again.');
  if (!accounts.length || !eq(accounts[0], snapshot.account)) throw new Error('Your selected wallet account changed. Reconnect and review the account before sending.');
  if (BigInt(chain) !== snapshot.chainId) throw new Error('Your wallet network changed. Reconnect to the intended network before sending.');
  if (!eq(state.address, snapshot.address) || !eq(state.account, snapshot.account)) throw new Error('The displayed treasury session changed. Reconnect before sending.');
}

async function transact(label, send, after) {
  if (state.busy || !state.signer || !state.contract) return;
  const epoch = state.epoch;
  const snapshot = {
    epoch, provider: state.provider, contract: state.contract, signer: state.signer,
    address: state.address, account: state.account, chainId: state.chainId, mode: state.mode
  };
  const operation = { epoch, mode: snapshot.mode, label, hash: null, chainId: snapshot.chainId, interrupted: false };
  state.activeOperation = operation;
  let broadcast;
  setBusy(true);
  $('receipt').hidden = true;
  announce(snapshot.mode === 'wallet' ? `${label}: review and confirm the transaction in your wallet.` : `${label}: sending transaction to the sandbox…`, 'pending');
  try {
    await preflightWallet(snapshot);
    if (epoch !== state.epoch) return;
    const transaction = await send(snapshot);
    operation.hash = transaction.hash;
    if (snapshot.mode === 'wallet') {
      broadcast = { hash: transaction.hash, chainId: snapshot.chainId, label, status: 'Awaiting confirmation' };
      state.broadcasts.push(broadcast);
      renderBroadcasts();
    }
    if (epoch === state.epoch) announce(`${label}: transaction submitted. Waiting for confirmation…`, 'pending');
    const receipt = await transaction.wait();
    if (!receipt || receipt.status !== 1) {
      if (broadcast) { broadcast.status = 'Failed on chain'; renderBroadcasts(); }
      throw new Error('The transaction did not succeed.');
    }
    if (broadcast) { broadcast.status = `Confirmed in block ${receipt.blockNumber}`; renderBroadcasts(); }
    if (epoch !== state.epoch) return;
    let followup = '';
    if (after) {
      try { followup = (await after(receipt)) || ''; }
      catch (_) { followup = 'The transaction succeeded, but local notes could not be updated.'; }
    }
    showReceipt(receipt);
    try {
      await refreshData();
      if (epoch === state.epoch) announce(`${label} confirmed in block ${receipt.blockNumber}.${followup ? ` ${followup}` : ''}`, 'success');
    } catch (_) {
      if (epoch === state.epoch) announce(`${label} confirmed in block ${receipt.blockNumber}. The records could not refresh; use Refresh records before taking another action. ${followup}`.trim(), 'success');
    }
  } catch (error) {
    if (broadcast && broadcast.status === 'Awaiting confirmation') {
      broadcast.status = error?.receipt?.status === 0 ? 'Failed on chain' : 'Confirmation not established — check original network';
      renderBroadcasts();
    }
    if (epoch === state.epoch) {
      announce(broadcast && !error?.receipt ? `${label} was broadcast. Confirmation is not established; check transaction tracking before retrying.` : errorMessage(error), 'error');
      try { await refreshData(); } catch (_) { /* Keep original action failure visible. */ }
    }
  } finally {
    if (epoch === state.epoch) {
      if (state.activeOperation === operation) state.activeOperation = null;
      setBusy(false);
    }
  }
}

function positiveAmount(input) {
  const text = input.trim();
  if (!/^\d+(\.\d{1,18})?$/.test(text)) throw new Error('Enter a positive ETH amount with up to 18 decimal places.');
  const amount = ethers.parseEther(text);
  if (amount <= 0n) throw new Error('The ETH amount must be greater than zero.');
  return amount;
}

async function deposit(event) {
  event.preventDefault();
  try {
    const value = positiveAmount($('deposit-amount').value);
    await transact('Deposit', (session) => session.signer.sendTransaction({ to: session.address, value, chainId: session.chainId }));
  } catch (error) { announce(errorMessage(error), 'error'); }
}

async function submitRequest(event) {
  event.preventDefault();
  if (!isManager()) return announce('Only a designated manager can submit a payment request.', 'error');
  try {
    const recipient = $('recipient').value.trim();
    if (!ethers.isAddress(recipient) || eq(recipient, ethers.ZeroAddress)) throw new Error('Enter a valid, nonzero recipient address.');
    const amount = positiveAmount($('payment-amount').value);
    const purpose = $('purpose').value.trim();
    if (purpose.length < 3 || purpose.length > 240) throw new Error('Describe the purpose in 3 to 240 characters.');
    const hash = ethers.keccak256(ethers.toUtf8Bytes(purpose));
    await transact('Payment request', (session) => session.contract.connect(session.signer).submitTransaction(recipient, amount, hash, { chainId: session.chainId }), () => {
      const saved = storePurpose(hash, purpose);
      if (!saved) return 'Browser storage is unavailable. Keep a copy of the purpose text to verify it later.';
      $('purpose').value = '';
    });
  } catch (error) { announce(errorMessage(error), 'error'); }
}

async function requestAction(action, id) {
  const namesByAction = { confirm: 'Approval', revoke: 'Approval revocation', execute: 'Payment execution' };
  const methods = { confirm: 'confirmTransaction', revoke: 'revokeConfirmation', execute: 'executeTransaction' };
  await transact(namesByAction[action], (session) => session.contract.connect(session.signer)[methods[action]](id, { chainId: session.chainId }));
}

$('sandbox-mode').addEventListener('click', () => selectMode('sandbox'));
$('wallet-mode').addEventListener('click', () => selectMode('wallet'));
$('launch-demo').addEventListener('click', launchSandbox);
$('reset-demo').addEventListener('click', launchSandbox);
$('wallet-connect-form').addEventListener('submit', connectWallet);
$('deposit-form').addEventListener('submit', deposit);
$('request-form').addEventListener('submit', submitRequest);
$('demo-role').addEventListener('change', async (event) => {
  if (state.busy || state.mode !== 'sandbox' || !state.provider) return;
  setBusy(true);
  try {
    state.signer = await state.provider.getSigner(state.accounts[Number(event.target.value)]);
    state.account = await state.signer.getAddress();
    updateConnection();
    await refreshData();
    announce(`Now acting as ${ownerIndex() >= 0 ? names[ownerIndex()] : 'Supporter'}.`, 'success');
  } catch (error) { announce(errorMessage(error), 'error'); }
  finally { setBusy(false); }
});
$('refresh').addEventListener('click', async () => {
  if (state.busy || !state.contract) return;
  setBusy(true);
  try { await refreshData(); announce('Treasury records refreshed.', 'success'); }
  catch (error) { announce(errorMessage(error), 'error'); }
  finally { setBusy(false); }
});
for (const button of document.querySelectorAll('[data-filter]')) button.addEventListener('click', () => {
  state.filter = button.dataset.filter;
  for (const other of document.querySelectorAll('[data-filter]')) {
    const selected = other === button;
    other.classList.toggle('selected', selected);
    other.setAttribute('aria-pressed', String(selected));
  }
  renderRequests();
});
setBusy(false);
