# Assignment 4

代码、英文 Word 报告和本地测试证据。按课程要求使用 Solidity 0.5.1、Truffle 5.11.5；不是期末项目提案。

## 当前状态

- 第 1 题：预言机答案及预算计算已完成。Etherscan 2026-11-01 的平均交易费为 $0.10，平均出块时间为 12.03 秒；$10/天对应约每 72 个区块更新一次。
- 第 2 题：本地复现原投票合约的整数下溢，修复后同一操作回滚。
- 第 3 题：已使用个人 Infura 主网接口真实运行。从区块 0 完整核查到 46402，首笔 `to === null` 交易位于 **46402**（交易序号 0）。结果、完整查询记录及离线核查均已保存。
- 第 4 题：ERC20 编译、Truffle Develop 本地部署、12 项代币测试已通过。
- 总计 16 项合约测试和 13 项 Node 程序测试通过。
- 报告封面的姓名、邮箱、声明和签名待学生填写。尚未提交 LMS。
- GitHub 作业目录：[assignment4](https://github.com/zhuxuanze/ethereum-course/tree/codex/assignment4/assignment4)。报告及验证摘要中的发布状态记录的是生成时的状态；GitHub 交付以本分支为准。

## 文件

| 路径 | 内容 |
| --- | --- |
| `report/Assignment4_Report.docx` | 可编辑英文报告，覆盖全部小题及真实运行结果 |
| `contracts/XYZCoin.sol` | ERC20 代币实现 |
| `contracts/ERC20.sol` | 标准函数与事件接口 |
| `contracts/SafeMath.sol` | 适用于 Solidity 0.5.1 的安全算术 |
| `contracts/FixedVoting.sol` | 修复后的投票合约 |
| `contracts/FlawedVoting.sol` | 仅供本地测试的原始漏洞合约 |
| `migrations/` | 部署脚本 |
| `test/` | Truffle 合约测试 |
| `scripts/first-contract.cjs` | 第 3 题完整历史扫描程序 |
| `scripts/oracle-budget.cjs` | 第 1 题预算计算器 |
| `tests/` | 扫描器与计算器的 Node 测试 |
| `evidence/` | 实际编译、部署、测试和数据来源记录 |

## 安装与运行

本机验证环境为 Node 24.21.0、npm 11.19.0。Truffle 和 Ganache 为题目指定的历史工具；可选原生 WebSocket 扩展在此 Node 版本下回退至 JavaScript 实现，不影响本次通过的测试。

```bash
cd assignment4
npm ci
npm run compile
npm test -- --network test
npm run test:unit
npm run oracle -- 0.10 12.03
```

本地交互部署：

```bash
npm run compile
npx truffle develop
```

在 Truffle 控制台执行 `migrate --reset`，完成后用 `.exit` 退出。正常应部署 `Migrations` 与 `XYZCoin` 两个合约。测试用 ether 没有真实资金用途。

`npm run compile` 会在编译后清理接口产物中空的可选 metadata 字段，解决 Truffle 5.11.5 控制台与 solc 0.5.1 输出的兼容问题。它不改变 ABI、字节码、源码或部署记录。

## Infura 是什么

Infura 提供托管区块链节点接口。程序用 Web3.js 把查询发送给 Infura，Infura 返回以太坊区块和交易数据，因此电脑无需维护完整节点。本题只查询公开数据，不使用钱包私钥，不签名或转账。

在其他电脑复现时完成个人配置（本机已配置）：

1. 打开 [MetaMask Developer](https://developer.metamask.io/) 或 [Infura](https://app.infura.io/)，创建账号并完成所需邮箱验证。
2. 创建或选择 API Key，在端点页面选择 Ethereum Mainnet HTTPS。
3. 将 `.env.example` 复制为 `.env`，把完整的主网接口地址填入 `INFURA_URL`。
4. 运行下列命令。不要把 `.env`、API Key 或钱包私钥提交到 Git。

```bash
npm run scan -- --out evidence/first-contract.json
```

程序默认从区块 0 开始。每次用 `eth_feeHistory` 读取最多 1024 个区块的 Gas 使用比例，严格核对区间起点、长度和每个比例。比例为 0 的区块没有消耗 Gas 的交易；其他区块通过 `getBlock(number, true)` 逐笔检查 `to === null`，包括失败的创建尝试。普通转账到零地址和内部 CREATE 不符合这个顶层交易判定。默认并发数为 4；遇到缺失数据会重试并最终中止。`--mode full` 可运行基础逐块版本，但请求量较大。支持现有的 `HTTPS_PROXY` / `HTTP_PROXY` 环境变量。

例如 `--start 40000 --end 50000` 只证明指定区间内的最早结果，不能独立证明全链最早。不得直接对“单个区块是否存在创建交易”做二分搜索，因为这个条件不单调。

本次实际结果：

- 区块：46402；交易序号：0。
- 交易：`0x6c929e1c3d860ee225d7f3a7addf9e3f740603d243260536dfa2f3cf02b51de4`。
- 检索时间：2026-11-02 08:07:22 UTC；提供商：`mainnet.infura.io`；chain ID：1。
- 使用 46 次历史查询和 80 次完整区块查询（并发会多读取一个后续区块）。目标及之前共 46,403 个区块，其中 46,324 个为空区块、79 个非空区块。
- `evidence/first-contract.json` 为结果，`first-contract-proof.ndjson` 为全部历史窗口和完整区块响应，`proof-audit.json` 为连续覆盖与最早交易核查。
- 这是拜占庭升级前的交易，回执没有现代 `status` 字段；不据此宣称执行成功或失败。

Infura 官方列出的两种查询均为每次 80 credits，扫描主体约用 10,080 credits，另有少量连接与回执查询。未发送链上交易，不需要 ETH。依据：[Infura 请求额度说明](https://docs.infura.io/get-started/pricing/credit-cost/)。密钥仅在本机 `.env`，不包含在提交包中。

## 测试证据与报告

`evidence/compile.txt` 记录精确编译器；`evidence/migration.txt` 记录两个本地部署；`evidence/contract-tests.txt` 与 `evidence/unit-tests.txt` 记录测试；`evidence/etherscan-observations.json` 保存来源、日期及页面原始数据片段。

报告使用 Letter 纸张，封面保留作业提供的字段。`report/build_report.py` 是重建源码，需使用带 `python-docx` 的 Python 环境。报告题目内容和实测结果已完成。提交前仍需本人核对并填写封面姓名、邮箱、声明和签名。
