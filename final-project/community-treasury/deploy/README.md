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

## Course-approved external network

Confirm the required Ethereum network and the number/type of additional cloud blockchain platforms with the instructor. Course files differ between one additional cloud platform and mainnet plus two platforms. Configure an approved RPC endpoint and three real owner addresses. Run the same compiler and deployment plan with `EXPECTED_CHAIN_ID` set. An external signing key must be supplied explicitly in the local environment, never in the frontend, source repository or a report. Review gas and balance before adding `--broadcast`. The application itself never asks for a seed phrase or private key.

After a successful deployment, retain the mined receipt, address, network identifier, compiler/source hash, all owners, threshold and exact runtime verification. Connect the browser wallet on that network and enter the deployed contract address. A complete external acceptance run must demonstrate deposit, request, two approvals, execution, and readback. The browser demo, a deployment script, an RPC connection or a hosted webpage alone is not proof of this external deployment.

Mainnet deployment, additional cloud blockchain platform deployment, and teacher submission remain pending when no corresponding execution receipt exists.
