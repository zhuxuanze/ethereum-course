from pathlib import Path
import json, re
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.opc.constants import RELATIONSHIP_TYPE as RT
from docx.enum.text import WD_ALIGN_PARAGRAPH

ROOT=Path(__file__).resolve().parents[1]
WORKSPACE=ROOT.parents[1]
OUT=WORKSPACE/'output/final/community-treasury'
TMP=WORKSPACE/'tmp/final-treasury-docs'
OUT.mkdir(parents=True,exist_ok=True); TMP.mkdir(parents=True,exist_ok=True)
DATA=json.loads((ROOT/'docs/report-content.json').read_text())
SLIDES=json.loads((ROOT/'docs/presentation-content.json').read_text())['slides']
TEST=json.loads((ROOT/'evidence/contract-test-results.json').read_text())
GAS=json.loads((ROOT/'evidence/contract-gas.json').read_text())
FACTS_PATH=ROOT/'docs/delivery-facts.json'
FACTS=json.loads(FACTS_PATH.read_text()) if FACTS_PATH.exists() else {}

def font(style,size,bold=False,east='Songti SC'):
    style.font.name='Arial';style.font.size=Pt(size);style.font.bold=bold
    style.font.color.rgb=RGBColor(0,0,0);style.font.italic=False
    rpr=style.element.get_or_add_rPr(); rf=rpr.find(qn('w:rFonts'))
    if rf is None:rf=OxmlElement('w:rFonts');rpr.insert(0,rf)
    for k,v in [('ascii','Arial'),('hAnsi','Arial'),('cs','Arial'),('eastAsia',east)]:rf.set(qn('w:'+k),v)
    for k in ['asciiTheme','hAnsiTheme','eastAsiaTheme','cstheme']:rf.attrib.pop(qn('w:'+k),None)

def make_doc(title):
    d=Document();s=d.sections[0]
    s.page_width=Inches(8.5);s.page_height=Inches(11)
    s.top_margin=Inches(.72);s.bottom_margin=Inches(.7);s.left_margin=s.right_margin=Inches(.8)
    font(d.styles['Normal'],11)
    pf=d.styles['Normal'].paragraph_format;pf.line_spacing=Pt(15);pf.space_after=Pt(7);pf.widow_control=True
    for name,size in [('Title',25),('Subtitle',13),('Heading 1',15),('Heading 2',12)]:
        font(d.styles[name],size,name!='Subtitle',east='Heiti SC')
        p=d.styles[name].paragraph_format;p.space_before=Pt(13 if name.startswith('Heading') else 0);p.space_after=Pt(7);p.keep_with_next=True
        ppr=d.styles[name].element.find(qn('w:pPr'))
        if ppr is not None:
            for b in list(ppr.findall(qn('w:pBdr'))):ppr.remove(b)
    f=s.footer.paragraphs[0];f.alignment=WD_ALIGN_PARAGRAPH.RIGHT
    run=f.add_run();fld=OxmlElement('w:fldSimple');fld.set(qn('w:instr'),'PAGE');run._r.addnext(fld)
    font(d.styles['Footer'],9)
    d.core_properties.title=title;d.core_properties.subject='Ethereum course final project'
    d.core_properties.author='';d.core_properties.last_modified_by='';d.core_properties.comments=''
    return d

def link(p,label,url):
    h=OxmlElement('w:hyperlink');h.set(qn('r:id'),p.part.relate_to(url,RT.HYPERLINK,is_external=True))
    r=OxmlElement('w:r');pr=OxmlElement('w:rPr');c=OxmlElement('w:color');c.set(qn('w:val'),'000000');pr.append(c)
    u=OxmlElement('w:u');u.set(qn('w:val'),'single');pr.append(u);r.append(pr);t=OxmlElement('w:t');t.text=label;r.append(t);h.append(r);p._p.append(h)

def table(doc,headers,rows,widths=None):
    t=doc.add_table(rows=1,cols=len(headers));t.autofit=False
    if widths:
        for col,w in zip(t.columns,widths):col.width=Inches(w)
    for j,h in enumerate(headers):t.rows[0].cells[j].text=h
    for values in rows:
        cells=t.add_row().cells
        for j,v in enumerate(values):cells[j].text=str(v)
    for i,row in enumerate(t.rows):
        if i==0:
            trPr=row._tr.get_or_add_trPr();rep=OxmlElement('w:tblHeader');trPr.append(rep)
        for j,c in enumerate(row.cells):
            if widths:c.width=Inches(widths[j])
            tcPr=c._tc.get_or_add_tcPr();mar=OxmlElement('w:tcMar')
            for edge,val in [('top',80),('bottom',80),('left',100),('right',100)]:
                e=OxmlElement('w:'+edge);e.set(qn('w:w'),str(val));e.set(qn('w:type'),'dxa');mar.append(e)
            tcPr.append(mar);borders=OxmlElement('w:tcBorders')
            for edge in ['top','left','bottom','right']:
                e=OxmlElement('w:'+edge);e.set(qn('w:val'),'single');e.set(qn('w:sz'),'4');e.set(qn('w:color'),'D9D9D9');borders.append(e)
            tcPr.append(borders)
            if i==0:shade=OxmlElement('w:shd');shade.set(qn('w:fill'),'E6EDF0');tcPr.append(shade)
            for p in c.paragraphs:
                p.paragraph_format.line_spacing=Pt(13);p.paragraph_format.space_after=Pt(0)
                for r in p.runs:r.font.size=Pt(10);r.font.bold=(i==0)
    doc.add_paragraph().paragraph_format.space_after=Pt(1)
    return t

