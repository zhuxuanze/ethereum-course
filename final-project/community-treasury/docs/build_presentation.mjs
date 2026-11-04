import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const RUNTIME_MODULES=process.env.RUNTIME_NODE_MODULES;
if(!RUNTIME_MODULES)throw new Error('Set RUNTIME_NODE_MODULES to the bundled node_modules directory.');
const {Presentation,PresentationFile}=await import(pathToFileURL(path.join(RUNTIME_MODULES,'@oai/artifact-tool/dist/artifact_tool.mjs')).href);

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const WORKSPACE=path.resolve(ROOT,'../..');
const TMP=path.join(WORKSPACE,'tmp/final-treasury-docs/treasury-final');
const OUT=path.join(WORKSPACE,'output/final/community-treasury');
const SKILL='/Users/zhuxuanze/.codex/plugins/cache/openai-primary-runtime/presentations/26.1026.10807/skills/presentations';
const PYTHON='/Users/zhuxuanze/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3';
const {finalizePresentation,applyPresentationChartFont}=await import(pathToFileURL(path.join(SKILL,'container_tools/artifact_tool_utils.mjs')).href);
const tests=JSON.parse(await fs.readFile(path.join(ROOT,'evidence/contract-test-results.json'),'utf8'));
const gas=JSON.parse(await fs.readFile(path.join(ROOT,'evidence/contract-gas.json'),'utf8'));
const content=JSON.parse(await fs.readFile(path.join(ROOT,'docs/presentation-content.json'),'utf8')).slides;
let facts={};try{facts=JSON.parse(await fs.readFile(path.join(ROOT,'docs/delivery-facts.json'),'utf8'));}catch{}
const refs=JSON.parse(await fs.readFile(path.join(ROOT,'docs/report-content.json'),'utf8')).references;
const C={ink:'#102B32',teal:'#157D75',mint:'#B9E4D3',paper:'#F6F5EF',gray:'#5B6D70',line:'#CAD5D3',white:'#FFFFFF',pale:'#E6F0EC',amber:'#9D6B18'};
await fs.mkdir(TMP,{recursive:true});await fs.mkdir(OUT,{recursive:true});
const pres=Presentation.create({slideSize:{width:1280,height:720}});

function box(slide,x,y,w,h,fill=C.white,stroke='none',radius=0){
 return slide.shapes.add({geometry:radius?'roundRect':'rect',position:{left:x,top:y,width:w,height:h},fill,line:{fill:stroke,width:stroke==='none'?0:1,style:'solid'},borderRadius:radius});
}
function text(slide,copy,x,y,w,h,size=28,bold=false,color=C.ink,align='left',typeface='Arial'){
 const s=box(slide,x,y,w,h,'none');s.text=copy;s.text.style={typeface,fontSize:size,bold,color,alignment:align,verticalAlignment:'top',autoFit:'none',wrap:'square',insets:0,lineSpacing:1.08};return s;
}
function urlText(slide,label,url,x,y,w,h,size=18){const s=text(slide,'',x,y,w,h,size,false,C.gray);s.text=[{runs:[{run:label,style:{underline:'sng'},link:{uri:url,isExternal:true}}]}];return s;}
function line(slide,x,y,w,h,color=C.line){return box(slide,x,y,w,h,color);}
function base(i,title,kicker='COMMUNITY TREASURY'){
 const s=pres.slides.add();s.background.fill=C.paper;
 text(s,kicker,62,34,1000,24,16,true,C.teal);text(s,title,62,82,1156,99,42,true);
 line(s,62,662,1156,1);text(s,'Ethereum course final project',62,678,900,20,14,false,C.gray);text(s,String(i).padStart(2,'0'),1165,675,50,24,16,true,C.gray,'right');
 s.speakerNotes.text=`${content[i-1].en}\n\n中文对照\n${content[i-1].zh}\n\nDemo actions\n${content[i-1].action}\n\nSources\n${refs.map(r=>`[${r.id}] ${r.title}: ${r.url}`).join('\n')}\nLocal evidence: evidence/contract-test-results.json; evidence/contract-gas.json. Public deployment must be verified separately.`;
 return s;
}
function paragraph(s,heading,copy,x,y,w){text(s,heading,x,y,w,40,28,true);text(s,copy,x,y+48,w,140,25,false,C.gray);}
function chip(s,label,x,y,w=170){box(s,x,y,w,40,C.pale,'none',10);text(s,label,x+12,y+8,w-24,28,18,true,C.teal);}
function arr(s,x,y,w){s.shapes.add({geometry:'rightArrow',position:{left:x,top:y,width:w,height:22},fill:C.teal,line:{fill:'none',width:0}});}
function nativeTable(s,values,x,y,w,h,widths){
 const t=s.tables.add({rows:values.length,columns:values[0].length,left:x,top:y,width:w,height:h,values,columnWidths:widths});
 t.borders.assign({fill:C.line,width:1,style:'solid'});
 for(let r=0;r<values.length;r++)for(let c=0;c<values[0].length;c++){
  let cell=t.getCell(r,c);cell.fill=r===0?C.ink:(r%2?C.white:C.pale);
  cell.text.style={typeface:'Arial',fontSize:r===0?23:22,bold:r===0,color:r===0?C.white:C.ink,verticalAlignment:'middle',insets:{left:14,right:12,top:10,bottom:10}};
 }
 return t;
}

