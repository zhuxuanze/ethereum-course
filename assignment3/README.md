# Assignment 3: Solidity and Ethereum interactions

This directory contains the supplied storage example, a Hello World contract, pinned independent Solidity compilers, and reproducible local functional experiments. The coursework repository's existing Assignment 2 application and root configuration are unchanged.

The results in `evidence/local-results.json` come from a fresh **local Hardhat chain**, not Remix VM or Sepolia. Browser and public-testnet evidence, when supplied separately, must retain its own network and transaction identifiers.

## Reproduce the local work

Use Node.js 22.10.0 or later from a supported even-numbered release. The recorded run uses Node.js 24.21.0. Run these commands from this directory:

```sh
npm ci --ignore-scripts
npm run compile
npm test
npm run evidence
```

The dependency lockfile pins Hardhat 3.20.0, ethers 6.17.0, and the `solc-0.5.17` and `solc-0.4.24` npm aliases. Installation requires npm registry access; compilation and the local experiments require no external blockchain connection. The test and evidence commands each compile the sources and start and stop their own local node on an unused loopback port. They use disposable, unlocked local accounts without loading a wallet or writing private keys. Hardhat's account/key listing is discarded by the node launcher.

For an interactive local node, `npm run node` serves JSON-RPC at `http://127.0.0.1:8545`. This optional command displays Hardhat's standard disposable development accounts; those accounts must never be used for real funds.

## Compiler profiles and artifacts

| Contract or profile | Compiler | Optimizer | Compiler EVM target |
| --- | --- | --- | --- |
| `contracts/StorageTest.sol` | solc-js 0.5.17 | Disabled; `runs: 200` is recorded but inactive | Istanbul |
| `contracts/HelloWorld.sol` | solc-js 0.5.17 | Enabled, 200 runs | Istanbul |
| Optional `contracts/legacy/*.sol` | solc-js 0.4.24 | Disabled | Byzantium |

The executing local node uses **Shanghai**, chain ID **31337**. The compiler EVM target controls emitted instructions; the node hardfork controls execution rules and gas accounting. These settings are deliberately recorded separately.

`scripts/compile.mjs` invokes each pinned compiler's standard JSON API directly. Hardhat supplies the node and does not download or compile Solidity. The 0.4.24 pathway is checked using a harmless, in-memory compiler probe; no reentrancy exploit is included or run by this functional package. If legacy source files are supplied in `contracts/legacy/`, the same command compiles them as a separate 0.4.24 build.

Generated files are retained for review:

- `artifacts/manifest.json`: full compiler versions, explicit settings, source hashes, and compiler warnings.
- `artifacts/builds/<profile>/input.json` and `output.json`: exact standard JSON compiler input and full output.
- `artifacts/<contract>/artifact.json`: ABI, creation bytecode, runtime bytecode, metadata, and settings together.
- `artifacts/<contract>/abi.json`, `creation.bin`, and `runtime.bin`: separate deployment and interaction artifacts. Binary files contain hexadecimal text without a `0x` prefix.

`creation.bin` is the deployment bytecode, corresponding to native solc's `--bin`. `runtime.bin` corresponds to `--bin-runtime`: it is the code left at the address after deployment. Deploy the creation bytecode. The ABI describes function selectors, parameter encoding, return decoding, and mutability; it is not executable bytecode. The script exports both bytecode forms through standard JSON rather than assuming that the solc-js CLI implements every native-solc flag.

## Storage experiment: Question 1(d)

`StorageTest.sol` preserves the assignment's `^0.5.1` pragma, `bytes32[] b`, and `put(bytes32[] memory)` assignment. It adds no getter or event that could change the measured transaction.

`scripts/experiments.mjs` deploys a new empty contract and calls `put` exactly once with the assignment's 32 words. Each word has first byte `0x01` through `0x20` and 31 zero bytes, so the data occupies 1,024 bytes. The command then checks the array's length in storage slot zero and checks all 32 data slots beginning at `keccak256(bytes32(0))` against the supplied words. These direct slot checks verify the stored data independently of a getter.

The evidence records deployment gas separately from the first `put()` receipt's `gasUsed`. It also records the transaction hash, block, input calldata, and every inspected slot. The dynamic array's length occupies an additional storage slot, so counting only 32 payload-slot writes is not a complete estimate of this transaction.

To reproduce the browser measurement in Remix:

