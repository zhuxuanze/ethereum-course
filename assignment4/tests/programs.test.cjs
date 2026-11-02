"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { findFirstCreation, findFirstCreationWithHistory } = require("../scripts/first-contract.cjs");
const { oracleBudget } = require("../scripts/oracle-budget.cjs");
const creation = index => ({ to: null, hash: `fixture-${index}`, from: "fixture-sender", transactionIndex: index });
const block = (n, txs = []) => ({ number: BigInt(n), hash: `fixture-block-${n}`, transactions: txs });

test("parallel scan returns earliest block, not earliest response, and first transaction within it", async () => {
  const result = await findFirstCreation({ start: 0, end: 8, concurrency: 4, getBlock: async n => {
    if (n === 2) await new Promise(r => setTimeout(r, 20));
    return block(n, n === 2 ? [creation(0), creation(1)] : n === 3 ? [creation(0)] : []);
  } });
  assert.equal(result.blockNumber, 2);
  assert.equal(result.transactionIndex, 0);
  assert.equal(result.globallyEarliest, true);
});
test("literal zero address is not the null recipient", async () => {
  const result = await findFirstCreation({ end: 1, getBlock: async n => block(n, [{ to: "0x0000000000000000000000000000000000000000" }]) });
  assert.equal(result, null);
});
test("missing to field is a provider-data error, not evidence of contract creation", async () => {
  await assert.rejects(findFirstCreation({ end: 0, getBlock: async n => block(n, [{}]) }), /full transactions/);
});
test("a transient missing block is retried rather than skipped", async () => {
  let count = 0;
  const result = await findFirstCreation({ end: 0, retryDelayMs: 0, getBlock: async n => ++count === 1 ? null : block(n, [creation(0)]) });
  assert.equal(result.blockNumber, 0);
  assert.equal(count, 2);
});
test("a persistent gap aborts even when a later block has a creation", async () => {
  await assert.rejects(findFirstCreation({ end: 2, retries: 1, retryDelayMs: 0, getBlock: async n => n === 1 ? null : block(n, n === 2 ? [creation(0)] : []) }), /Cannot verify block 1/);
});
test("a nonzero scan start never claims a globally earliest result", async () => {
  const result = await findFirstCreation({ start: 5, end: 5, getBlock: async n => block(n, [creation(0)]) });
  assert.equal(result.globallyEarliest, false);
});
test("invalid scan parameters fail before any RPC request", async () => {
  await assert.rejects(findFirstCreation({ end: 2, concurrency: 0, getBlock: () => assert.fail() }), /Invalid/);
});
test("history scan proves the entire prefix and fetches only positive-gas blocks", async () => {
  const fetched = [], histories = [];
  const result = await findFirstCreationWithHistory({ end: 7, batchSize: 3,
    getHistory: async (count, last) => {
      histories.push(last);
      const first = last - count + 1;
      return { oldestBlock: first, gasUsedRatio: Array.from({ length: count }, (_, i) => [1, 4, 5].includes(first + i) ? 0.2 : 0) };
    },
    getBlock: async n => { fetched.push(n); return block(n, n >= 4 ? [creation(0)] : [{ to: "recipient" }]); },
  });
  assert.equal(result.blockNumber, 4);
  assert.equal(result.globallyEarliest, true);
  assert.equal(result.verifiedFromBlock, 0);
  assert.equal(result.verifiedThroughBlock, 4);
  assert.deepEqual(histories, [2, 5]);
  assert.deepEqual(fetched, [1, 4, 5]);
  assert.equal(result.blocksFetched, 3);
});
test("history scan rejects missing prefix, truncated ranges and malformed ratios", async () => {
  for (const history of [
    { oldestBlock: 1, gasUsedRatio: [0, 0] },
    { oldestBlock: 0, gasUsedRatio: [0] },
    { oldestBlock: 0, gasUsedRatio: [0, NaN] },
    { oldestBlock: 0, gasUsedRatio: [0, "0"] },
  ]) await assert.rejects(findFirstCreationWithHistory({ end: 1, retries: 0,
    getHistory: async () => history, getBlock: () => assert.fail() }), /Cannot verify block range/);
});
test("history scan never skips an unreadable nonempty block", async () => {
  await assert.rejects(findFirstCreationWithHistory({ end: 1, retries: 0,
    getHistory: async () => ({ oldestBlock: 0, gasUsedRatio: [0.1, 0.1] }),
    getBlock: async n => n === 0 ? null : block(n, [creation(0)]) }), /Cannot verify block 0/);
});
test("history scan with a nonzero start does not claim a global minimum", async () => {
  const result = await findFirstCreationWithHistory({ start: 8, end: 8,
    getHistory: async () => ({ oldestBlock: 8, gasUsedRatio: [0.1] }),
    getBlock: async n => block(n, [creation(0)]) });
  assert.equal(result.globallyEarliest, false);
});
test("oracle budget uses ceiling so the estimated daily cost stays within budget", () => {
  const result = oracleBudget({ averageFeeUsd: 0.27, averageBlockSeconds: 12 });
  assert.equal(result.affordableUpdates, 37);
  assert.equal(result.blockInterval, 195);
  assert.ok(result.expectedDailyCostUsd <= 10);
});
test("oracle calculator handles too costly and sub-block update scenarios", () => {
  assert.equal(oracleBudget({ averageFeeUsd: 11, averageBlockSeconds: 12 }).blockInterval, null);
  assert.equal(oracleBudget({ averageFeeUsd: 0.0001, averageBlockSeconds: 12 }).blockInterval, 1);
  assert.throws(() => oracleBudget({ averageFeeUsd: NaN, averageBlockSeconds: 12 }));
});
