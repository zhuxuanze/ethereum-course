# Ethereum course — Assignment / Lab 2

Casino DApp for SWUFE / GEC Academy's Introduction to Ethereum and Cloud Blockchain Solutions Engineering.

The final implementation uses React, Babel, webpack, Web3.js and MetaMask on Sepolia. The Solidity contract is adapted from the Casino tutorial and includes settlement corrections.

## Final deployment and observed results

- Network: Sepolia, chain ID 11155111.
- Contract: `0xa21408BdCcBf43b5767159Aeb2BE0E24f4F91eE8`.
- Deployment transaction: `0x03ad41652e65079580a0846e54e00515d7dc5bf7f89ed9ee26ef4078f9b73d3f`.
- Successful React bet: `0xa28e71afabc8dcf2f62305720dd6e760e487a522039c1df65700bf8e9dce2df4`.
- Test account: `0xf022a488D7730A66D9Aa986077162425CA910200`.
- Bet: number 5, 0.1 Sepolia ETH. Receipt status was 0x1 and the revised contract emitted BetPlaced.
- Public website: https://2603e5ea.pinit.eth.limo
- Source revision: https://github.com/zhuxuanze/ethereum-course/commit/a07abc7

On October 8, 2026, the final public page connected through MetaMask and showed 1 bet, a 0.1 ETH pool, a 0.1 ETH minimum and a 100-bet threshold. The account had already bet locally, so the public test only connected and read state. Earlier contracts and their bets are separate records and were not transferred to this deployment.

## Run locally

Requires Node.js 22 or later and a browser with MetaMask.

```sh
npm ci
npm run build
npm start
```

The default server opens http://127.0.0.1:8080 . The recorded final test used port 8082 because other local servers already occupied earlier ports:

```sh
npx http-server ./dist -a 127.0.0.1 -p 8082 -c-1
```

Select Sepolia in MetaMask and click Connect MetaMask. The frontend reads the contract statistics and player status from a common block and refreshes every seven seconds. Reading the page does not place a bet.

`src/js/config.cjs` holds the final contract address and Sepolia network configuration. `src/js/index.jsx` renders the React UI. `src/js/casino-client.cjs` reads state, validates input and submits bets. `src/js/casino-abi.cjs` defines the frontend ABI.

A transaction hash is shown as pending before a receipt is available. Success is reported only after a successful receipt. The frontend checks the current network, account, minimum stake, repeated-player status and round capacity before sending.

## Solidity source and compilation

The files are `casino.sol` and `contracts/oraclizeAPI_0.4.sol`. Keep this relationship so the local import resolves.

The final deployed Casino was compiled with Solidity 0.4.22 and optimization disabled. Its runtime bytecode was 18,018 bytes and matched the compiled source exactly. Constructor values were 100000000000000000 wei and 100 bets; deployment Value was zero. The contract is already deployed, so these values document the existing deployment.

The revision records all participants, clears player mappings and number lists after settlement, carries a pool with no winners into the following round, and accounts for integer division remainders. It checks the callback sender, query ID and pending-round state. `fundOracle` lets the owner supply a separate query reserve.

The contract requests random data after the 100th bet. This revision has not yet completed a live 100-bet Sepolia round, real oracle proof/callback or payout. The API's Sepolia resolver branch alone does not establish live oracle availability or fees.

## Checks and their scope

```sh
npm test
```

Ten prepared mocked-provider tests passed for frontend state decoding, network rejection, contract existence, exact wei conversion, invalid input, repeat/full-round checks, account changes, transaction fields and receipt status. DOM checks also covered rendered connection and error behavior.

A separate Solidity 0.4.22/Ganache test harness passed seven scenarios: settlement and repeated rounds; a pool with no winners carried forward; simulated query fees with and without an oracle reserve; failed-query rollback and callback checks; equal winner shares with a one-wei remainder; and a complete local 100-account round. Its 2,109,275-gas settlement measurement excludes real oracle proof verification.

The student also confirmed winner payout/reset, a following-round bet and a no-winner 0.2 ETH carryover using CasinoLocalCheckFixed in Remix VM. Manual draw functions and the simulated oracle belong to that local harness, not the deployed Casino. Local checks are separate from the real final Sepolia bet and public-page evidence.

## Publish on IPFS

The final public website is https://2603e5ea.pinit.eth.limo . The published bundle contains the final address and does not contain either previous Casino address.

After future frontend changes, rebuild and upload the complete dist directory:

```sh
npm run build
npx pinme upload ./dist
```

Publish index.html, build.js and its license file together. Do not upload node_modules or an earlier frontend folder. Record and test the URL returned by each new upload.

The website uses a gateway-provided PinMe subdomain. An owned custom domain has not been configured. For DNSLink, a controlled domain would use a TXT record at `_dnslink.<domain>` containing `dnslink=/ipfs/<CID>` (or an IPNS target), with a compatible gateway and HTTPS. This is a learning procedure, not a claimed completed deployment.

## Submission

Use the same GitHub repository for the course, include its link in the report, and verify instructor and TA collaborator access using their actual usernames. Submit the report to Univ.AI LMS by the beginning of the next class, using the LMS clock.

The report must use the supplied cover, US Letter pages, the student's name/date/email and a truthful signed statement of independent effort. Include all Part I answers and the final Part II deployment, transaction and public-page evidence. Do not describe a live oracle draw or owned custom domain as completed.

The cover's declaration/signature fields require the student's own completion. The report acknowledges ChatGPT assistance.

## Sources and attribution

See the teacher's Assignment / Lab 2, supplement and lecture slides. The contract is adapted from https://github.com/merlox/casino-ethereum . The local API is from https://github.com/provable-things/ethereum-api/blob/master/old-contracts/previous-api-contracts/oraclizeAPI_0.4.sol . Preserve THIRD_PARTY_NOTICES.md and the API's license notices.
