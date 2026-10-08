# Ethereum course — Assignment / Lab 2

Casino DApp for SWUFE / GEC Academy's Introduction to Ethereum and Cloud Blockchain Solutions Engineering.

The frontend follows the assignment supplement's **React → Babel → webpack → dist/build.js → http-server ./dist** workflow. The tutorial's old wallet API is adapted to MetaMask's `window.ethereum` API and Web3.js 4. All frontend dependencies are bundled locally; no CDN is needed by the published webpage.

## Run on a Mac

Requires Node.js 22 or later and Edge with MetaMask. In the repository folder:

```sh
npm ci
npm run build
npm start
```

Open http://127.0.0.1:8080. Select **Sepolia Test Network** in MetaMask and click **Connect MetaMask**. Confirm that the five displayed values load. In particular, the assignment describes **100 bets**, so `Max amount of bets` should show `100`.

If an older server already occupies port 8080, stop it in its terminal with **Control+C**, then run `npm start` again.

The equivalent explicit build and server commands from the supplement are:

```sh
npx webpack --config webpack.config.js
npx http-server ./dist -a 127.0.0.1 -p 8080 -c-1
```

## Contract and wallet connection

`src/js/config.cjs` contains the existing Casino address:

`0xc9D1Be30FF054a67B3C68974F37401929Aff2D51`

This is a Sepolia contract, not a mainnet contract or the student's wallet. The webpage reads `minimumBet`, `totalBet`, `numberOfBets`, `maxAmountOfBets`, `numberWinner`, and the account's existing-player status from the same block, then refreshes every seven seconds.

To bet, select a number from 1 to 10, enter at least the displayed minimum in Sepolia ETH, and click **Place Bet**. The wallet must confirm the transaction. A transaction hash is linked to Sepolia Etherscan. A submitted hash is shown as pending; success is reported only after a successful receipt.

The tutorial contract rejects an account that already has a recorded bet. The frontend checks this before asking MetaMask to send. Changing accounts or networks clears the previous session's displayed state. The frontend refuses to send from mainnet.

## Compile the tutorial contract in Remix

The repository includes both files requested by the supplement:

- `casino.sol`
- `contracts/oraclizeAPI_0.4.sol` (the downloaded Solidity 0.4-compatible Provable/Oraclize API)

Keep their folder relationship so the local import resolves. In Remix, select **Solidity 0.4.22**, compile `casino.sol`, and select **Casino** in the deployment dropdown. This source was compiled with 0.4.22 in the preparation environment: **0 errors**. Warnings arise from the old Solidity syntax and library.

If a new deployment is needed, use MetaMask on **Sepolia**, set `_minimumBet` to `100000000000000000` wei (0.1 ETH), and set `_maxAmountOfBets` to **100**. Do not use the zero/default threshold, which defaults to 10 in the tutorial source. Record the new address and deployment transaction, then update `src/js/config.cjs` and rebuild. Changing a constructor argument in the source cannot change an already deployed contract.

The contract source is adapted from the teacher's linked tutorial; its core betting/oracle/payout logic is retained. The import is vendored as a local file as the supplement requests. The retrieved API includes a Sepolia resolver branch; that does not establish that a real randomness query/callback succeeded for this deployment.

## Publish on IPFS

Run `npm run build` first. Upload **the contents of `dist/` together**, including `index.html`, `build.js`, and `build.js.LICENSE.txt`. `index.html` must be at the website root and its `./build.js` path must remain valid. Do not upload the repository root, `node_modules`, or an older `ipfs-site` folder containing the previous plain-JavaScript frontend.

For the already authenticated PinMe CLI used in this project:

```sh
npx pinme upload ./dist
```

Record the URL returned by that new upload and test it in Edge. The previous PinMe URL points to the previous published frontend until it is replaced or a new upload is performed. Capture a genuine screenshot including the **public URL**, the connected wallet and the contract statistics. Local automated testing is not public deployment evidence.

## Custom domain with IPFS

The assignment includes learning to connect a custom domain to IPFS. A gateway-assigned PinMe subdomain is not proof that a personally controlled custom domain was configured.

With control of a domain's DNS, a typical DNSLink setup publishes a TXT record at `_dnslink.<domain>` containing `dnslink=/ipfs/<CID>`, then routes the website host to an IPFS gateway that supports custom hostnames and HTTPS. An IPNS target can instead be used to keep a stable name as the content changes. Use the actual CID from the final React upload, not the CID of the earlier HTML/JavaScript site. Buying a paid domain is not stated as a separate assignment requirement. See https://docs.ipfs.tech/how-to/websites-on-ipfs/custom-domains/ .

No personally controlled custom domain is currently configured; do not claim this step has been demonstrated.

## Verification and remaining evidence

```sh
npm test
```

Ten tests cover ABI state decoding at a common block, mainnet rejection, missing contract code, exact wei conversion, invalid input, repeat-player and full-round checks, wallet account changes, transaction fields and receipt status. They use **mocked provider responses**, not real Sepolia transactions. The compiled React bundle also passed DOM integration checks for first connection, displayed state, duplicate-player rejection, input validation, network changes and rejected wallet permission. These checks do not replace a real wallet test.

The previously recorded Sepolia bet transaction was successful:

https://sepolia.etherscan.io/tx/0x7f976cc61d72de4ae8036d6faceb6fefe97f74aded1c215a8054e6179d8aec29

That transaction and the existing screenshots came from the **earlier frontend**. A successful bet from the new React frontend and its public IPFS URL still need to be recorded. A second funded test account is needed if the first account is already recorded. A full 100-bet round, a real oracle callback and prize distribution have **not** been demonstrated. The assignment describes the threshold; it does not separately instruct the student to manually fund 100 accounts or attach 100 receipts.

Known limitations retained from the tutorial include a player mapping not cleared after distribution and an unhandled zero-winner case. A full game audit is not claimed, and the recovered source has not been verified against the existing deployment's bytecode.

## Submit

- Push the programming source to this same course repository and include its URL in the report.
- Add the instructor and TA as repository collaborators using their actual GitHub usernames; these usernames are still needed.
- Submit the report to **Univ.AI LMS** by the beginning of the next class, using the LMS clock as official.
- Use the teacher's supplied cover as the first page; fill name as **Zhu, Xuanze**, date and email **3463866996@qq.com**.
- Include the student's own truthful, signed statement of independent effort.
- Use **US Letter (8.5 × 11 inches)**, with cover followed by answers.
- Include every Part I question and subquestion and the actual Part II implementation/testing/deployment evidence. Do not label pending steps complete.
- `node_modules/` is ignored. Commit source, configuration, lockfile, the static `dist/index.html` and the downloaded API. `dist/build.js` is reproducible with `npm ci` and `npm run build`; publish it on IPFS with its license file.

The earlier report must be revised after the React test and upload; it is not the final report for this implementation.

## Sources

- Teacher-provided Assignment / Lab #2, Assignment 2 supplement, and lecture slides.
- Casino tutorial: https://github.com/merlox/casino-ethereum
- Provable API: https://github.com/provable-things/ethereum-api/blob/master/old-contracts/previous-api-contracts/oraclizeAPI_0.4.sol
- React: https://react.dev/reference/react-dom/client/createRoot
- webpack: https://webpack.js.org/guides/getting-started/
- Babel: https://babel.dev/docs/babel-preset-react
- MetaMask provider: https://docs.metamask.io/metamask-connect/evm/reference/provider-api/

See `THIRD_PARTY_NOTICES.md` and the API source for preserved copyright/license notices.
