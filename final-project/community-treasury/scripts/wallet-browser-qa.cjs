// Local injected EIP-1193 integration checks. No extension wallet or public network is used.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
function loadPlaywright() {
  if (process.env.PLAYWRIGHT_MODULE) return require(process.env.PLAYWRIGHT_MODULE);
  try { return require('playwright'); }
  catch (error) {
    throw new Error('Browser QA requires optional Playwright. Install it locally or set PLAYWRIGHT_MODULE to its package path.', { cause: error });
  }
}
const { chromium } = loadPlaywright();
const solc = require('solc');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'evidence/wallet-browser-test-results.json');
const treasuryArtifact = JSON.parse(fs.readFileSync(path.join(root, 'artifacts/CommunityTreasury.json')));
const fakeSource = 'pragma solidity 0.8.30; contract Lookalike { address[3] public owners; uint public constant REQUIRED_CONFIRMATIONS=2; constructor(address[3] memory o){owners=o;} function getTransactionCount() external pure returns(uint){return 0;} receive() external payable {} }';
const fakeOutput = JSON.parse(solc.compile(JSON.stringify({ language: 'Solidity', sources: { 'Lookalike.sol': { content: fakeSource } }, settings: { evmVersion: 'shanghai', outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } } } })));
const fakeCompiled = fakeOutput.contracts['Lookalike.sol'].Lookalike;
const fakeArtifact = { abi: fakeCompiled.abi, bytecode: '0x' + fakeCompiled.evm.bytecode.object };
const results = [];
const pageErrors = [];
const startedAt = new Date().toISOString();
let browser, page, fixture;

async function check(name, body) {
  const started = Date.now();
  try {
    await body();
    results.push({ name, status: 'passed', durationMs: Date.now() - started });
    console.log('PASS', name);
  } catch (error) {
    results.push({ name, status: 'failed', durationMs: Date.now() - started, error: String(error.message) });
    console.log('FAIL', name, String(error.message).slice(0, 500));
  }
}

async function idle() { await page.waitForFunction(() => !document.body.classList.contains('busy'), null, { timeout: 20000 }); }
async function connect(address = fixture.treasury) {
  await page.locator('#contract-address').fill(address);
  await page.locator('#connect-wallet').click();
  await idle();
}
async function normalizeConnection() {
  await page.evaluate(() => {
    const q = window.__walletQA;
    if (q.pending) { q.pending.reject(Object.assign(new Error('QA cancels old wallet request'), { code: 4001 })); q.pending = null; }
    q.pauseSend = false;
    q.selected = q.accounts[0];
    q.chainOverride = null;
  });
  await idle();
  await connect();
  await page.waitForFunction(expected => document.getElementById('current-account').textContent.toLowerCase() === expected.toLowerCase(), fixture.owners[0]);
}
async function sendCount() { return page.evaluate(() => window.__walletQA.sent.length); }

async function expectEmptyDrafts() {
  for (const id of ['recipient', 'payment-amount', 'purpose', 'deposit-amount']) {
    assert.equal(await page.locator('#' + id).inputValue(), '', id);
  }
}

async function fillWalletDrafts() {
  await page.locator('#recipient').fill(fixture.recipient);
  await page.locator('#payment-amount').fill('0.25');
  await page.locator('#purpose').fill('Wallet draft before context change');
  await page.locator('#deposit-amount').fill('0.1');
}

