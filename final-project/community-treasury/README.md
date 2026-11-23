# Community Treasury

A course project for **Introduction to Ethereum and Cloud Blockchain Solutions Engineering**: one ETH treasury, three fixed managers, and two distinct approvals before a payment can be executed.

The application runs the compiled Solidity contract on a real, temporary EVM inside the browser sandbox. Sandbox ETH has no monetary value. Wallet mode instead connects an existing deployment and verifies that its runtime bytecode exactly matches this project's compiled contract before enabling actions.

## Published coursework snapshot

- This repository publishes the application source, tests, and execution records. Course reports, presentation files, and speaker notes are maintained separately.
- [Source branch](https://github.com/zhuxuanze/ethereum-course/tree/final-community-treasury/final-project/community-treasury)
- [Public classroom demo](https://map-of-us-trial-d9fkeswkaf1e1376-1518430773.tcloudbaseapp.com/community-treasury/index.html). After the CloudBase access notice, open **Browser sandbox** and select **Launch sandbox**.
- The public frontend runs the contract in a temporary browser EVM (chain ID 1337). The receipt in `evidence/cloudbase-browser-verification.json` records a 0.25 demo ETH payment. `evidence/cloudbase-deployment.json` records the 13 verified static files.
- The software archive includes a built `dist/` directory. The source branch includes the application, tests, build scripts, lockfile and run records.

## Proposal summary

Open-source communities can pool ETH to reimburse contributors or pay for documented work. A supporter funds the treasury. A manager proposes a recipient, an amount and a purpose. Two different managers must approve before one of the three managers executes a payment. The website shows the approval count, spending history and transaction receipt. The browser sandbox provides an end-to-end classroom demonstration. The contract stores a hash of each purpose, and the browser keeps the corresponding text.

## Run the complete demonstration

Use Node.js 20 or later (recorded development run: Node.js 24.21.0).

```sh
npm ci --ignore-scripts
npm test
npm run build
npm start
```

Open `http://127.0.0.1:8874`. Click **Launch sandbox**. The app creates a fresh Ganache EVM, deploys the contract with three manager accounts, and deposits 10 simulated ETH. Runtime libraries are copied into `dist/`, so no CDN or wallet installation is needed for this mode after the build.

1. Launch the browser sandbox. The starting balance is 10 demo ETH. Under **Act as**, select **Supporter** and deposit 1 demo ETH.
2. Select Manager A and submit a 0.25 demo ETH request using the prefilled recipient. A new request starts with zero approvals. Manager A then selects **Approve**.
3. At one approval the execution control stays disabled. Switch to Manager B and approve the same request.
4. Select Manager C and execute once. The balance falls from 11 to 10.75 demo ETH. Review **Paid**, **Recent activity** and **Latest receipt**.
5. To repeat the exercise, use **Reset sandbox**. A page reload also starts a new browser session.

Switching to wallet mode asks for confirmation before ending a running sandbox. Cancel keeps the balance, requests and drafts. Confirm clears the session, including the recipient, amount, purpose and deposit fields. A wallet account, network or treasury change also clears those drafts. Reloading or resetting replaces the sandbox blockchain. Its addresses and transaction hashes are local demonstration identifiers, not Etherscan records.

## What the prototype implements

- Three distinct, nonzero owner addresses fixed at deployment; approval threshold fixed at two.
- ETH deposits from any address and immutable payment requests containing recipient, amount and purpose hash.
- Explicit owner approvals, revocation before execution, and an explicit execution transaction.
- Owner authorization, sufficient-balance checks, checks-effects-interactions, a reentrancy guard and rollback when a recipient rejects payment.
- Exact ETH display, confirmed receipts, approval history and role-aware browser controls.
- Off-chain purpose text in browser local storage, checked against its on-chain Keccak-256 commitment. Other managers can paste the exact purpose text to verify it.
- A wallet connection path for an existing matching contract on the wallet's selected network. The application never requests a private key or seed phrase.

## Architecture

```text
Browser interface and purpose storage
        | ethers.js / EIP-1193
        +-- Browser sandbox: Ganache EVM, simulated accounts and ETH
        +-- Connected wallet: selected Ethereum-compatible RPC network
                                  |
                         CommunityTreasury.sol
                    fixed owners + approvals + ETH
```

The full payment purpose stays off chain; the contract stores its hash. A hash protects integrity, not availability or confidentiality of easily guessed text. The prototype has no shared metadata server, so managers share the purpose text separately. The interface shows the latest 50 requests and the latest 20 events in its queried block range; these are not an unlimited archive.

### Configure wallet networks

The browser reads `web/networks.json` (served as `networks.json`) on each wallet connection. Each entry maps a positive decimal chain ID string to a display name. The default IDs are 1, 11155111, 1337 and 31337. To support a course-approved cloud EVM, confirm its chain ID with the operator and the instructor, add the ID and name, then rebuild and deploy the frontend. The interface uses ETH amounts with 18 decimals; list only networks that use that denomination. Users select the matching network in their wallet and enter the contract address deployed on that chain. The app checks the runtime bytecode, owners and threshold on the selected network. Configuring an ID does not deploy the contract. For configured chains without a built-in explorer link the receipt displays its transaction hash.

## Tests and evidence

`npm test` recompiles the Solidity sources before running the suite. The tests check the compiled artifacts against their source hashes and deploy them on isolated Ganache providers. `evidence/contract-test-results.json` records the execution environment, source hash and 29 scenario results. `evidence/contract-gas.json` records receipt gas for one local canonical lifecycle. Scenarios include unauthorized actions, duplicate/missing approvals, revocation, insufficient balance and retry, exactly-once payment, a reverting receiver, competing requests and reentrant owner-recipients.

`evidence/browser-test-results.json` records the sandbox browser integration checks, with screenshots in `evidence/browser/`. Separately, `evidence/wallet-browser-test-results.json` records the local injected-provider integration results. Those cases use an isolated Ganache EVM behind a controlled EIP-1193 wallet wrapper: they exercise contract identity, allowed networks, wallet-mode deposits, account/network changes, metadata integrity and transaction tracking. They do not establish acceptance by a real wallet extension or deployment on a public network.

To reproduce both browser checks, install the optional Playwright dependency and start the built app. Normal app use and the contract suite do not require Playwright.

```sh
npm install --no-save --package-lock=false playwright
npx playwright install chromium
npm run build
npm start
```

Keep the server running, then execute these commands from the project directory in a second terminal:

```sh
node scripts/browser-qa.cjs
node scripts/wallet-browser-qa.cjs
```

Both scripts use `http://127.0.0.1:8874` by default; set `QA_URL` if the local server uses another address. `PLAYWRIGHT_MODULE` can point to a separately installed Playwright package. Without that override, the scripts load the project's ordinary `playwright` package. `BROWSER_EXECUTABLE` selects an existing Chromium-compatible browser. Otherwise, the scripts use Microsoft Edge when installed in its standard macOS location, or Playwright's installed Chromium. The Chromium installation command can be omitted when using an existing compatible browser. The recorded run used Playwright 1.62.1 and headless Microsoft Edge in an isolated profile.

Local test pass counts are functional evidence, not an independent security audit, a claim of novel multisignature research, or proof of mainnet deployment. Gas observations depend on compiler, optimizer and EVM fork and are not USD cost estimates.

## RPC deployment

See [deploy/README.md](deploy/README.md). `npm run demo:chain` starts a separate loopback development node. `npm run deploy` prints a plan without sending a transaction; `npm run deploy -- --broadcast` executes a reviewed deployment. A mined receipt and exact bytecode/owner/threshold verification are retained in `deployments/`.

For an external deployment, the script requires an explicitly supplied RPC URL, expected chain ID, three owner addresses and signing key in the environment. Never place real secrets in the repository, frontend or report. The separate verifier requires expected owners on external networks. The browser only connects an existing deployment; it does not silently deploy or fund it.

## Scope and limitations

This project applies the established multisignature pattern to a small community's spending workflow. Managers judge whether an expense is appropriate. The contract enforces approvals and payment conditions; it cannot validate work quality. Two colluding managers can approve an inappropriate payment. Loss of two owner keys prevents further spending; owner rotation, recovery, upgrades, token governance, ERC-20 assets and automatic subscriptions are outside this fixed-owner prototype. Approved requests do not reserve funds; execution uses the balance available at that moment.

Cloud **web hosting** and browser-local EVM execution are different from an Ethereum-mainnet contract or an additional cloud **blockchain** deployment. Team names and final deployment targets remain to be confirmed. The supplied course documents differ on one versus two additional cloud blockchain platforms. No deployment or submission is complete without its recorded receipt.

## Project map

| Location | Content |
|---|---|
| `contracts/` | Treasury contract and local receiver test fixtures |
| `test/` | Executable contract checks |
| `web/` | Editable HTML, CSS and browser logic |
| `scripts/` | Compile, build, preview, deployment and verification |
| `artifacts/` | Reproducible ABI and bytecode |
| `evidence/` | Recorded tests, gas, browser checks and build hashes |
| `deployments/` | Actual local or external deployment receipts, labeled by network |

## Interface references

The payment view draws on two open-source projects. [Safe Wallet’s signer timeline](https://github.com/safe-global/safe-wallet-monorepo/blob/c802d58f6b89b926ea3695f5a5d207f2fae9afba/apps/web/src/components/transactions/TxSigners/index.tsx#L246-L315) shows approvals and execution as distinct events. [Open Collective’s transaction table](https://github.com/opencollective/opencollective-frontend/blob/687fe2ba99d766ac68ec40b977c1e26177fb039f/components/dashboard/sections/transactions/TransactionsTable.tsx#L206-L282) gives each transaction an amount and a detailed record. These patterns informed the approval statuses and request details in this interface.

## Primary technical references

1. [Ethereum smart contracts and multisignature accounts](https://ethereum.org/developers/docs/smart-contracts/)
2. [Solidity security considerations](https://docs.soliditylang.org/en/v0.8.30/security-considerations.html)
3. [Solidity ABI specification](https://docs.soliditylang.org/en/v0.8.30/abi-spec.html)
4. [EIP-1193 Ethereum provider JavaScript API](https://eips.ethereum.org/EIPS/eip-1193)
5. [ethers.js documentation](https://docs.ethers.org/v6/)
6. [Ganache source and documentation](https://github.com/trufflesuite/ganache)
7. [Safe smart account documentation](https://docs.safe.global/)

The proposal, course instructions and final report describe the coursework context. The final submission requires the team's actual names and any required signatures; these must be completed by the students.