1. Open `contracts/StorageTest.sol` in Remix, select compiler **0.5.17**, disable optimization, and select the **Istanbul** compiler EVM target.
2. Select the **Remix VM (Shanghai)** environment if available, deploy a new instance, and confirm that its array has not previously been populated. Record the actual environment if a different fork is used.
3. Copy the complete array from `evidence/storage-input.json` into the `put` argument and send one transaction.
4. Expand the resulting receipt and capture its transaction gas cost. Keep the deployment receipt separate. Preserve the compiler/environment settings and the receipt in the browser evidence.

A repeated call writing the same values is a different experiment and usually costs much less. A gas limit is not measured gas usage. Remix's execution cost and total transaction cost are also distinct; the comparison requested by the assignment concerns the total transaction gas cost.

Local gas prices are simulated values. For the requested USD comparison, separately capture a timestamped Ethereum-mainnet gas price in gwei and ETH/USD price from Etherscan, and use `gasUsed × gwei × 10^-9 × ETH/USD`. This is a mainnet-equivalent estimate, not a monetary cost of local or Sepolia test ETH. Historical 20,000/5,000 SSTORE figures are simplified course assumptions; modern access, write, and refund rules depend on the executing network and fork. Current Sepolia and the Shanghai local chain must not be assumed to use the same gas rules.

## Hello World: Questions 5(d)–5(g)

`HelloWorld.hello()` is `public pure` and returns the exact string **`Hello, world!`**. The compiler profile enables optimization with 200 runs.

The local experiment performs both interactions:

1. An `eth_call`, which returns ABI-encoded data without creating a blockchain transaction. The decoded result must equal the exact greeting.
2. An explicit `signer.sendTransaction({to, data})` to the same pure function. Its receipt must show success, a mined block, and positive gas usage. Calling a read-only function through a transaction still uses gas.

The compiled ABI remains accurate; no `constant` or mutability field is falsified to make the wallet send a transaction. `evidence/hello-calldata.txt` contains the encoded `hello()` selector for an explicit transaction, and `artifacts/HelloWorld/creation.bin` contains the deployable code.

For the separately performed Sepolia exercise, deploy this creation bytecode using a funded Sepolia account, then send the same function calldata as a transaction and retain the deployment and call transaction hashes and explorer links. A standard transaction receipt does not include the Solidity return value. Read and decode it using `eth_call` or an explorer's contract-read interface; supported execution traces are another option. Keep the mined transaction proof and the read-call result as distinct evidence.

### Minimal browser deployment page

Run `npm run browser` and open `http://127.0.0.1:8863/`. The English page uses the vendored ethers 6.17.0 browser bundle and the existing HelloWorld ABI, creation bytecode and runtime bytecode. It requests no wallet access automatically. The completed deployment and hello transaction hashes are prefilled for read-only recovery: click **Connect MetaMask**, **Recover existing deployment**, **Recover hello transaction**, **Read hello()**, and download the public evidence JSON. The completed transactions must not be sent again; their saved hashes block duplicate sends.

EIP-6963 discovery selects the `io.metamask` provider; the legacy fallback requires the MetaMask flag and excludes Binance flags. The page requires Sepolia and the course Account 2 address `0xf022a488d7730a66d9aa986077162425ca910200`. Every transaction rechecks the network and account, estimates gas, and sends zero ETH value. The wallet confirms transactions through its own interface. The page records receipts, hashes, blocks, gas, the read result, and the deployed-runtime bytecode comparison. It never requests private keys or seed phrases.

Recovery only queries RPC data. It verifies the sender, Sepolia network, null creation target, zero value, exact creation input and deployed runtime. Transactions use raw `eth_sendTransaction`; the returned hash is saved immediately before receipt queries or formatting. Public execution evidence persists in this page's local storage across refreshes. Raw transaction and receipt JSON are retained, nullable fields remain null, and fee calculation uses `effectiveGasPrice` when available. The ethers bundle is used for ABI encoding/decoding and byte hashing, without SDK transaction/receipt formatting that may reject new protocol fields. `evidence/browser-recovery-checks.json` records mock-RPC recovery checks, including null chain/nonce/gas-price fields; it is not Sepolia execution evidence.

The hello transaction request omits `gas` and `gasLimit` so MetaMask can estimate its final transaction, including smart-account wrapping. A direct-call estimate is recorded only as information. A retry requires a recovered receipt confirming failure and the same verified intended call. Previous attempts remain in the exported history. Wrapped calls are accepted only for the verified MetaMask manager and delegated implementation, with exactly one operation, the exact contract/zero value/selector, all-zero default single-call revert-on-failure mode, and receipt status 1. A try/continue-on-failure mode is rejected even if the outer receipt succeeds.

