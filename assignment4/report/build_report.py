"""Build the editable lab report with the Codex bundled Python runtime."""
from pathlib import Path
import json
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

ROOT = Path(__file__).resolve().parents[1]
SCAN = json.loads((ROOT / 'evidence/first-contract.json').read_text())
RESULT = SCAN['result']
OUT = ROOT / 'report' / 'Assignment4_Report.docx'
doc = Document()
sec = doc.sections[0]
sec.page_width, sec.page_height = Inches(8.5), Inches(11)
sec.top_margin = sec.bottom_margin = Inches(.65)
sec.left_margin = sec.right_margin = Inches(.8)
sec.header_distance = sec.footer_distance = Inches(.3)
sec.different_first_page_header_footer = True
for name in ['Normal','Title','Heading 1','Heading 2','Heading 3']:
    style=doc.styles[name]; style.font.name='Calibri';style.font.color.rgb=RGBColor(0,0,0)
    style.paragraph_format.space_after=Pt(5)
doc.styles['Normal'].font.size=Pt(11)
doc.styles['Normal'].paragraph_format.line_spacing=1.03
doc.styles['Title'].font.size=Pt(22)
doc.styles['Heading 1'].font.size=Pt(16)
doc.styles['Heading 2'].font.size=Pt(12)
for name in ['Heading 1','Heading 2']:
    doc.styles[name].paragraph_format.space_before=Pt(8)
    doc.styles[name].paragraph_format.keep_with_next=True
header=sec.header.paragraphs[0]
header.text='Assignment 4    Ethereum and Cloud Blockchain Solutions Engineering'
header.style='Normal';header.runs[0].font.size=Pt(9)
footer=sec.footer.paragraphs[0];footer.alignment=WD_ALIGN_PARAGRAPH.RIGHT
footer.add_run('Page ')
field=OxmlElement('w:fldSimple');field.set(qn('w:instr'),'PAGE');footer._p.append(field)

def p(text, bold=False):
    para=doc.add_paragraph();para.add_run(text).bold=bold;return para
def h(text):doc.add_heading(text,level=2)
def page(title):
    para=doc.add_heading(title,level=1)
    para.paragraph_format.page_break_before=True
def code(text):
    para=doc.add_paragraph();para.paragraph_format.space_after=Pt(7)
    para.paragraph_format.line_spacing=1.0
    run=para.add_run(text.strip());run.font.name='Consolas';run.font.size=Pt(9)
def table(headers,rows,widths):
    t=doc.add_table(rows=1,cols=len(headers));t.autofit=False
    for c,w in zip(t.columns,widths):c.width=Inches(w)
    for i,v in enumerate(headers):t.rows[0].cells[i].text=str(v)
    for row in rows:
        cells=t.add_row().cells
        for c,v in zip(cells,row):c.text=str(v)
    for ri,row in enumerate(t.rows):
        for ci,c in enumerate(row.cells):
            c.width=Inches(widths[ci]);c.vertical_alignment=WD_CELL_VERTICAL_ALIGNMENT.CENTER
            pr=c._tc.get_or_add_tcPr()
            borders=OxmlElement('w:tcBorders')
            for edge in ['top','left','bottom','right']:
                e=OxmlElement('w:'+edge);e.set(qn('w:val'),'single');e.set(qn('w:sz'),'4');e.set(qn('w:color'),'D9D9D9');borders.append(e)
            pr.append(borders)
            margins=OxmlElement('w:tcMar')
            for edge in ['top','left','bottom','right']:
                e=OxmlElement('w:'+edge);e.set(qn('w:w'),'90');e.set(qn('w:type'),'dxa');margins.append(e)
            pr.append(margins)
            fill=OxmlElement('w:shd');fill.set(qn('w:fill'),'E5EDF4' if ri==0 else 'FFFFFF');pr.append(fill)
            for para in c.paragraphs:
                para.paragraph_format.space_after=Pt(2);para.paragraph_format.line_spacing=1.0
                for r in para.runs:r.font.size=Pt(10);r.bold=ri==0
    rp=t.rows[0]._tr.get_or_add_trPr();rp.append(OxmlElement('w:tblHeader'))
    doc.add_paragraph().paragraph_format.space_after=Pt(2)
    return t
