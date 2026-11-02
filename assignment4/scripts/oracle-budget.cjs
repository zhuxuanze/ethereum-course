"use strict";
function oracleBudget({ averageFeeUsd, averageBlockSeconds, budgetUsd = 10 }) {
  for (const n of [averageFeeUsd, averageBlockSeconds, budgetUsd]) {
    if (!Number.isFinite(n) || n <= 0) throw new Error("All inputs must be finite and positive");
  }
  const blocksPerDay = 86400 / averageBlockSeconds;
  const affordableUpdates = Math.floor(budgetUsd / averageFeeUsd);
  const blockInterval = affordableUpdates === 0 ? null : Math.max(1, Math.ceil(blocksPerDay / affordableUpdates));
  return { averageFeeUsd, averageBlockSeconds, budgetUsd, blocksPerDay,
    affordableUpdates, blockInterval,
    estimatedIntervalSeconds: blockInterval === null ? null : blockInterval * averageBlockSeconds,
    expectedDailyCostUsd: blockInterval === null ? null : blocksPerDay / blockInterval * averageFeeUsd,
    caveat: "Average-fee and average-block-time estimate; real update gas usage and fees may differ." };
}
if (require.main === module) {
  try {
    const [fee, blockSeconds, budget = "10"] = process.argv.slice(2);
    console.log(JSON.stringify(oracleBudget({ averageFeeUsd: Number(fee), averageBlockSeconds: Number(blockSeconds), budgetUsd: Number(budget) }), null, 2));
  } catch (error) { console.error("Usage: npm run oracle -- <averageFeeUsd> <averageBlockSeconds> [budgetUsd]"); process.exitCode = 1; }
}
module.exports = { oracleBudget };
