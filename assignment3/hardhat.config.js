// Hardhat is used only as a local EVM node. scripts/compile.mjs uses the
// explicitly pinned solc-js packages instead of Hardhat's compiler downloader.
export default {
  networks: {
    local: {
      type: "edr-simulated",
      chainType: "l1",
      chainId: 31337,
      hardfork: "shanghai",
      mining: { auto: true },
      initialBaseFeePerGas: 1000000000
    }
  }
};