def eq(text):
    para=doc.add_paragraph();math=OxmlElement('m:oMath');run=OxmlElement('m:r');t=OxmlElement('m:t');t.text=text;run.append(t);math.append(run);para._p.append(math)

# Cover preserves the fields in the assignment's supplied sample.
p('Name ____________________________________    Date  November 2 2026')
p('             last name, first name')
p('Email Address _________________________________________________')
doc.add_paragraph()
doc.add_heading('Assignment 4',0)
p('Introduction to Ethereum and Cloud Blockchain Solutions Engineering')
p('GEC Academy Online Research Seminar')
p('Instructor Jean Claude Franchitti    Session 5')
doc.add_paragraph()
p('Total in points 100 _____________________________________________')
p('Professor’s Comments')
for _ in range(3):p('________________________________________________________________')
doc.add_paragraph()
p('Statement of independent effort and disclosure of assistance',True)
p('To be completed and signed by the student after reviewing the work and the course rules.')
for _ in range(2):p('________________________________________________________________')
p('Signature ______________________________    Date ________________')
doc.add_paragraph()
p('Preparation status',True)
p('Questions 1 to 4 are completed with code and recorded evidence. The personal Infura endpoint was used to verify the first mainnet contract-creation transaction. Sixteen contract tests and thirteen program tests passed. Before submission, the student must review the work and complete the cover identity fields, declaration and signature. No GitHub push or LMS submission has been performed.')

page('1 Oracles')
h('1a Definition and purpose')
p('An oracle connects a smart contract to information that originates outside its blockchain. An off-chain component obtains observations, and an on-chain interface makes those observations available to contracts. Examples include exchange rates, weather measurements and the outcome of a physical delivery. EVM execution must be reproducible across nodes, so a contract cannot independently fetch an arbitrary web API during execution. [1, 2]')
h('1b Synchronous and asynchronous oracles')
p('A synchronous oracle publishes data into on-chain storage in advance. A consuming contract reads the latest stored value during its current transaction; the off-chain update does not happen synchronously with that read. This is convenient for frequently used values, but the value may be stale and the provider pays to keep it fresh.')
p('An asynchronous oracle follows a request and response workflow. A contract records or emits a request, an off-chain service obtains the information, and a later transaction supplies the response or invokes a callback. The consumer must wait and correlate the response with the correct request. It can serve on-demand queries, but introduces latency, pending-request state and callback validation.')
h('1c Advantages and disadvantages')
p('Oracles expand the range of useful contracts and let consumers share data feeds. Limitations include inaccurate or manipulated data, operator trust, outages, stale values, fees and additional attack surfaces. Blockchain consensus validates an accepted update, not the truth of the real-world observation. Independent sources, authenticated updates and freshness checks can reduce specific risks. [2]')
h('1d Updating with a daily budget of ten dollars')
table(['Input','Latest complete daily observation'],[
    ['Observation date','November 1 2026'],['Average transaction fee C','$0.10 per transaction [3]'],
    ['Average block time T','12.03 seconds [4]'],['Daily budget D','$10.00']], [2.8,4.1])
p('Assume one oracle update costs the published network-average fee and use average block time to estimate the daily block count. These are planning assumptions, not a measured gas estimate for a particular oracle contract.')
eq('N = floor(D / C) = floor(10 / 0.10) = 100 updates per day')
eq('B = 86400 / T = 86400 / 12.03 = 7182.0449 blocks per day')
eq('k = ceil(B / N) = ceil(71.820449) = 72 blocks')
p('Update every 72 blocks, approximately 14 minutes 26 seconds, at an estimated $9.9751 per day. Every 71 blocks would exceed the budget. Actual fees and block intervals vary. Source dates and excerpts are in evidence/etherscan-observations.json.')

