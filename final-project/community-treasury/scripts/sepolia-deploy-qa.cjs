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
    let sendCount = 0;
    await page.exposeFunction('fixtureRpc', async payload => {
      if (payload.method === 'eth_chainId') return network;
      if (['eth_requestAccounts', 'eth_accounts'].includes(payload.method)) return [selected];
      if (payload.method === 'eth_sendTransaction') sendCount++;
      return provider.request(payload);
    });
    await page.addInitScript(() => { window.ethereum = { request: payload => window.fixtureRpc(payload) }; });
    await page.goto('https://classroom.invalid/deploy-sepolia.html');
    const fields = page.locator('input[name=owner]');
    for (let i = 0; i < 3; i++) await fields.nth(i).fill(accounts[i]);
    const status = page.locator('#status');
    async function expectStatus(fragment) { await status.filter({ hasText: fragment }).waitFor({ timeout: 15000 }); }
    await page.locator('#review').click();
    await expectStatus('Switch the wallet to Sepolia');
    assert.equal(sendCount, 0);
    checks.push('Wrong wallet network blocks preview and signing.');
    network = '0xaa36a7';
    await fields.nth(2).fill(accounts[0]);
    await page.locator('#review').click();
    await expectStatus('three different');
    assert.equal(sendCount, 0);
    checks.push('Duplicate managers block deployment.');
    await fields.nth(2).fill(accounts[2]);
    await page.locator('#review').click();
    await expectStatus('before signing');
    assert.equal(sendCount, 0);
    selected = accounts[1];
    await page.locator('#send').click();
    await expectStatus('wallet account changed');
    assert.equal(sendCount, 0);
    checks.push('Preview only reads chain state. A changed funding account invalidates signing.');
    selected = accounts[0];
    await page.locator('#review').click();
    await expectStatus('before signing');
    await page.locator('#send').click();
    await expectStatus('Deployment verified');
    assert.equal(sendCount, 1);
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
