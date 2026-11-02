"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { Web3 } = require("web3");
const { HttpsProxyAgent } = require("https-proxy-agent");

async function findFirstCreation({ getBlock, start = 0, end, concurrency = 4,
  retries = 3, retryDelayMs = 250, onProgress = () => {} }) {
  for (const [name, value] of Object.entries({ start, end, concurrency, retries })) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Invalid ${name}`);
  }
  if (end < start || concurrency < 1 || concurrency > 100) throw new Error("Invalid scan range or concurrency");
  let fetched = 0;
  async function fetchBlock(number) {
    for (let attempt = 0; ; attempt++) {
      try {
        const block = await getBlock(number);
        if (!block) throw new Error(`Block ${number} unavailable`);
        if (Number(block.number) !== number || !Array.isArray(block.transactions)) {
          throw new Error(`Malformed block ${number}`);
        }
        return block;
      } catch (error) {
        if (attempt >= retries) throw new Error(`Cannot verify block ${number}; scan aborted`, { cause: error });
        await new Promise(resolve => setTimeout(resolve, retryDelayMs * 2 ** attempt));
      }
    }
  }
  for (let base = start; base <= end; base += concurrency) {
    const numbers = Array.from({ length: Math.min(concurrency, end - base + 1) }, (_, i) => base + i);
    // Promise.all retains input order, so faster later blocks cannot win the race.
    const blocks = await Promise.all(numbers.map(fetchBlock));
    fetched += blocks.length;
    for (const block of blocks) {
      for (let index = 0; index < block.transactions.length; index++) {
        const tx = block.transactions[index];
        if (!tx || typeof tx !== "object" || !Object.hasOwn(tx, "to") || tx.to === undefined) {
          throw new Error(`Block ${block.number} must include full transactions with a to field`);
        }
        if (tx.to === null) {
          return {
            blockNumber: Number(block.number), blockHash: block.hash,
            transactionIndex: Number(tx.transactionIndex ?? index),
            transactionHash: tx.hash, from: tx.from,
            criterion: "transaction.to === null (creation attempt; success is not required)",
            verifiedFromBlock: start,
            verifiedThroughBlock: Number(block.number),
            globallyEarliest: start === 0,
            blocksFetched: fetched,
          };
        }
      }
    }
    onProgress(numbers[numbers.length - 1]);
  }
  return null;
}

// gasUsedRatio === 0 proves a block has no transactions: even a failed
// Ethereum transaction consumes intrinsic gas. Check EVERY ratio, not samples.
async function findFirstCreationWithHistory({ getHistory, getBlock, start = 0, end,
  batchSize = 1024, concurrency = 4, retries = 3, retryDelayMs = 250,
  onProgress = () => {}, onEvidence = () => {} }) {
  for (const [name, value] of Object.entries({ start, end, batchSize, concurrency, retries })) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Invalid ${name}`);
  }
  if (end < start || batchSize < 1 || batchSize > 1024 || concurrency < 1 || concurrency > 100) {
    throw new Error("Invalid history scan parameters");
  }
  let historyRequests = 0, fullBlockRequests = 0, emptyBlocksVerified = 0;
  for (let base = start; base <= end; base += batchSize) {
    const count = Math.min(batchSize, end - base + 1);
    let history;
    for (let attempt = 0; ; attempt++) {
      try {
        historyRequests++;
        history = await getHistory(count, base + count - 1);
        if (!history || Number(history.oldestBlock) !== base ||
            !Array.isArray(history.gasUsedRatio) || history.gasUsedRatio.length !== count ||
            history.gasUsedRatio.some(x => typeof x !== "number" || !Number.isFinite(x) || x < 0 || x > 1)) {
          throw new Error("Incomplete or malformed fee history");
        }
        break;
      } catch (error) {
        if (attempt >= retries) throw new Error(`Cannot verify block range ${base}-${base + count - 1}; scan aborted`, { cause: error });
        await new Promise(resolve => setTimeout(resolve, retryDelayMs * 2 ** attempt));
      }
    }
    onEvidence({ method: "eth_feeHistory", start: base, count, response: history });
    const found = await findFirstCreation({ start: base, end: base + count - 1,
      concurrency, retries, retryDelayMs,
      getBlock: async number => {
        if (history.gasUsedRatio[number - base] === 0) {
          emptyBlocksVerified++;
          return { number, transactions: [] };
        }
        fullBlockRequests++;
        const block = await getBlock(number);
        if (!block || !Array.isArray(block.transactions) || !block.transactions.length) {
          throw new Error("Positive gas usage requires a nonempty block");
        }
        onEvidence({ method: "eth_getBlockByNumber", number, response: block });
        return block;
      },
    });
    if (found) return { ...found, verifiedFromBlock: start, globallyEarliest: start === 0,
      blocksFetched: fullBlockRequests, historyRequests, emptyBlocksVerified,
      verificationMethod: "Every block covered by fee-history ratios; all positive-gas blocks checked in transaction order" };
    onProgress(base + count - 1);
  }
  return null;
}