page('2 Diagnosing and repairing the voting contract')
h('2a Intended behavior')
p('The creator selects the candidate count and becomes the owner. Users buy one vote per ether; any fractional ether is refunded. They can allocate purchased votes to a candidate or redeem unspent votes for ether. The owner ends voting and receives the contract balance. After termination, purchases, voting and redemption are disabled. This describes the supplied contract’s rules, including the fact that unspent votes are no longer redeemable after the owner ends voting.')
h('2b The defect and its consequence')
code('require(remainingVotes[msg.sender] - amountOfVotes >= 0);')
p('Both operands are uint256. With Solidity 0.5.1, subtraction wraps modulo 2 to the power 256 on underflow. Every uint256 value is nonnegative, so the check cannot detect insufficient votes. For an account with zero votes, subtracting one yields 2 to the power 256 minus one. The later subtraction stores that enormous balance. The account can then cast unpurchased votes and redeem forged votes against ether deposited by other users. [5]')
p('A local regression test funded the original contract with 2 ether, voted once from an unfunded account, observed the maximum uint256 remaining-vote balance, and redeemed 1 ether from the pool. The same calls revert against FixedVoting. No public-network contract was targeted.')
h('2c The preventive idiom')
p('Use checked arithmetic, commonly implemented as a SafeMath library in the required compiler version. The essential rule is to validate the operands before subtraction. A direct require(balance >= amount) is sufficient for this subtraction; applying SafeMath consistently also protects additions and payout multiplication. Solidity 0.8 and later check ordinary arithmetic by default, but those newer semantics do not apply to this lab’s 0.5.1 compiler. [5, 6]')
h('2d Corrected code and why it works')
code('''function sub(uint256 a, uint256 b) internal pure returns (uint256) {
    require(b <= a, "SafeMath: subtraction underflow");
    return a - b;
}

function vote(uint256 candidateID, uint256 amountOfVotes)
    public notEnded {
    require(candidateID < candidates.length, "Invalid candidate");
    remainingVotes[msg.sender] =
        remainingVotes[msg.sender].sub(amountOfVotes);
    candidates[candidateID] =
        candidates[candidateID].add(amountOfVotes);
}''')
p('The check runs before the subtraction can wrap. A failed require reverts the entire transaction, so neither the voter balance nor candidate total changes. The complete repair is in contracts/FixedVoting.sol. Redemption updates the balance before transferring ether, following checks-effects-interactions. The original end-of-voting rules are retained; this is a lab repair rather than a production voting design.')

page('3 Finding the first contract creation transaction')
h('3a Web3 js')
p('Web3.js is a JavaScript library for interacting with Ethereum-compatible nodes. It wraps JSON-RPC calls, encodes contract calls, and exposes methods to read blocks, transactions, receipts and events or submit transactions. This project uses Web3.js 4.16.0. Passing true to getBlock requests complete transaction objects rather than only transaction hashes. [7]')
h('3b Infura and account status')
p('Infura provides hosted blockchain node endpoints. A program can use an Infura Ethereum mainnet URL instead of running and maintaining its own Ethereum node. The API key identifies the project making requests; it is not a wallet private key. The historical analysis in this question is read-only and requires no ether transfer.')
p('The student created an Infura account and supplied the personal Ethereum mainnet endpoint. This endpoint was saved as INFURA_URL in a local .env file and successfully tested on November 2 2026. The returned chain ID was 1. The API key and .env file are excluded from this report and the submission archive. See evidence/infura-readiness.txt. [8]')
h('3c Node project and installation')
code('''npm install
npm run test:unit
cp .env.example .env
# Fill INFURA_URL locally, then run:
npm run scan -- --out evidence/first-contract.json''')
p('package.json and package-lock.json record the dependencies. Installation and thirteen local program tests were completed. The script refuses requests when the endpoint is absent or contains the example placeholder. HTTPS_PROXY is supported for environments that require a proxy.')
h('3d Program and criterion')
p('scripts/first-contract.cjs verifies blocks from 0 in ascending order and finds the first transaction whose to field is exactly null. A null recipient identifies a contract-creation transaction, including an unsuccessful creation attempt. A zero address differs from null. Internal CREATE operations are outside this transaction-level criterion. [9]')
code('''const { Web3 } = require("web3");
async function main() {
    const web3 = new Web3(process.env.INFURA_URL);
    const latest = Number(await web3.eth.getBlockNumber());
    for (let number = 0; number <= latest; number++) {
        const block = await web3.eth.getBlock(number, true);
        const creation = block.transactions.find(tx => tx.to === null);
        if (creation) {
            console.log(number, creation.hash);
            break;
        }
    }
}
main().catch(console.error);''')
p('This excerpt shows the basic sequential algorithm. The executable program adds a fee-history optimization, bounded concurrency, retries, strict response validation, a mainnet chain-ID check and evidence output. It records the provider host without exposing the key. The actual mainnet result follows.')

