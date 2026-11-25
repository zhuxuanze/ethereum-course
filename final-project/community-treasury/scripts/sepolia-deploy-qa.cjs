// Offline browser and receipt rehearsal. The private test EVM uses the Sepolia
// chain ID solely to exercise the wallet network check. Nothing leaves this fixture.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ganache = require('ganache');
const ethers = require('ethers');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

async function main() {
  const root = path.resolve(__dirname, '..');
  const provider = ganache.provider({ chain: { chainId: 11155111, hardfork: 'shanghai' },
    logging: { quiet: true }, wallet: { totalAccounts: 5 } });
  const checks = [];
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const staticFiles = {
      '/deploy-sepolia.html': 'deploy/deploy-sepolia.html', '/deploy-sepolia.js': 'deploy/deploy-sepolia.js',
      '/wallet-providers.js': 'web/wallet-providers.js',
      '/vendor/ethers.umd.min.js': 'node_modules/ethers/dist/ethers.umd.min.js',
      '/artifacts/CommunityTreasury.json': 'artifacts/CommunityTreasury.json'
    };
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      const file = url.hostname === 'classroom.invalid' && staticFiles[url.pathname];
      return file ? route.fulfill({ path: path.join(root, file) }) : route.abort();
    });
    const accounts = await provider.request({ method: 'eth_accounts', params: [] });
    let selected = accounts[0];
    let network = '0x1';
    let switchMode = 'decline';
    let allowConnect = false;
    const rpcMethods = [];
    let sendCount = 0;
    await page.exposeFunction('fixtureRpc', async payload => {
      rpcMethods.push(payload.method);
      if (payload.method === 'eth_requestAccounts' && !allowConnect) return { walletError: 4001 };
      if (payload.method === 'wallet_switchEthereumChain') {
        assert.deepEqual(payload.params, [{ chainId: '0xaa36a7' }]);
        if (switchMode === 'decline') return { walletError: 4001 };
        if (switchMode === 'switch') network = '0xaa36a7';
        return null;
      }
      if (payload.method === 'eth_chainId') return network;
      if (['eth_requestAccounts', 'eth_accounts'].includes(payload.method)) return [selected];
      if (payload.method === 'eth_sendTransaction') sendCount++;
      return provider.request(payload);
    });
    await page.addInitScript(() => {
      function makeWallet(name) {
        const listeners = new Map();
        return {
          on(event, fn) { if (!listeners.has(event)) listeners.set(event, new Set()); listeners.get(event).add(fn); },
          removeListener(event, fn) { listeners.get(event)?.delete(fn); },
          async request(payload) {
            window.calledWallets.push(name);
            if (name === 'MetaMask' && window.holdAccess && payload.method === 'eth_requestAccounts') {
              await new Promise(resolve => { window.releaseAccess = resolve; });
            }
            const result = await window.fixtureRpc(payload);
            if (result?.walletError) throw Object.assign(new Error('User declined'), { code: result.walletError });
            return result;
          }
        };
      }
      window.calledWallets = [];
      const available = [
        { name: 'Binance Wallet', rdns: 'com.binance', uuid: 'db09b5a1-6692-41a4-9789-c70789f3cabd' },
        { name: 'MetaMask', rdns: 'io.metamask', uuid: 'acbbf8b4-8f96-4867-802e-4f14a6181957' },
        { name: 'Bybit Wallet', rdns: 'com.bybit', uuid: 'c508af1b-e5ce-4be7-91da-797156475866' }
      ].map(info => ({ info, provider: makeWallet(info.name) }));
      window.ethereum = available[0].provider;
      if (!location.search.includes('legacy')) window.addEventListener('eip6963:requestProvider', () => {
        for (const detail of available) window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail }));
      });
    });
    await page.goto('https://classroom.invalid/deploy-sepolia.html?legacy=1');
    assert.equal(await page.locator('#wallet-choice option:checked').textContent(), 'Browser wallet');
    assert.equal(await page.locator('#wallet-choice option').count(), 1);
    checks.push('A single legacy injected wallet is available when EIP-6963 discovery is absent.');
    await page.goto('https://classroom.invalid/deploy-sepolia.html');
    assert.deepEqual(rpcMethods, []);
    const picker = page.locator('#wallet-choice');
    assert.deepEqual(await picker.locator('option').allTextContents(), ['Binance Wallet', 'MetaMask', 'Bybit Wallet']);
    assert.equal(await picker.locator('option:checked').textContent(), 'MetaMask');
    checks.push('With Binance occupying window.ethereum, EIP-6963 discovers Binance, MetaMask and Bybit and selects MetaMask initially.');
    const fields = page.locator('input[name=owner]');
    for (let i = 0; i < 3; i++) await fields.nth(i).fill(accounts[i]);
    const status = page.locator('#status');
    async function expectStatus(fragment) { await status.filter({ hasText: fragment }).waitFor({ timeout: 15000 }); }
    allowConnect = true;
    await page.evaluate(() => { window.holdAccess = true; });
    await page.locator('#review').click();
    await page.waitForFunction(() => !!window.releaseAccess);
    await picker.selectOption({ label: 'Bybit Wallet' });
    await page.evaluate(() => { window.holdAccess = false; window.releaseAccess(); });
    await page.waitForFunction(() => !document.querySelector('#review').disabled);
    await picker.selectOption({ label: 'Binance Wallet' });
    await page.locator('#review').click();
    await expectStatus('network switch declined');
    assert.equal(await page.locator('#send').isDisabled(), true);
    assert.equal(sendCount, 0);
    assert.deepEqual(await page.evaluate(() => window.calledWallets), ['MetaMask','Binance Wallet','Binance Wallet','Binance Wallet']);
    checks.push('Changing wallets while a connection is pending discards its result and leaves only the newly chosen wallet active.');
    await picker.selectOption({ label: 'MetaMask' });
    await page.evaluate(() => { window.calledWallets.length = 0; });
    allowConnect = false;
    rpcMethods.length = 0;
    await page.locator('#review').click();
    await expectStatus('wallet request was declined');
    assert.deepEqual(rpcMethods, ['eth_requestAccounts']);
    allowConnect = true;
    rpcMethods.length = 0;
    await page.locator('#review').click();
    await expectStatus('network switch declined');
    assert.deepEqual(rpcMethods, ['eth_requestAccounts', 'eth_chainId', 'wallet_switchEthereumChain']);
    assert.equal(await page.locator('#send').isDisabled(), true);
    assert.equal(sendCount, 0);
    checks.push('Connect authorization precedes the network switch. Declining either prompt leaves signing unavailable.');
    switchMode = 'ignore';
    await page.locator('#review').click();
    await expectStatus('Switch the wallet to Sepolia');
    assert.equal(sendCount, 0);
    checks.push('A wallet that acknowledges a switch but stays on another network cannot preview a deployment.');
    switchMode = 'switch';
    await fields.nth(2).fill(accounts[0]);
    await page.locator('#review').click();
    await expectStatus('three different');
    assert.equal(sendCount, 0);
    checks.push('Duplicate managers block deployment.');
    await fields.nth(2).fill(accounts[2]);
    rpcMethods.length = 0;
    await page.locator('#review').click();
    await expectStatus('before signing');
    assert.deepEqual(rpcMethods.slice(0, 5), ['eth_requestAccounts', 'eth_chainId', 'wallet_switchEthereumChain', 'eth_chainId', 'eth_accounts']);
    assert.equal(sendCount, 0);
    checks.push('Approving the switch to Sepolia produces a fee preview without submitting a transaction.');
    network = '0x1';
    rpcMethods.length = 0;
    await page.locator('#send').click();
    await expectStatus('Switch the wallet to Sepolia');
    assert.equal(sendCount, 0);
    assert.deepEqual(rpcMethods, ['eth_chainId']);
    checks.push('The signing button checks the network without switching chains or sending on a mismatched network.');
    network = '0xaa36a7';
    await page.locator('#review').click();
    await expectStatus('before signing');
    selected = accounts[1];
    await page.locator('#send').click();
    await expectStatus('wallet account changed');
    assert.equal(sendCount, 0);
    checks.push('A changed funding account invalidates signing.');
    selected = accounts[0];
    await page.locator('#review').click();
    await expectStatus('before signing');
    await page.locator('#send').click();
    await expectStatus('Deployment verified');
    assert.equal(sendCount, 1);
    assert.deepEqual(await page.evaluate(() => [...new Set(window.calledWallets)]), ['MetaMask']);
    checks.push('All connection, chain switching, signing and receipt requests use the selected MetaMask instance.');
    const deployment = await page.evaluate(async () => (await fetch(document.querySelector('#proof').href)).json());
    assert.equal(deployment.runtimeMatches, true);
    assert.deepEqual(deployment.owners, accounts.slice(0, 3).map(ethers.getAddress));
    assert.equal(deployment.threshold, 2);
    checks.push('Single wallet submission produces a verified runtime, three expected managers and threshold two.');
    await page.reload();
    await expectStatus('submitted from this tab');
    await page.locator('#verify').click();
    await expectStatus('Deployment verified');
    assert.equal(sendCount, 1);
    checks.push('Reload resumes verification of the existing hash without a second submission.');
    const rpc = new ethers.BrowserProvider(provider, undefined, { cacheTimeout: -1 });
    const artifact = JSON.parse(fs.readFileSync(path.join(root, 'artifacts/CommunityTreasury.json')));
    const [a, b, c] = await Promise.all([0, 1, 2].map(i => rpc.getSigner(i)));
    const treasury = new ethers.Contract(deployment.address, artifact.abi, a);
    const deposit = await (await a.sendTransaction({ to: deployment.address, value: ethers.parseEther('1') })).wait();
    const submit = await (await treasury.submitTransaction(accounts[4], ethers.parseEther('0.25'), ethers.id('docs'))).wait();
    await (await treasury.confirmTransaction(0)).wait();
    await (await treasury.revokeConfirmation(0)).wait();
    await (await treasury.connect(b).confirmTransaction(0)).wait();
    await (await treasury.confirmTransaction(0)).wait();
    const execute = await (await treasury.connect(c).executeTransaction(0)).wait();
    const { verifyPayment } = await import('./verify-payment.mjs');
    const inputs = { chainId: 11155111, address: deployment.address, owners: accounts.slice(0, 3),
      depositHash: deposit.hash, submitHash: submit.hash, executeHash: execute.hash };
    const proof = await verifyPayment(rpc, inputs);
    assert.deepEqual(proof.timeline.map(row => row.approvals), [0, 1, 0, 1, 2, 2]);
    assert.equal(proof.balances.treasuryAfterWei, String(ethers.parseEther('0.75')));
    assert.equal(proof.balances.recipientDeltaWei, String(ethers.parseEther('0.25')));
    assert.equal(proof.balances.recipientPaidExecutionFee, false);
    await assert.rejects(verifyPayment(rpc, { ...inputs, executeHash: deposit.hash }), /Missing treasury event/);
    // Exercise an outer wallet envelope independently of the contract's business actor.
    // Keep the fixture's actual treasury logs and storage, and model a distinct outer fee payer.
    const asRouted = (removeTreasuryLogs = false) => new Proxy(rpc, {
      get(original, key) {
        if (key !== 'getTransactionReceipt') {
          const value = Reflect.get(original, key, original);
          return typeof value === 'function' ? value.bind(original) : value;
        }
        return async hash => {
          const receipt = await original.getTransactionReceipt(hash);
          return {hash:receipt.hash, status:receipt.status, to:ethers.getAddress(accounts[3]), from:ethers.getAddress(accounts[3]),
            blockNumber:receipt.blockNumber, blockHash:receipt.blockHash, index:receipt.index, fee:receipt.fee,
            logs:removeTreasuryLogs ? [] : receipt.logs};
        };
      }
    });
    const routed = await verifyPayment(asRouted(), inputs);
    assert.equal(routed.payment.executor, ethers.getAddress(accounts[2]));
    assert.equal(routed.payment.executionFeePayer, ethers.getAddress(accounts[3]));
    await assert.rejects(verifyPayment(asRouted(true), inputs), /containing treasury events/);
    checks.push('Wallet-routed receipt fixture requires authentic treasury logs and distinguishes the logical executor from the outer fee payer.');
    const selfPaidSubmit = await (await treasury.submitTransaction(accounts[2], ethers.parseEther('0.25'), ethers.id('review'))).wait();
    await (await treasury.confirmTransaction(1)).wait();
    await (await treasury.connect(b).confirmTransaction(1)).wait();
    const selfPaidExecute = await (await treasury.connect(c).executeTransaction(1)).wait();
    const selfPaid = await verifyPayment(rpc, { ...inputs, submitHash: selfPaidSubmit.hash, executeHash: selfPaidExecute.hash });
    assert.equal(selfPaid.balances.recipientPaidExecutionFee, true);
    assert.equal(BigInt(selfPaid.balances.recipientDeltaWei) + BigInt(selfPaid.payment.executionFeeWei), ethers.parseEther('0.25'));
    assert.deepEqual(errors, []);
    checks.push('Read-only payment verification reconstructs deposit, proposal, approval, revocation, two approvals and execution.');
    checks.push('A different receipt supplied as the execution hash is rejected.');
    checks.push('Native ETH balances verified for a separate recipient and for a recipient who pays the execution gas.');
    const result = { checkedAt: new Date().toISOString(), environment: 'Offline Ganache with injected test provider; headless Chromium',
      publicBlockchain: false, classroomWalletExtension: false, status: 'passed', checks };
    fs.writeFileSync(path.join(root, 'evidence/sepolia-deployment-rehearsal.json'), JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify(result, null, 2));
  } finally {
    if (browser) await browser.close();
    await provider.disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