function createWeb3(rpcUrl) {
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
  return new Web3(new Web3.providers.HttpProvider(rpcUrl, { providerOptions: {
    agent: proxy ? new HttpsProxyAgent(proxy) : undefined, timeout: 30000,
  } }));
}

function loadLocalEnvironment() {
  const file = path.join(__dirname, "..", ".env");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*(INFURA_URL|ETH_RPC_URL)\s*=\s*(.*?)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^(["'])(.*)\1$/, "$2");
  }
}

async function main() {
  loadLocalEnvironment();
  const rpcUrl = process.env.INFURA_URL || process.env.ETH_RPC_URL;
  if (!rpcUrl || rpcUrl.includes("YOUR_API_KEY")) {
    throw new Error("Set INFURA_URL in a local .env file to your own Ethereum mainnet endpoint. No request was sent.");
  }
  const args = process.argv.slice(2);
  function option(name, fallback) {
    const index = args.indexOf(name);
    return index < 0 ? fallback : args[index + 1];
  }
  const mode = option("--mode", "history");
  if (!["history", "full"].includes(mode)) throw new Error("Invalid scan mode");
  const web3 = createWeb3(rpcUrl);
  const chainId = await web3.eth.getChainId();
  if (chainId !== 1n) throw new Error("This task requires Ethereum mainnet (chain ID 1)");
  const latest = Number(await web3.eth.getBlockNumber());
  const start = Number(option("--start", 0));
  const end = Number(option("--end", latest));
  if (end > latest) throw new Error("End block exceeds current chain height");
  const output = option("--out", null);
  const proofFile = output ? output.replace(/\.json$/, "") + "-proof.ndjson" : null;
  if (proofFile) fs.writeFileSync(proofFile, "");
  const json = value => JSON.stringify(value, (_, x) => typeof x === "bigint" ? String(x) : x);
  const scanner = mode === "history" ? findFirstCreationWithHistory : findFirstCreation;
  const result = await scanner({
    getBlock: number => web3.eth.getBlock(number, true),
    getHistory: (count, last) => web3.eth.getFeeHistory(count, last, []),
    start, end, concurrency: Number(option("--concurrency", 4)),
    retryDelayMs: 1000,
    onProgress: number => { if (mode === "history" || number % 1000 < 4) process.stderr.write(`Verified through block ${number}\n`); },
    onEvidence: item => { if (proofFile) fs.appendFileSync(proofFile, json(item) + "\n"); },
  });
  let receipt = null;
  if (result) {
    const raw = await web3.eth.getTransactionReceipt(result.transactionHash);
    receipt = { status: raw.status === undefined ? null : String(raw.status), contractAddress: raw.contractAddress ?? null };
  }
  const record = { observedAtUtc: new Date().toISOString(),
    providerHost: new URL(rpcUrl).hostname, chainId: String(chainId),
    start, end, latestBlockAtStart: latest, mode, result, receipt,
    proofFile: mode === "history" && proofFile ? path.basename(proofFile) : null };
  const text = JSON.stringify(record, null, 2) + "\n";
  if (output) fs.writeFileSync(output, text);
  process.stdout.write(text);
  if (!result) process.exitCode = 2;
}
if (require.main === module) main().catch(error => {
  // Provider exception strings can include an endpoint/API key. Never print them.
  const safe = error.message.startsWith("Set INFURA_URL") ||
    error.message.startsWith("This task requires") ||
    error.message.startsWith("Cannot verify block") ||
    error.message.startsWith("Invalid ") || error.message.startsWith("End block")
      ? error.message : "RPC scan failed. Check your local endpoint, quota and network; no credentials were logged.";
  process.stderr.write(safe + "\n");
  process.exitCode = 1;
});
module.exports = { findFirstCreation, findFirstCreationWithHistory, createWeb3 };