page('3 Mainnet result and query efficiency')
h('3d Observed mainnet result')
table(['Evidence field','Observed value'],[
    ['First contract-creation block',str(RESULT['blockNumber'])],
    ['Transaction index in block',str(RESULT['transactionIndex'])],
    ['Verified interval',f"0 through {RESULT['blockNumber']} inclusive"],
    ['Provider and chain ID',f"{SCAN['providerHost']} / {SCAN['chainId']}"],
    ['Retrieved at UTC',SCAN['observedAtUtc']]], [2.5,4.4])
p('Transaction hash',True)
code(RESULT['transactionHash'])
p('The full transaction has to = null. The block number and hash were obtained through the personal Infura endpoint, not inferred from a local fixture. The receipt is retained as supporting data; success is not required by the assignment’s creation-transaction criterion. This early block predates standardized receipt status codes, so the criterion is the transaction recipient, not a success label.')
p(f"The scan used {RESULT['historyRequests']} fee-history requests and {RESULT['blocksFetched']} full-block requests. evidence/first-contract.json records the result; first-contract-proof.ndjson preserves every returned history window and fetched block. The offline proof audit checks complete coverage and confirms that no earlier transaction has a null recipient.")
h('3e Improving execution speed')
p('The default mode requests eth_feeHistory in consecutive windows of up to 1024 blocks. It checks the returned oldestBlock, exact array length and every gasUsedRatio. A ratio of zero means no transaction consumed gas; since all Ethereum transactions require intrinsic gas, such a block cannot contain a contract-creation transaction. Each positive-ratio block is fetched with complete transactions and searched in order. This excludes empty blocks without omitting any interval. [12]')
p('Bounded concurrency overlaps network latency while retaining block and transaction order. Missing or truncated history, malformed data and persistently unavailable blocks stop the scan. --mode full retains the baseline per-block implementation. Binary search on the presence of a creation in one block is invalid because the predicate is not monotonic. Caching and resumable verified checkpoints are possible future improvements.')
p('Infura documents 80 credits for both eth_feeHistory and eth_getBlockByNumber. Batching empty-block evidence greatly reduces this scan’s quota consumption compared with fetching every early empty block individually. These are request credits; no blockchain transaction or ether payment is needed. [13]')

page('4 Development setup')
h('4a Truffle project structure')
p('Truffle provides project scaffolding, Solidity compilation, deployment migrations, a local console and JavaScript tests. Truffle 5.11.5 was installed, and truffle init was successfully verified in an empty temporary directory. The submitted project uses its layout. The assignment retains Truffle despite its discontinued maintenance. See evidence/truffle-init.txt.')
table(['Path','Purpose'],[
    ['contracts/','Solidity interfaces, libraries and contracts'],['migrations/','Ordered JavaScript deployment scripts'],
    ['test/','Mocha and Truffle contract tests'],['truffle-config.js','Networks, compiler and optimizer settings'],
    ['build/contracts/','Generated ABI, bytecode and deployment artifacts']], [2.0,4.9])