def actual_results():
    env=TEST['environment'];total=TEST['total'];passed=TEST['passed'];failed=TEST['failed']
    contract=(f"The recorded contract run completed {total} tests: {passed} passed and {failed} failed. "
        f"It used an isolated in-process Ganache chain with chain ID {env['chainId']}, the {env['hardfork'].capitalize()} hardfork, "
        f"Solidity 0.8.30, optimizer setting {env['optimizerRuns']} runs, and Node {env['node']}. "
        "The tests verified the constructor policy, distinct-approval accounting, owner permissions, revocation and reconfirmation, exactly-once payment, and balance checks. "
        "A receiver that is itself an authorized owner attempted to reenter both the current request and a different approved request; both attempts were blocked. "
        "A reverting receiver test verified rollback and a later successful retry. Competing approved requests could not spend beyond the balance remaining at execution.")
    browser=FACTS.get('browser_summary', 'Browser integration verification is not recorded in this report build. The completed contract results above do not by themselves establish that the browser workflow has passed.')
    vals={x['operation']:int(x['gasUsed']) for x in GAS['observations']}
    gas=(f"The same local lifecycle also saved receipt gas values. Deployment used {vals['deployment']:,} gas; a deposit used {vals['deposit']:,}; "
         f"request submission used {vals['submit']:,}; the first and second confirmations used {vals['confirm_first']:,} and {vals['confirm_second']:,}; "
         f"and execution used {vals['execute']:,}. These are individual observations for the specified compiler, inputs, and state. "
         "They are not estimates of currency cost. No gas-price comparison, throughput experiment, or statistical latency study was conducted.")
    return {'{{CONTRACT_RESULT}}':contract,'{{BROWSER_RESULT}}':browser,'{{GAS_RESULT}}':gas}

report=make_doc(DATA['title'])
p=report.add_paragraph(DATA['title'],'Title');p.paragraph_format.space_before=Pt(70)
report.add_paragraph(DATA['subtitle'],'Subtitle')
report.add_paragraph(DATA['course'])
report.add_paragraph('Instructor: '+DATA['instructor'])
report.add_paragraph('Date: '+DATA['date'])
report.add_paragraph('Team members: __________________________________________________')
report.add_paragraph('Member contributions and required signatures: ________________________')
report.add_paragraph('________________________________________________________________')
report.add_paragraph('Implementation and local evaluation','Heading 2')
report.add_paragraph('Three fixed owners jointly manage one ETH treasury. Two current approvals authorize an owner to execute a specified payment. This report documents the prototype, the recorded checks, and the remaining deployment requirements.')
for key,label,flag in [('repository_url','Source repository','repository_verified'),('site_url','Hosted application (owner-only private)','site_deployed')]:
    p=report.add_paragraph()
    if FACTS.get(key) and FACTS.get(flag):p.add_run(label+': ');link(p,FACTS[key],FACTS[key])
    else:p.add_run(label+': publication not verified in this report build.')
report.add_page_break()
report.add_paragraph('Abstract','Heading 1');report.add_paragraph(DATA['abstract'])
results=actual_results()
for section in DATA['sections']:
    report.add_paragraph(section['title'],'Heading 1')
    for para in section['paragraphs']:report.add_paragraph(results.get(para,para))
    if section['title'].startswith('4 '):
        report.add_paragraph('Table 1 System responsibilities','Heading 2')
        table(report,['Component','Responsibility'],[
          ['Treasury contract','Owner permissions, immutable request fields, current confirmations, balance checks, transfer execution and events.'],
          ['Browser interface','Forms, account or role selection, transaction submission, receipt feedback, and display of current contract state.'],
          ['Browser storage','Off-chain payment descriptions, scoped to the network and contract, checked against their on-chain hashes.'],
          ['Provider and network','Connection to the browser EVM or to a wallet-selected external network.']],[1.55,5.35])
    if section['title'].startswith('6 '):
        report.add_paragraph('Table 2 Recorded verification scope','Heading 2')
        table(report,['Check group','Observed outcome'],[
          ['Construction and access','Zero or duplicate owners, nonowner actions and invalid request IDs were rejected.'],
          ['Approval accounting','Duplicate approvals did not increase authority; revocation removed authority until restored.'],
          ['Payment eligibility','Zero or one approval and insufficient balance prevented payment.'],
          ['Execution consistency','An executed request could not pay again; failed recipients rolled back state.'],
          ['Reentrancy and contention','Owner-receiver reentry and competing balance overspending attempts were blocked.']],[1.65,5.25])
        report.add_paragraph('Table 3 Single-run local gas observations','Heading 2')
        table(report,['Operation','Gas used'],[(x['operation'].replace('_',' ').capitalize(),f"{int(x['gasUsed']):,}") for x in GAS['observations']],[4.6,2.3])