// 1 Cover
{
 const s=pres.slides.add();s.background.fill=C.ink;
 text(s,'ETHEREUM COURSE FINAL PROJECT',66,54,1040,30,19,true,C.mint);
 text(s,'Shared Treasury\nfor Open Source\nCommunities',66,157,790,250,64,true,C.white);
 text(s,'A working prototype for joint approval\nand ETH payment execution',70,450,780,100,29,false,C.mint);
 text(s,'3 fixed owners  ·  2 approvals  ·  1 treasury',70,614,1020,40,23,true,C.white);
 box(s,948,196,260,260,C.teal,'none',30);text(s,'2 / 3',976,267,204,100,71,true,C.white,'center');
 text(s,'approval policy',970,379,214,30,20,false,C.white,'center');
 s.speakerNotes.text=content[0].en+'\n\n'+content[0].zh+'\n\nThe title describes the course prototype. Team names remain for the actual members to complete.';
}
// 2 Problem and actors
{
 const s=base(2,content[1].title);text(s,'Use cases',64,195,450,40,29,true);
 for(const [i,t] of ['Reward a contributor','Reimburse an agreed expense','Review project spending'].entries()){
  text(s,String(i+1).padStart(2,'0'),66,270+i*96,60,42,27,true,C.teal);text(s,t,145,269+i*96,470,60,29);
 }
 box(s,698,196,518,400,C.pale,'none',18);paragraph(s,'Managers','Propose, approve, revoke and execute',730,230,450);paragraph(s,'Supporters and members','Add funds and inspect records',730,403,450);
}
// 3 Related solutions
{
 const s=base(3,content[2].title);nativeTable(s,[['Approach','Strength','Trade-off'],['Approval website','Familiar account workflow','Operator controls enforcement'],['Safe smart account','Mature multisignature system','Broader operational scope'],['Course prototype','Small and inspectable ETH flow','Fixed owners; limited recovery']],64,206,1152,340,[295,380,477]);
 text(s,'The project applies an established pattern. It does not claim a new multisignature mechanism.',66,582,1144,50,24,false,C.gray);
}
// 4 Architecture
{
 const s=base(4,content[3].title);
 box(s,70,220,335,150,C.white,C.line,14);text(s,'Web interface',94,248,288,38,30,true);text(s,'Forms · balances · receipts',94,300,288,50,23,false,C.gray);
 box(s,70,443,335,140,C.pale,'none',14);text(s,'Browser storage',94,466,285,36,28,true);text(s,'Purpose text + hash check',94,516,285,50,23,false,C.gray);
 box(s,493,220,288,150,C.white,C.line,14);text(s,'Provider',517,248,240,38,30,true);text(s,'Sandbox EVM\nor injected wallet',517,298,240,60,23,false,C.gray);
 box(s,869,220,343,310,C.ink,'none',16);text(s,'Solidity treasury',894,249,293,38,30,true,C.white);text(s,'Owners and threshold\nImmutable payment fields\nCurrent approvals\nETH balance and execution',894,313,293,174,25,false,C.white);
 arr(s,422,278,55);arr(s,799,278,55);line(s,232,371,3,70,C.teal);
 text(s,'A hosted website and a blockchain deployment are separate components.',493,559,713,62,24,false,C.gray);
}
// 5 Lifecycle
{
 const s=base(5,content[4].title);const stages=[['0 approvals','Submitted'],['1 approval','Pending'],['2 approvals','Eligible'],['Executed','Paid once']];
 stages.forEach(([a,b],i)=>{const x=65+i*294;box(s,x,231,260,172,i===3?C.ink:C.white,C.line,16);text(s,a,x+20,262,220,45,32,true,i===3?C.white:C.ink);text(s,b,x+20,325,220,42,25,false,i===3?C.mint:C.gray);if(i<3)arr(s,x+268,300,20);});
 paragraph(s,'Revocation before execution','An owner can remove their own approval.',70,463,540);paragraph(s,'A separate execution transaction','The contract checks current approvals and balance.',678,463,540);
}
// 6 Actual source excerpt
{
 const s=base(6,content[5].title);box(s,65,192,754,425,C.ink,'none',16);
 const code=`function executeTransaction(uint256 txIndex)\n    external onlyOwner nonReentrant {\n  Transaction storage transaction =\n      pendingTransaction(txIndex);\n  // Approval and balance checks precede payment.\n  transaction.executed = true;\n  (bool success,) = transaction.to.call\n      {value: transaction.value}(\"\");\n  if (!success) revert TransferFailed(txIndex);\n  emit ExecuteTransaction(msg.sender, txIndex);\n}`;
 text(s,code,89,218,708,370,22,false,C.white,'left','Arial');
 paragraph(s,'Before the call','Owner, state, approvals and balance checks',866,217,342);paragraph(s,'If transfer fails','The transaction reverts and restores state.',866,408,342);
 text(s,'Source excerpt with the two checks summarized in a comment. Full function is in contracts/CommunityTreasury.sol.',69,625,1144,28,16,false,C.gray);
}
// 7 Screenshot and demo
{
 const s=base(7,content[6].title);let screenshot=null;
 if(Array.isArray(facts.screenshots)&&facts.screenshots.length){screenshot=typeof facts.screenshots[0]==='string'?facts.screenshots[0]:facts.screenshots[0].path;}
 if(screenshot){try{const bytes=await fs.readFile(screenshot);const blob=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
  if(screenshot.includes('04-payment-completed')){
   text(s,'Receipt and updated balance',67,196,790,32,23,true);
   s.images.add({blob,contentType:'image/png',alt:'Actual local payment receipt and treasury balance, cropped from the recorded full page',fit:'cover',crop:{left:120/1440,right:120/1440,top:559/2075,bottom:(2075-784)/2075},position:{left:65,top:241,width:800,height:150}});
   text(s,'The completed request',67,420,790,32,23,true);
   s.images.add({blob,contentType:'image/png',alt:'Actual completed request with two approvals and paid status, cropped from the same recorded full page',fit:'cover',crop:{left:120/1440,right:120/1440,top:1245/2075,bottom:(2075-1506)/2075},position:{left:65,top:461,width:800,height:174}});
  }else{s.images.add({blob,contentType:'image/png',alt:'Actual Common Treasury browser interface',fit:'contain',position:{left:64,top:196,width:800,height:426}});}
 }catch{screenshot=null;}}
 if(!screenshot){box(s,65,202,780,410,C.pale,'none',16);text(s,'Browser sandbox',94,240,700,50,37,true);text(s,'Launch the application\nSubmit a 0.25 ETH request\nConfirm as two different managers\nExecute and inspect the receipt',94,325,700,218,30,false,C.ink);}
 paragraph(s,'Demonstration only','Local EVM and nonvaluable ETH',894,206,306);
 paragraph(s,'Observe the state','One approval is insufficient. Two approvals allow execution.',894,391,306);
}
// 8 Test evidence
{
 const s=base(8,content[7].title);text(s,`${tests.passed} / ${tests.total}`,65,200,450,130,91,true,C.teal);text(s,'contract tests passed',70,345,450,50,30,true);
 text(s,'Isolated Ganache · Shanghai\nSolidity 0.8.30 · optimizer 200',70,419,453,86,24,false,C.gray);text(s,'No independent security audit or formal proof',70,544,453,70,22,false,C.gray);
 const checks=['Owner and request validation','Distinct approvals and revocation','Insufficient approvals or balance','Exactly-once payment','Failed receiver rollback and retry','Owner-receiver reentrancy attempts'];
 checks.forEach((t,i)=>{text(s,'✓',599,215+i*62,40,40,28,true,C.teal);text(s,t,649,216+i*62,563,46,26);});
}
// 9 Native gas chart
{
 const s=base(9,content[8].title);const names=['deposit','submit','confirm_first','confirm_second','revoke','execute'];const map=Object.fromEntries(gas.observations.map(x=>[x.operation,Number(x.gasUsed)]));
 const chart=s.charts.add('bar',{position:{left:65,top:206,width:828,height:405},categories:['Deposit','Submit','Confirm 1','Confirm 2','Revoke','Execute'],series:[{name:'Gas used',values:names.map(n=>map[n]),fill:C.teal}],hasLegend:false,barOptions:{direction:'bar',grouping:'clustered',gapWidth:60},dataLabels:{showValue:true,position:'outEnd',textStyle:{fontSize:19}},xAxis:{numberFormatCode:'#,##0',textStyle:{fontSize:18}},yAxis:{textStyle:{fontSize:21}},chartFill:C.paper,plotAreaFill:C.paper});
 applyPresentationChartFont(chart,{fontFamily:'Arial'});
 paragraph(s,'Deployment',`${map.deployment.toLocaleString('en-US')} gas`,935,215,280);
 paragraph(s,'Measurement scope','One local lifecycle. Gas units, not currency cost.',935,411,280);
}
// 10 verified boundaries
{
 const s=base(10,content[9].title);nativeTable(s,[['Component','Recorded status'],['Contract verification',`${tests.passed}/${tests.total} local tests passed`],['Browser workflow',facts.browser_verified?'Recorded browser checks completed':'Browser verification pending'],['Hosted frontend',facts.site_deployed?'Private frontend deployment verified':'Publication pending'],['Public Ethereum / cloud chains','Targets and deployment remain to be confirmed']],65,206,1150,370,[415,735]);
 text(s,'Hosting a web interface does not establish mainnet or cloud-blockchain contract deployment.',68,600,1134,50,23,false,C.gray);
}
// 11 Limits /nextsteps
{
 const s=base(11,content[10].title);paragraph(s,'Owner judgment','Two owners can authorize an inappropriate expense.',66,211,540);paragraph(s,'Key availability','Losing two keys can block spending in this fixed-owner version.',680,211,537);
 paragraph(s,'Description availability','A hash detects changes but cannot recover missing text.',66,426,540);paragraph(s,'Next course steps','Confirm deployment targets and preserve real network receipts.',680,426,537);
}
// 12 source and takeaway
{
 const s=base(12,content[11].title);text(s,'Two distinct approvals authorize\none specified ETH payment.',66,203,1145,118,46,true,C.teal);
 text(s,'Delivered evidence: Solidity source, browser application, contract tests, gas receipts and report.',69,359,1130,78,29);
 text(s,'Source repository',69,463,1100,28,22,true);
 if(facts.repository_verified)urlText(s,facts.repository_url,facts.repository_url,69,501,1133,32,18);else text(s,'Repository publication pending',69,501,1133,32,18,false,C.gray);
 text(s,'Hosted application (owner-only private)',69,547,1100,28,22,true);
 if(facts.site_deployed)urlText(s,facts.site_url,facts.site_url,69,583,1133,32,18);else text(s,'Site publication pending',69,583,1133,32,18,false,C.gray);
 text(s,'Core references: Ethereum documentation · Solidity security guidance · Safe · EIP-1193',69,630,1133,24,15,false,C.gray);
}

