# Deployment procedure and completion boundary

The static website can be hosted separately from the blockchain. Hosting the frontend is **not** equivalent to deploying a blockchain node, an Ethereum-mainnet contract, or an additional cloud blockchain platform.

## Reproduce the website

From the project directory, run `npm ci --ignore-scripts`, `npm run build`, then `npm start`. Open the printed loopback URL. All runtime libraries are included in `dist/`; the app does not require a CDN. The browser sandbox executes the compiled Solidity contract in a disposable Ganache EVM with simulated ETH.

Optional container recipe: `docker build -f deploy/Dockerfile -t community-treasury .`, then `docker run --rm -p 8874:80 community-treasury`. The Docker recipe is supplied for portability; do not call it verified unless an actual container build/run is recorded. Static `dist/` can alternatively be uploaded to a course-approved web host.

## Reproduce a local RPC deployment

1. In one terminal run `npm run demo:chain` (loopback port 18545, chain ID 1337).
2. Run `npm run compile` then `npm run deploy` to inspect the plan. This does not submit a transaction.
3. Run `npm run deploy -- --broadcast` to deploy to this disposable local chain.
4. The command writes a receipt and bytecode-match evidence into `deployments/`. Local hashes are not public-chain explorer links.
5. Run `CONTRACT_ADDRESS=<recorded-address> npm run verify:deployment` to independently read back owners, threshold and exact runtime bytecode.

## Classroom milestone on Sepolia

Open `deploy-sepolia.html` alongside the hosted treasury homepage, or run `npm run build` followed by `npm start` and visit `http://127.0.0.1:8874/deploy-sepolia.html`. Select Sepolia (chain ID 11155111) in your browser wallet. Use three different manager addresses controlled by your team and a deployment account with Sepolia test ETH.

1. Enter the three public addresses. Select **Connect wallet and preview deployment**. Review the funding account, fee estimate and manager addresses. The manager addresses become permanent at deployment.
2. Select **Sign deployment in wallet** and review the wallet confirmation. The page retains the transaction hash in this tab and links to Sepolia Etherscan. If the transaction is pending, select **Check deployment receipt** after mining. Reloading the tab resumes verification.
3. Save the verified JSON record. The page checks the constructor transaction, deployed runtime, three managers and the two-approval threshold. Copy the displayed contract address to the treasury homepage and connect the same network through wallet mode.
4. Make a test deposit. Have a manager propose a payment to a controlled test recipient. Have two different managers approve it. After one approval the payment remains pending. After two approvals a manager can execute a separate payment transaction. Compare the recipient and treasury balances and keep the three transaction hashes for the deposit, proposal and execution.
5. Independently verify the public deployment with `DEPLOYMENT_TX_HASH` using the command below. To reconstruct the payment and any intervening approvals or revocations, set `RPC_URL`, `EXPECTED_CHAIN_ID=11155111`, `OWNER_ADDRESSES`, `CONTRACT_ADDRESS`, `DEPOSIT_TX_HASH`, `SUBMIT_TX_HASH` and `EXECUTE_TX_HASH`. Run `npm run --silent verify:payment` and save the JSON with the presentation evidence. The node must serve historical contract calls, balances and event logs for the execution block. The proof records the executed native ETH amount, the executor and gas fee, and both treasury and recipient end-of-block balances. A recipient who pays the execution fee receives a net balance change after gas. Other transactions in the same block or a contract recipient forwarding ETH may also change the observed totals.

Confirm the applicable final network requirements for this group's self-selected topic separately from the classroom testnet milestone.

## Course-approved external network

Section V of the Final Project Specification (page 3) calls for Ethereum mainnet and a minimum of two cloud blockchain platforms. The Course Project Guidance (page 2) gives a lower minimum of one additional cloud blockchain platform. Plan for mainnet and two cloud blockchain platforms unless the course team approves another scope. Set `RPC_URL`, `EXPECTED_CHAIN_ID`, `DEPLOYER_ADDRESS` (public funding address) and `OWNER_ADDRESSES` (three distinct, comma-separated public addresses). The constructor permanently fixes those owners. From the project directory, run:

```sh
npm run deploy -- --unsigned-file treasury-unsigned.json
```

The command prepares a contract creation request using the compiled artifact. Review the chain ID, owners, funding address, current balance and estimated maximum execution fee. The fee quote covers gas at the time of planning. A target network may charge additional fees. The JSON contains the unsigned request in `transaction`; a compatible wallet can review and sign it on the chosen network. Refresh the quote before signing. The CLI also supports explicit submission with `npm run deploy -- --broadcast` using a signer configured locally through `DEPLOYER_PRIVATE_KEY`. Keep signing material in your wallet or private local environment.

After the wallet submits the transaction and the chain confirms it, keep the same RPC_URL, EXPECTED_CHAIN_ID and OWNER_ADDRESSES and run `DEPLOYMENT_TX_HASH=<wallet-transaction-hash> npm run verify:deployment`. Set DEPLOYER_ADDRESS to also check the signer. This reads the receipt and creation data, checks on-chain owners, threshold and runtime code, and writes a per-deployment proof in `deployments/`. For an ETH-denominated EVM with 18 decimals, add its approved chain ID and display name to `web/networks.json` and rebuild the frontend. Connect the browser wallet on that network and enter the deployed contract address. A complete external acceptance run must demonstrate deposit, request, two approvals, execution, and readback. The browser demo, a deployment script, an RPC connection or a hosted webpage alone is not proof of this external deployment.

Mainnet deployment, additional cloud blockchain platform deployment, and teacher submission remain pending when no corresponding execution receipt exists.