async function installWallet(chainId) {
  return page.evaluate(async ({ treasuryArtifact, fakeArtifact, chainId }) => {
    const raw = Ganache.provider({ logging: { quiet: true }, chain: { chainId, hardfork: 'shanghai' }, wallet: { deterministic: true, totalAccounts: 6, defaultBalance: 1000 } });
    const direct = new ethers.BrowserProvider(raw, undefined, { cacheTimeout: -1 });
    direct.pollingInterval = 10;
    const accounts = await direct.send('eth_accounts', []);
    const signer = await direct.getSigner(accounts[0]);
    const owners = accounts.slice(0, 3).map(ethers.getAddress);
    const treasury = await new ethers.ContractFactory(treasuryArtifact.abi, treasuryArtifact.bytecode, signer).deploy(owners);
    await treasury.waitForDeployment();
    const fake = await new ethers.ContractFactory(fakeArtifact.abi, fakeArtifact.bytecode, signer).deploy(owners);
    await fake.waitForDeployment();
    const handlers = new Map();
    const q = { raw, direct, signer, treasury, accounts, selected: accounts[0], chainOverride: null, pauseSend: false, pending: null, sent: [], handlers };
    const wrapper = {
      async request({ method, params }) {
        if (method === 'eth_requestAccounts' || method === 'eth_accounts') return q.selected ? [q.selected] : [];
        if (method === 'eth_chainId' && q.chainOverride) return q.chainOverride;
        if (method === 'eth_sendTransaction') {
          if (q.pauseSend) await new Promise((resolve, reject) => { q.pending = { resolve, reject }; });
          const from = params?.[0]?.from;
          if (!q.selected || from.toLowerCase() !== q.selected.toLowerCase()) throw Object.assign(new Error('Selected account mismatch'), { code: 4100 });
          q.sent.push({ from, to: params[0].to, value: params[0].value, chainId: params[0].chainId });
        }
        return raw.request({ method, params: params || [] });
      },
      on(event, callback) { if (!handlers.has(event)) handlers.set(event, new Set()); handlers.get(event).add(callback); return wrapper; },
      removeListener(event, callback) { handlers.get(event)?.delete(callback); return wrapper; }
    };
    q.emit = (event, payload) => { for (const callback of [...(handlers.get(event) || [])]) callback(payload); };
    q.provider = wrapper;
    window.__walletQA = q;
    Object.defineProperty(window, 'ethereum', { value: wrapper, configurable: true });
    window.dispatchEvent(new Event('ethereum#initialized'));
    return { treasury: await treasury.getAddress(), fake: await fake.getAddress(), owners, recipient: ethers.getAddress(accounts[4]), chainId };
  }, { treasuryArtifact, fakeArtifact, chainId });
}