The server binds only to loopback and serves an explicit whitelist: the page, its JavaScript/CSS, the necessary ethers bundle and three HelloWorld artifacts. It does not serve reports, personal fields, evidence, directory listings, arbitrary `node_modules` files or write endpoints. Translation suppression is set on the HTML document. `evidence/browser-interface-checks.json` records syntax, route and mock-wallet rejection checks; these checks are separate from actual Sepolia execution evidence.

### Recorded Sepolia results

The optimized contract is deployed at [`0x5eeb0043117380d3e1cbf0b8424459291e1aabb5`](https://sepolia.etherscan.io/address/0x5eeb0043117380d3e1cbf0b8424459291e1aabb5). Its runtime matches `artifacts/HelloWorld/runtime.bin` exactly.

| Operation | Transaction | Status | Gas used |
| --- | --- | --- | ---: |
| Deployment | [0xa9511ae0…e7e2e993](https://sepolia.etherscan.io/tx/0xa9511ae0f8e96abf1f9eb8c1aec8e04be846db521d8435257a3cc96be7e2e993) | Success | 605,469 |
| Hello transaction | [0x8b950980…108c9f8](https://sepolia.etherscan.io/tx/0x8b950980dd75980694d889c651c7bf42f96c0b62ef242e0b0d12290f3108c9f8) | Success | 195,438 |

MetaMask submitted the successful call as a type-2 transaction through its DelegationManager after the account had been delegated with EIP-7702. The decoded inner operation targets the HelloWorld address, sends zero value, and calls exactly `0x19ff1d21` in default atomic mode. A separate `eth_call` returns **`Hello, world!`**. That return value is not a field of the transaction receipt.

An earlier [wrapped attempt](https://sepolia.etherscan.io/tx/0x80d3129fa81e01d84fc72ca85a69292426225a7f49617faf86f772f8db42b423) failed with receipt status 0 and used 288,115 of its 291,128 gas limit. Its actual raw data is preserved in `evidence/sepolia-failed-hello.json`. The successful explicit retry used MetaMask's native final-transaction gas estimation; wallet protections were not disabled. No failed receipt is presented as a success.

The downloaded public execution record is `evidence/sepolia-results.json`. Independent read-only public-RPC checks, including exact inner-call decoding, bytecode comparison and the greeting at the successful block, are summarized in `evidence/sepolia-verification.json`. Raw public-node provenance is retained alongside it. Mock interface checks remain separately labeled.

## Functional checks and evidence

`npm test` checks both compiler profiles, both bytecode forms, the exact 1 KiB fixture, the 0.4.24 standard JSON pathway, all storage slots after the first write, and the greeting through a call and a real local transaction.

The recorded run on **18 October 2026 at 18:05:55 (Asia/Shanghai)** passed **5 of 5 tests**. On the local Shanghai chain, it measured:

| Transaction | Gas used |
| --- | ---: |
| StorageTest deployment | 144,997 |
| First StorageTest `put()` of 1 KiB | 758,364 |
| Optimized HelloWorld deployment | 109,005 |
| Explicit HelloWorld `hello()` transaction | 21,644 |

All 32 data slots and the length slot matched, and the separate read call returned `Hello, world!`. These measurements are preserved in the JSON evidence; they are not live-network costs.

`npm run evidence` writes:

- `evidence/local-results.json`: the actual node/runtime/compiler versions, network rules, settings, successful transaction receipts, gas figures, read result, and storage-slot checks.
- `evidence/storage-input.json`: the full 32-word Remix input.
- `evidence/hello-calldata.txt`: the encoded `hello()` transaction input.

The local chain is newly created for every run. Its addresses and transaction hashes are local identifiers and are not searchable on Etherscan. Legacy compiler dependencies can emit deprecation or V8 asm.js warnings on modern Node.js; successful compilation and the functional checks determine whether the recorded run passed.

The final report and separately gathered Remix/Sepolia evidence accompany this code. LMS submission is performed by the student.

## Completion status

The functional storage and Hello World work is implemented and tested. Question 6(d), the executable attack-contract implementation and reentrancy reproduction, is **not completed**. The report contains the vulnerability explanation and a source-level defensive repair without claiming an attack or repair-regression run.