report.add_paragraph('9 References','Heading 1').paragraph_format.page_break_before=True
for ref in DATA['references']:
    p=report.add_paragraph(f"[{ref['id']}] {ref['author']}, {ref['title']}. Accessed 4 November 2026. ")
    link(p,ref['url'],ref['url'])
report.add_paragraph('Appendix Reproduction and delivery status','Heading 1')
report.add_paragraph('Run the following commands from the project directory using a compatible Node.js installation: npm ci; npm run compile; npm test; npm run build; npm start. The start command prints the local address. Open that address, select Browser sandbox, and launch the temporary EVM. Demo ETH has no monetary value, and reloading or resetting starts a new sandbox.')
report.add_paragraph('Evidence files include evidence/contract-test-results.json, evidence/contract-gas.json, the compiler artifact, and any browser or deployment records included with the repository. Transaction hashes from the isolated Ganache run belong to that local chain and cannot be looked up on a public Ethereum explorer.')
report.add_paragraph('The course documents differ on the final public-network and cloud-blockchain deployment targets. Those targets require instructor confirmation. A hosted frontend is not evidence of mainnet or cloud-blockchain contract deployment. Group members must complete their names, contribution statements, and any required signatures before submission.')
report_path=OUT/'Community_Treasury_Final_Report_EN.docx';report.save(report_path)

guide=make_doc('Community Treasury Final Presentation Guide')
guide.add_paragraph('共同资金管理项目最终展示讲稿','Title')
guide.add_paragraph('英文发言与中文对照','Subtitle')
words=sum(len(re.findall(r"\b[\w]+(?:[-'][\w]+)*\b",s['en'])) for s in SLIDES)
guide.add_paragraph(f'对应 12 页展示稿，英文正文约 {words} 词，含操作演示预计 6 至 7 分钟。只朗读英文；中文和操作提示供练习。演示请使用 Browser sandbox，演示 ETH 没有真实价值。')
for i,s in enumerate(SLIDES,1):
    guide.add_paragraph(f"{i} {s['title']}",'Heading 1')
    p=guide.add_paragraph(f"建议时长约 {s['seconds']} 秒。操作提示：{s['action']}")
    p.paragraph_format.keep_with_next=True
    p.paragraph_format.keep_together=True
    for r in p.runs:r.font.size=Pt(10)
    p=guide.add_paragraph(s['en']);p.paragraph_format.keep_with_next=True;p.paragraph_format.keep_together=True
    p=guide.add_paragraph(s['zh']);p.paragraph_format.line_spacing=Pt(17);p.paragraph_format.keep_together=True
guide.add_paragraph('现场演示检查','Heading 1')
for t in ['演示前打开应用并确认脚本和字体正常加载。可提前启动一次沙盒熟悉流程，再重置以正式展示。',
          '使用 Manager A 提交申请并批准一次；显示当前批准数量不足，Execute 尚不可用。',
          '切换 Manager B 批准同一申请；强调“已获批准”和“已经付款”是两个状态。',
          '执行付款后展示回执、余额变化和 Paid 状态。无需把真实资金或私人钱包导入沙盒。',
          '如果老师追问部署状态，依据实际发布记录回答。浏览器沙盒、网站托管和公共链部署不可混为一谈。']:
    guide.add_paragraph(t)
guide_path=OUT/'Community_Treasury_Final_Demo_Guide_EN_ZH.docx';guide.save(guide_path)

body=' '.join(p.text for p in report.paragraphs)
audit={'report':str(report_path),'guide':str(guide_path),'report_words_including_references':len(re.findall(r"\b[\w]+(?:[-'][\w]+)*\b",body)),
       'guide_english_words':words,'test_count':TEST['total'],'facts':FACTS,'references_verified':['1','2','3','4','5','6','7','8']}
(TMP/'document-build.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2))
print(json.dumps(audit,ensure_ascii=False,indent=2))