const version=process.env.DECK_REVISION||'v1';const internal=path.join(TMP,'deliverables',`Community_Treasury_Final_Presentation_${version}.pptx`);
await fs.mkdir(path.dirname(internal),{recursive:true});
const candidate=path.join(TMP,`candidate-${version}.pptx`);await(await PresentationFile.exportPptx(pres)).save(candidate);
const result=await finalizePresentation({workspaceDir:TMP,candidatePath:candidate,finalPath:internal,pythonExecutable:PYTHON,
 integrityValidatorPath:path.join(SKILL,'container_tools/inspect_presentation_package_integrity.py'),layoutValidatorPath:path.join(SKILL,'container_tools/inspect_presentation_layout_geometry.py'),
 layoutArgs:['--expected-slide-size-emu','12192000,6858000','--validate-bullet-geometry','--validate-heading-fit','--require-native-table-slide','3','--require-native-table-slide','10'],
 explicitTotalSlideCount:12,requiredNativeTableOwnerSlides:[3,10],requiredNativeChartOwnerSlides:[9],materializeLiteralChartWorkbooks:true,
 fontPolicy:{basis:'design',families:['Arial']},verifyArtifactToolImport:true,receiptPath:path.join(TMP,`validation-${version}.json`)});
await fs.copyFile(internal,path.join(OUT,'Community_Treasury_Final_Presentation_EN.pptx'));
await fs.writeFile(path.join(TMP,'design.json'),JSON.stringify({engine:'@oai/artifact-tool',canvas:[1280,720],fonts:['Arial'],colors:C,slide_count:12,revision:version},null,2));
await fs.writeFile(path.join(TMP,'slide-plan.json'),JSON.stringify(content,null,2));
console.log(JSON.stringify({result,final:path.join(OUT,'Community_Treasury_Final_Presentation_EN.pptx')},null,2));