h('4b Network compiler and optimizer')
code('''networks: {
  development: { host: "127.0.0.1", port: 9545, network_id: "*" }
},
compilers: {
  solc: {
    version: require.resolve("solc/soljson.js"),
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "byzantium"
    }
  }
}''')
p('The solc npm dependency is pinned to 0.5.1. Its verified version string is 0.5.1+commit.c8a2cb62.Emscripten.clang. Using the local soljson.js path avoids a second compiler download while selecting the exact required compiler. Port 9545 matches Truffle Develop. The test network uses an in-process Ganache provider with separate local test accounts.')

page('4 ERC20 interface and token implementation')
h('4c ERC20 interface')
p('contracts/ERC20.sol contains the six required function declarations and two events, with no function bodies or state variables. Optional metadata is implemented by XYZCoin. [10]')
code((ROOT/'contracts/ERC20.sol').read_text())
h('4d Metadata supply and mappings')
p('XYZCoin imports ERC20.sol and implements the interface. The token name is XYZCoin, the symbol is XYZ, decimals is 0, and total supply is 1000 indivisible units. The constructor gives all 1000 units to msg.sender and emits Transfer from the zero address to the creator.')
code('''mapping(address => uint256) public balances;
mapping(address => mapping(address => uint256)) public allowed;''')
p('balances[owner] records the owner’s token balance. allowed[owner][spender] records how many of that owner’s tokens the spender may transfer. Approval does not transfer ownership or increase supply. The public mapping getters are available in addition to the standard balanceOf and allowance functions.')
h('4e Function behavior and compilation')
table(['Function','Implemented behavior'],[
    ['totalSupply and balanceOf','Return supply and account balances'],
    ['transfer','Move the caller’s tokens and emit Transfer'],
    ['approve and allowance','Replace or read a spending allowance; approve emits Approval'],
    ['transferFrom','Consume caller allowance and move tokens on behalf of an owner']], [2.2,4.7])
p('SafeMath checks balance and allowance changes. Any failed check reverts all changes. transfer and transferFrom emit Transfer even for zero-value transfers. A positive transferFrom without allowance reverts; a zero-value call with zero allowance is accepted because it spends no tokens. Self-transfers preserve the balance. Transfers to the zero address are rejected. There is no public mint or burn operation, so supply remains 1000.')
p('approve replaces the previous allowance rather than adding to it. Applications should mitigate allowance-change races in the user workflow, for example by first setting an existing allowance to zero. The contract does not impose that sequence, consistent with ERC20 compatibility guidance. All six Solidity source files compiled successfully. [10]')

page('4 Deployment and tests')
h('4f Migration script')
code((ROOT/'migrations/2_xyz_coin.js').read_text())
p('1_initial_migration.js deploys Migrations, which records completed migration numbers. 2_xyz_coin.js deploys XYZCoin with the selected deployment account as the constructor caller.')
h('4g Development chain and migration')
code('''npm run compile
npx truffle develop
# At the Truffle console:
migrate --reset
.exit''')
p('truffle develop starts a local blockchain and a console configured to use it. It creates local test accounts with test ether; these are unrelated to mainnet balances. migrate compiles changed contracts as necessary, runs numbered migration scripts, sends deployment transactions, waits for receipts, and saves contract addresses and deployment records. --reset reruns all migration scripts on that local chain.')
p('The local development workflow was executed with Solidity 0.5.1. Deployment evidence is retained in evidence/migration.txt. Raw console startup output containing local development keys is excluded from the submission package.')
h('4h Basic tests')
p('test/xyz_coin.test.js uses Mocha through Truffle. Each test starts with a fresh XYZCoin instance so earlier transfers cannot contaminate later assertions. Tests check name, symbol, decimals, total supply, initial creator balance, direct transfer, allowance replacement and revocation, and delegated transfer with allowance consumption.')
code('''const tx = await coin.transfer(alice, 125, { from: owner });
assert.equal((await coin.balanceOf(owner)).toString(), "875");
assert.equal((await coin.balanceOf(alice)).toString(), "125");
truffleAssert.eventEmitted(tx, "Transfer", e =>
  e.from === owner && e.to === alice && e.value.toString() === "125"
);''')
h('4i Advanced tests and results')
p('truffle-assertions 0.9.2 checks transaction reverts and event arguments. Coverage includes insufficient balance, absent or insufficient authorization, rollback of allowance when a later balance check fails, Transfer from both transfer methods including zero values, and Approval from approve. Extra tests check self-transfers, supply conservation and rejection of the zero recipient.')
table(['Test suite','Observed result'],[
    ['XYZCoin ERC20 behavior','12 passed'],['Original and repaired voting contracts','4 passed'],
    ['Historical scan and oracle calculator','13 passed'],['Total','29 passed and 0 failed']], [4.8,2.1])

