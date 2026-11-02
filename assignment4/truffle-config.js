const ganache = require("ganache");
let testProvider;
module.exports = {
  networks: {
    development: { host: "127.0.0.1", port: 9545, network_id: "*" },
    test: {
      provider: () => testProvider || (testProvider = ganache.provider({
        logging: { quiet: true },
        wallet: { deterministic: true, totalAccounts: 10, defaultBalance: 1000 },
        chain: { networkId: 5777, chainId: 1337 },
      })),
      network_id: "*",
    },
  },
  compilers: {
    solc: {
      // The pinned npm package avoids a runtime compiler download.
      version: require.resolve("solc/soljson.js"),
      settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: "byzantium" },
    },
  },
  mocha: { timeout: 30000 },
};