(async () => {
  const edge = '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge';
  const executablePath = process.env.BROWSER_EXECUTABLE || (fs.existsSync(edge) ? edge : undefined);
  browser = await chromium.launch({ headless: true, executablePath });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  page = await context.newPage();
  page.on('pageerror', error => pageErrors.push(String(error.message)));
  await page.goto(process.env.QA_URL || 'http://127.0.0.1:8874', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.Ganache && window.ethers);
  fixture = await installWallet(1337);
  await page.locator('#launch-demo').click(); await idle();
  assert.match(await page.locator('#recipient').inputValue(), /^0x[0-9a-f]{40}$/i);
  assert.equal(await page.locator('#payment-amount').inputValue(), '0.25');
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#wallet-mode').click();

  await check('first wallet connection after sandbox use has blank payment and deposit fields', async () => {
    await connect();
    assert.equal(await page.locator('#submit-request').isEnabled(), true);
    await expectEmptyDrafts();
  });

  await check('rejects an ABI-compatible contract with different runtime bytecode', async () => {
    await connect(fixture.fake);
    assert.match(await page.locator('#status-text').textContent(), /does not contain the verified course treasury contract/);
    assert.equal(await page.locator('#deposit-button').isDisabled(), true);
    assert.equal(await sendCount(), 0);
  });

  await check('rejects an unsupported EVM chain before enabling payments', async () => {
    await page.evaluate(() => { window.__walletQA.chainOverride = '0x89'; });
    await connect();
    assert.match(await page.locator('#status-text').textContent(), /chain ID 137.*not enabled/i);
    assert.equal(await page.locator('#deposit-button').isDisabled(), true);
    await page.evaluate(() => { window.__walletQA.chainOverride = null; });
  });

  await check('connects the exact contract on local chain 1337 and displays its three owners', async () => {
    await normalizeConnection();
    assert.match(await page.locator('#network-badge').textContent(), /Local network/);
    assert.equal(await page.locator('#treasury-address').textContent(), fixture.treasury);
    const owners = await page.locator('#managers .manager-tag').evaluateAll(nodes => nodes.map(node => node.title));
    assert.deepEqual(owners, fixture.owners);
    assert.equal(await page.locator('#deposit-button').isEnabled(), true);
  });

  await check('wallet-mode deposit produces a mined local transaction and exact displayed balance', async () => {
    await page.locator('#deposit-amount').fill('1.0000009');
    const before = await sendCount();
    await page.locator('#deposit-button').click(); await idle();
    assert.match(await page.locator('#status-text').textContent(), /Deposit confirmed/);
    assert.equal(await page.locator('#balance').textContent(), '1.0000009');
    assert.equal(await sendCount(), before + 1);
    const balance = await page.evaluate(async () => (await window.__walletQA.direct.getBalance(await window.__walletQA.treasury.getAddress())).toString());
    assert.equal(balance, '1000000900000000000');
    assert.match(await page.locator('#transaction-tracker').textContent(), /Confirmed in block/);
  });

  await check('preflight rejects an unannounced account mismatch without broadcasting', async () => {
    await normalizeConnection();
    await fillWalletDrafts();
    const before = await sendCount();
    await page.evaluate(() => { const q = window.__walletQA; q.selected = q.accounts[1]; });
    await page.locator('#deposit-button').click(); await idle();
    assert.match(await page.locator('#status-text').textContent(), /selected wallet account changed/);
    await expectEmptyDrafts();
    assert.equal(await page.locator('#deposit-button').isDisabled(), true);
    assert.equal(await page.locator('#submit-request').isDisabled(), true);
    assert.equal(await page.locator('#treasury-address').innerText(), 'Not connected');
    assert.equal(await sendCount(), before);
    await page.evaluate(() => { const q = window.__walletQA; q.selected = q.accounts[0]; });
  });

  await check('preflight rejects an unannounced network mismatch without broadcasting', async () => {
    await normalizeConnection();
    await fillWalletDrafts();
    const before = await sendCount();
    await page.evaluate(() => { window.__walletQA.chainOverride = '0x7a69'; });
    await page.locator('#deposit-button').click(); await idle();
    assert.match(await page.locator('#status-text').textContent(), /wallet network changed/);
    await expectEmptyDrafts();
    assert.equal(await page.locator('#deposit-button').isDisabled(), true);
    assert.equal(await page.locator('#submit-request').isDisabled(), true);
    assert.equal(await page.locator('#treasury-address').innerText(), 'Not connected');
    assert.equal(await sendCount(), before);
    await page.evaluate(() => { window.__walletQA.chainOverride = null; });
  });

  await check('account-change event interrupts an open wallet request and unlocks the new account', async () => {
    await normalizeConnection();
    await fillWalletDrafts();
    await page.evaluate(() => { window.__walletQA.pauseSend = true; });
    await page.locator('#deposit-button').click();
    await page.waitForFunction(() => Boolean(window.__walletQA.pending));
    await page.evaluate(() => { const q = window.__walletQA; q.selected = q.accounts[1]; q.emit('accountsChanged', [q.selected]); });
    await idle();
    assert.equal((await page.locator('#current-account').textContent()).toLowerCase(), fixture.owners[1].toLowerCase());
    assert.equal(await page.locator('#deposit-button').isEnabled(), true);
    assert.match(await page.locator('#status-text').textContent(), /wallet request may still be open/);
    await expectEmptyDrafts();
    await page.evaluate(() => { const q = window.__walletQA; q.pauseSend = false; q.pending.reject(Object.assign(new Error('Canceled by QA'), { code: 4001 })); q.pending = null; });
    await page.waitForTimeout(150);
    assert.equal((await page.locator('#current-account').textContent()).toLowerCase(), fixture.owners[1].toLowerCase());
  });

  await check('chain-change event resets the session and unlocks reconnection during an open request', async () => {
    await normalizeConnection();
    await fillWalletDrafts();
    await page.evaluate(() => { window.__walletQA.pauseSend = true; });
    await page.locator('#deposit-button').click();
    await page.waitForFunction(() => Boolean(window.__walletQA.pending));
    await page.evaluate(() => { const q = window.__walletQA; q.chainOverride = '0x7a69'; q.emit('chainChanged', q.chainOverride); });
    await idle();
    assert.equal(await page.locator('#connect-wallet').isEnabled(), true);
    assert.equal(await page.locator('#deposit-button').isDisabled(), true);
    assert.equal(await page.locator('#treasury-address').textContent(), 'Not connected');
    assert.match(await page.locator('#status-text').textContent(), /wallet network changed/);
    await expectEmptyDrafts();
    await page.evaluate(() => { const q = window.__walletQA; q.pauseSend = false; q.pending.reject(Object.assign(new Error('Canceled by QA'), { code: 4001 })); q.pending = null; q.chainOverride = null; });
    await page.waitForTimeout(150);
    assert.equal(await page.locator('#deposit-button').isDisabled(), true);
  });

  await check('account disconnect clears payment controls without blocking reconnection', async () => {
    await normalizeConnection();
    await page.evaluate(() => { const q = window.__walletQA; q.selected = null; q.emit('accountsChanged', []); });
    await idle();
    assert.equal(await page.locator('#connect-wallet').isEnabled(), true);
    assert.equal(await page.locator('#deposit-button').isDisabled(), true);
    assert.match(await page.locator('#status-text').textContent(), /wallet disconnected/);
  });

  await check('exact raw purpose text including surrounding whitespace verifies against an external commitment', async () => {
    await normalizeConnection();
    const record = await page.evaluate(async () => {
      const q = window.__walletQA;
      const text = '  External purpose with exact whitespace  ';
      const hash = ethers.keccak256(ethers.toUtf8Bytes(text));
      const id = await q.treasury.getTransactionCount();
      const tx = await q.treasury.submitTransaction(q.accounts[4], ethers.parseEther('0.0000009'), hash);
      await tx.wait();
      return { id: Number(id), text, hash };
    });
    await page.locator('#refresh').click(); await idle();
    const card = page.locator(`article.request-card[data-request-id="${record.id}"]`);
    assert.match(await card.locator('.request-amount').textContent(), /0\.0000009/);
    page.once('dialog', dialog => dialog.accept(record.text));
    await card.getByRole('button', { name: 'Verify purpose text' }).click();
    assert.match(await card.locator('.request-fingerprint').textContent(), /Purpose verified against on-chain fingerprint/);
    const saved = await page.evaluate(({ address, hash }) => localStorage.getItem(`common-treasury:purpose:v1:1337:${address.toLowerCase()}:${hash.toLowerCase()}`), { address: fixture.treasury, hash: record.hash });
    assert.equal(saved, record.text);
  });

  await check('altered local purpose metadata is rejected and never rendered as trusted content', async () => {
    const record = await page.evaluate(async () => {
      const q = window.__walletQA;
      const tx = await q.treasury.getTransaction(0);
      const key = `common-treasury:purpose:v1:1337:${(await q.treasury.getAddress()).toLowerCase()}:${tx.descriptionHash.toLowerCase()}`;
      localStorage.setItem(key, '<strong data-qa-altered>Changed purpose</strong>');
      return { key };
    });
    await page.locator('#refresh').click(); await idle();
    const card = page.locator('article.request-card[data-request-id="0"]');
    assert.match(await card.locator('.request-fingerprint').textContent(), /Saved purpose was altered/);
    assert.equal(await card.locator('[data-qa-altered]').count(), 0);
    assert.ok(record.key);
  });

  await check('previous confirmed transaction hashes remain visible after session changes', async () => {
    assert.match(await page.locator('#transaction-tracker').textContent(), /Confirmed in block/);
    assert.match(await page.locator('#transaction-tracker').textContent(), /0x[0-9a-f]{64}/i);
  });

  await check('switching between two deployed treasuries clears the old wallet draft', async () => {
    await normalizeConnection();
    await fillWalletDrafts();
    const otherAddress = await page.evaluate(async ({ treasuryArtifact }) => {
      const q = window.__walletQA;
      const factory = new ethers.ContractFactory(treasuryArtifact.abi, treasuryArtifact.bytecode, q.signer);
      const treasury = await factory.deploy(q.accounts.slice(0, 3));
      await treasury.waitForDeployment();
      return treasury.getAddress();
    }, { treasuryArtifact });
    await connect(otherAddress);
    assert.equal(await page.locator('#treasury-address').innerText(), otherAddress);
    assert.equal(await page.locator('#submit-request').isEnabled(), true);
    await expectEmptyDrafts();
  });

  await check('an isolated non-default chain connects only after its chain ID is configured', async () => {
    await page.evaluate(() => window.__walletQA.raw.disconnect());
    const cloudId = 46901;
    fixture = await installWallet(cloudId);
    await connect();
    assert.match(await page.locator('#status-text').innerText(), /chain ID 46901.*not enabled/i);
    assert.equal(await page.locator('#submit-request').isDisabled(), true);
    const configRoute = '**/networks.json';
    await page.route(configRoute, async route => {
      const response = await route.fetch();
      const networks = await response.json();
      assert.equal(Object.hasOwn(networks, String(cloudId)), false);
      await route.fulfill({ json: { ...networks, [cloudId]: 'Course test chain' } });
    });
    try {
      await connect();
      assert.equal(await page.locator('#treasury-address').innerText(), fixture.treasury);
      assert.equal(await page.locator('#submit-request').isEnabled(), true);
      assert.match(await page.locator('#network-badge').innerText(), /Course test chain/);
      await expectEmptyDrafts();
      assert.equal(await sendCount(), 0);
    } finally {
      await page.unroute(configRoute);
    }
  });
  await page.evaluate(() => window.__walletQA.raw.disconnect());
  await page.reload({ waitUntil:'networkidle' });
  fixture = await installWallet(1337);
  await page.locator('#wallet-mode').click();
  await page.evaluate(() => {
    const q = window.__walletQA;
    q.otherCalls = [];
    const otherHandlers = new Map();
    const other = {
      request({method, params}) {
        q.otherCalls.push(method);
        if (method === 'eth_accounts' || method === 'eth_requestAccounts') return Promise.resolve([q.accounts[3]]);
        if (method === 'eth_sendTransaction') throw new Error('Unexpected write through the secondary provider.');
        return q.raw.request({method, params:params || []});
      },
      on(event, callback) { if (!otherHandlers.has(event)) otherHandlers.set(event,new Set()); otherHandlers.get(event).add(callback); },
      removeListener(event, callback) { otherHandlers.get(event)?.delete(callback); }
    };
    q.emitOther = (event, payload) => { for (const callback of [...(otherHandlers.get(event) || [])]) callback(payload); };
    Object.defineProperty(window, 'ethereum', {value:other, configurable:true});
    for (const [name, uuid, rdns, provider] of [
      ['Binance Wallet','b8291092-01c2-4718-b0fb-fd04d900d994','com.binance.wallet',other],
      ['MetaMask','60e6b54c-1bd9-4fda-8cf3-212655c7ed99','io.metamask',q.provider]
    ]) {
      window.dispatchEvent(new CustomEvent('eip6963:announceProvider', {detail:{info:{name,uuid,rdns},provider}}));
    }
  });
  await check('announced MetaMask can connect, preflight and sign a local deposit without touching a different global default wallet', async () => {
    assert.equal(await page.locator('#wallet-provider option:checked').textContent(),'MetaMask');
    assert.equal(await page.locator('#wallet-provider option').count(),2);
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.locator('#wallet-provider').isVisible(),true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),true);
    await page.setViewportSize({width:1440,height:1100});
    await connect();
    await page.locator('#deposit-amount').fill('0.01');
    await page.locator('#deposit-button').click(); await idle();
    assert.equal(await page.locator('#balance').textContent(),'0.01');
    assert.equal(await sendCount(),1);
    assert.deepEqual(await page.evaluate(() => window.__walletQA.otherCalls),[]);
  });
  await check('wallet selection invalidates a pending send, clears its draft, and ignores events from the old provider', async () => {
    await fillWalletDrafts();
    await page.evaluate(() => { window.__walletQA.pauseSend = true; });
    await page.locator('#deposit-button').click();
    await page.waitForFunction(() => Boolean(window.__walletQA.pending));
    await page.locator('#wallet-provider').selectOption({label:'Binance Wallet'});
    await idle();
    assert.equal(await page.locator('#deposit-button').isDisabled(),true);
    assert.equal(await page.locator('#treasury-address').textContent(),'Not connected');
    assert.equal(await page.locator('#contract-address').inputValue(),'');
    assert.match(await page.locator('#status-text').textContent(),/wallet request may still be open/i);
    await expectEmptyDrafts();
    assert.deepEqual(await page.evaluate(() => window.__walletQA.otherCalls),[]);
    await connect();
    await page.evaluate(() => {
      const q=window.__walletQA;
      q.pending.reject(Object.assign(new Error('User canceled the previous wallet prompt'), {code:4001}));
      q.pending = null; q.pauseSend = false;
      q.emit('accountsChanged', []); q.emit('chainChanged','0x1'); q.emit('disconnect',{code:4900});
    });
    await idle();
    assert.equal(await page.locator('#treasury-address').textContent(),fixture.treasury);
    assert.equal(await page.locator('#current-role').textContent(),'Supporter · view & contribute');
    assert.equal(await sendCount(),1);
    await page.evaluate(() => window.__walletQA.emitOther('disconnect',{code:4900}));
    assert.equal(await page.locator('#deposit-button').isDisabled(),true);
    assert.match(await page.locator('#status-text').textContent(),/wallet disconnected/i);
  });
  await check('a delayed connection approval cannot restore the previously selected wallet', async () => {
    await page.locator('#wallet-provider').selectOption({label:'MetaMask'});
    await page.evaluate(() => {
      const q=window.__walletQA;
      const original=q.provider.request.bind(q.provider);
      q.provider.request=async (req) => {
        if (req.method==='eth_requestAccounts') await new Promise(resolve => { q.resumeConnection=resolve; });
        return original(req);
      };
    });
    await page.locator('#contract-address').fill(fixture.treasury);
    await page.locator('#connect-wallet').click();
    await page.waitForFunction(() => Boolean(window.__walletQA.resumeConnection));
    await page.locator('#wallet-provider').selectOption({label:'Binance Wallet'});
    await connect();
    await page.evaluate(() => window.__walletQA.resumeConnection());
    await idle();
    assert.equal(await page.locator('#wallet-provider option:checked').textContent(),'Binance Wallet');
    assert.equal(await page.locator('#current-role').textContent(),'Supporter · view & contribute');
    assert.equal(await page.locator('#submit-request').isDisabled(),true);
  });
  assert.deepEqual(pageErrors, []);
})().catch(error => {
  results.push({ name: 'integration harness', status: 'failed', error: String(error.stack || error) });
  console.error(String(error.message));
}).finally(async () => {
  if (page) {
    try { await page.evaluate(async () => { await window.__walletQA?.raw?.disconnect?.(); }); } catch (_) {}
  }
  if (browser) await browser.close();
  const report = {
    startedAt, finishedAt: new Date().toISOString(),
    environment: { kind: 'LOCAL injected EIP-1193 wallet wrapper over an isolated browser Ganache EVM', browser: 'Headless Microsoft Edge via Playwright', url: process.env.QA_URL || 'http://127.0.0.1:8874', localChainIds: [1337, 46901],
      servedAppSha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'dist/app.js'))).digest('hex'), sourceContractSha256: treasuryArtifact.sourceSha256 },
    total: results.length, passed: results.filter(result => result.status === 'passed').length, failed: results.filter(result => result.status === 'failed').length,
    tests: results, pageErrors,
    limitations: ['No real browser wallet extension was installed or exercised.', 'No public Ethereum or cloud blockchain network was contacted.', 'The wrapper deterministically controls account/network events for local integration testing; this does not establish external wallet acceptance.']
  };
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ total: report.total, passed: report.passed, failed: report.failed, evidence: output }));
  if (report.failed) process.exitCode = 1;
});