page('Reproduction and references')
h('Reproduce the submitted work')
code('''cd assignment4
npm ci
npm run compile
npm test -- --network test
npm run test:unit
npm run oracle -- 0.10 12.03
# After configuring your own INFURA_URL in .env:
npm run scan -- --out evidence/first-contract.json''')
p('The full sources, migration scripts, tests, dependency lockfile and real Infura evidence accompany this report. No GitHub push or LMS submission is asserted. Before submission, review the answers and course requirements and complete the cover fields and declaration. The personal endpoint is already configured locally but is deliberately excluded from the archive; configure a local .env before reproducing the network query elsewhere.')
h('References')
refs=[
 '[1] Course handout. Ethereum And Blockchain Solutions Design. Session 5, pages 20 to 31. Oracle, safe arithmetic and ERC20 lecture material.',
 '[2] Ethereum documentation. Oracles. https://ethereum.org/developers/docs/oracles/',
 '[3] Etherscan. Average Transaction Fee Chart. Observation November 1 2026. https://etherscan.io/chart/avg-txfee-usd',
 '[4] Etherscan. Average Block Time Chart. Observation November 1 2026. https://etherscan.io/chart/blocktime',
 '[5] Solidity 0.5.1 documentation. Types and integer arithmetic. https://docs.soliditylang.org/en/v0.5.1/types.html',
 '[6] Solidity documentation. Version 0.8.0 breaking changes. https://docs.soliditylang.org/en/latest/080-breaking-changes.html',
 '[7] Web3.js documentation. getBlock API. https://docs.web3js.org/api/web3-eth/function/getBlock/',
 '[8] MetaMask Support. How to create a new Infura API key. https://support.metamask.io/develop/account/api-keys/create-new-key/',
 '[9] Ethereum documentation. JSON RPC API, transaction objects and null recipients. https://ethereum.org/developers/docs/apis/json-rpc/',
 '[10] Ethereum Improvement Proposals. ERC 20 Token Standard. https://eips.ethereum.org/EIPS/eip-20',
 '[11] Course assignment. Assignment Lab 4 Optional. Session 5, questions 1 to 4 and submission requirements. The user-provided lecture summary was used for context; the assignment and technical specifications control the implementation.',
 '[12] Web3.js documentation. getFeeHistory API. https://docs.web3js.org/api/web3-eth/function/getFeeHistory/',
 '[13] Infura documentation. Credit costs. Accessed November 2 2026. https://docs.infura.io/get-started/pricing/credit-cost/'
]
for ref in refs:
    para=p(ref)
    for r in para.runs:r.font.size=Pt(9.5)
doc.core_properties.title='Assignment 4 Ethereum Smart Contract Design'
doc.core_properties.subject='Oracles voting contract repair historical analysis and ERC20 implementation'
doc.core_properties.author=''
doc.core_properties.keywords='Assignment 4; Solidity 0.5.1; ERC20'
# The bundled default template may contain a colored Title paragraph border.
for style in doc.styles:
    for border in list(style.element.iter(qn('w:pBdr'))):
        border.getparent().remove(border)
for para in doc.paragraphs:
    for border in list(para._p.iter(qn('w:pBdr'))):
        border.getparent().remove(border)
    for run in para.runs:
        if run.font.name == 'Consolas':
            run.font.name = 'Courier New'
doc.save(OUT)
print(OUT)
