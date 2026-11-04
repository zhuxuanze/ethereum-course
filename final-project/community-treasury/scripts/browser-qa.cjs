const fs=require('node:fs');const path=require('node:path');const os=require('node:os');const assert=require('node:assert/strict');
function loadPlaywright(){
 if(process.env.PLAYWRIGHT_MODULE)return require(process.env.PLAYWRIGHT_MODULE);
 try{return require('playwright');}
 catch(error){
  const bundled=path.join(os.homedir(),'.cache','codex-runtimes','codex-primary-runtime','dependencies','node','node_modules','playwright');
  if(fs.existsSync(path.join(bundled,'package.json')))return require(bundled);
  throw new Error('Browser QA requires optional Playwright. Install it locally or set PLAYWRIGHT_MODULE to its package path.',{cause:error});
 }
}
const playwright=loadPlaywright();
const {chromium}=playwright;
const root=path.resolve(__dirname,'..');
const output=path.join(root,'evidence/browser');fs.mkdirSync(output,{recursive:true});
(async()=>{
 const edge='/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge';
 const executablePath=process.env.BROWSER_EXECUTABLE||(fs.existsSync(edge)?edge:undefined);
 const browser=await chromium.launch({headless:true,executablePath});
 const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const checks=[];const receipts=[];let outcome='failed';
 async function idle(){await page.waitForFunction(()=>!state.busy,{},{timeout:90000});}
 async function click(selector){await page.locator(selector).click();await idle();}
 async function role(value){await page.locator('#demo-role').selectOption(String(value));await idle();}
 async function shot(name){await page.evaluate(()=>{document.documentElement.style.scrollBehavior='auto';document.activeElement?.blur?.();window.scrollTo(0,0);});await page.waitForFunction(()=>scrollY===0);await page.screenshot({path:path.join(output,name),fullPage:true});}
 async function checkpoint(name){
  const snapshot=await page.evaluate(()=>({address:state.address,chainId:String(state.chainId),account:state.account,balance:state.balance.toString(),pending:state.pendingCount,paid:state.paidCount,status:document.getElementById('status-text').textContent,receipt:document.getElementById('receipt-hash').textContent,requests:state.requests.map(r=>({id:r.id,value:String(r.value),confirmed:r.confirmations,executed:r.executed}))}));
  checks.push({name,passed:true,snapshot});
  if(snapshot.receipt&&!receipts.includes(snapshot.receipt))receipts.push(snapshot.receipt);
 }
 try{
  await page.goto(process.env.QA_URL||'http://127.0.0.1:8874',{waitUntil:'networkidle'});
  await shot('01-dashboard-before.png');
  await click('#launch-demo');
  assert.match(await page.locator('#status-text').innerText(),/Sandbox ready/);
  assert.equal(await page.locator('#balance').innerText(),'10');
  await checkpoint('Compiled Solidity contract deployed and treasury funded in browser EVM');
  await shot('02-funded-treasury.png');
  await role(3);
  assert(await page.locator('#submit-request').isDisabled());
  await page.locator('#deposit-amount').fill('1');await click('#deposit-button');
  assert.equal(await page.locator('#balance').innerText(),'11');
  await checkpoint('Supporter can deposit and cannot submit payment requests');
  await role(0);
  await page.locator('#payment-amount').fill('0.25');
  await page.locator('#purpose').fill('Documentation contributor payment');
  await click('#submit-request');
  assert.equal(await page.locator('.request-card').count(),1);
  assert.equal(await page.locator('.approval-summary').first().innerText(),'0/2 required');
  await checkpoint('Submission records recipient amount and purpose without implicit approval');
  await click('[data-request-action="confirm"][data-request-id="0"]');
  assert(await page.locator('[data-request-action="execute"][data-request-id="0"]').isDisabled());
  await checkpoint('One approval does not enable execution');
  await role(1);await click('[data-request-action="confirm"][data-request-id="0"]');
  assert(!(await page.locator('[data-request-action="execute"][data-request-id="0"]').isDisabled()));
  await shot('03-two-approvals.png');
  await click('[data-request-action="revoke"][data-request-id="0"]');
  assert(await page.locator('[data-request-action="execute"][data-request-id="0"]').isDisabled());
  await click('[data-request-action="confirm"][data-request-id="0"]');
  await checkpoint('Revocation disables execution until two approvals are restored');
  await role(2);await click('[data-request-action="execute"][data-request-id="0"]');
  assert.equal(await page.locator('#balance').innerText(),'10.75');
  assert.equal(await page.locator('[data-request-action="execute"][data-request-id="0"]').count(),0);
  assert.equal(await page.locator('#executed-count').innerText(),'1');
  await checkpoint('Third owner executes approved payment once with correct balance and mined receipt');
  await shot('04-payment-completed.png');
  await page.locator('#payment-amount').fill('0.0000009');
  await page.locator('#purpose').fill('Small exact-amount payment');await click('#submit-request');
  assert.match(await page.locator('.request-card[data-request-id="1"] .request-amount').innerText(),/0\.0000009/);
  await checkpoint('Sub-microether payment amount displayed without truncation');
  await page.evaluate(()=>{const r=state.requests.find(x=>x.id===1);localStorage.setItem(metadataKey(r.hash),'Tampered purpose');});
  await click('#refresh');
  assert.match(await page.locator('.request-card[data-request-id="1"]').innerText(),/altered and does not match/);
  page.once('dialog',dialog=>dialog.accept('Small exact-amount payment'));
  await page.locator('.request-card[data-request-id="1"]').getByText('Verify purpose text',{exact:true}).click();
  assert.match(await page.locator('.request-card[data-request-id="1"]').innerText(),/Purpose verified/);
  await checkpoint('Altered off-chain description rejected and exact original text recovered by hash');
  await role(3);
  assert.equal(await page.locator('[data-request-action]').count(),0);
  await checkpoint('Supporter has read-only payment request controls');
  await page.setViewportSize({width:390,height:844});
  const sizing=await page.evaluate(()=>({documentWidth:document.documentElement.scrollWidth,viewport:innerWidth}));
  assert(sizing.documentWidth<=sizing.viewport,JSON.stringify(sizing));
  await shot('05-mobile.png');
  await checkpoint('390 pixel mobile viewport has no horizontal overflow');
  await page.setViewportSize({width:1440,height:1000});
  await click('#wallet-mode');
  await page.locator('#contract-address').fill('0x1111111111111111111111111111111111111111');
  await click('#connect-wallet');
  assert.match(await page.locator('#status-text').innerText(),/No Ethereum wallet/);
  await checkpoint('Wallet mode handles missing injected wallet without claiming connection');
  assert.deepEqual(errors,[]);
  outcome='passed';
 }catch(error){
  await page.screenshot({path:path.join(output,'failure.png'),fullPage:true}).catch(()=>{});
  checks.push({name:'Browser flow failure',passed:false,error:error.message,status:await page.locator('#status-text').innerText().catch(()=>''),pageErrors:errors});
  process.exitCode=1;
 }finally{
  const result={recordedAt:new Date().toISOString(),status:outcome,environment:'Headless Chromium; actual compiled contract executed on browser-local Ganache EVM',publicNetwork:false,checks,receipts,pageErrors:errors};
  fs.writeFileSync(path.join(root,'evidence/browser-test-results.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({status:outcome,checks:checks.length,passed:checks.filter(x=>x.passed).length,failures:checks.filter(x=>!x.passed)},null,2));
  await browser.close();
 }
})().catch(error=>{console.error(error.message);process.exitCode=1;});
