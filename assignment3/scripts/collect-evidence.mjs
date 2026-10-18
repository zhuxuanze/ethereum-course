import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Interface } from "ethers";
import { ROOT, compileContracts } from "./compile.mjs";
import { startLocalNode } from "./local-node.mjs";
import { EXPECTED_GREETING, STORAGE_WORDS, helloExperiment, storageExperiment } from "./experiments.mjs";

const { manifest, artifacts } = await compileContracts();
const node = await startLocalNode();
try {
  const environment = {
    kind: "local-only",
    network: "Fresh in-process EDR chain exposed by a spawned Hardhat JSON-RPC node",
    chainId: 31337,
    hardfork: "shanghai",
    hardhatVersion: node.hardhatVersion,
    clientVersion: node.clientVersion,
    nodeVersion: process.version,
    accountSource: "Disposable unlocked local development accounts; no external wallet or private key is used.",
    notes: [
      "These are local transactions, not Remix VM or Sepolia transactions.",
      "Compiler EVM targets and the executing chain hardfork are recorded separately.",
      "Gas-price and fee fields are local test values, not USD costs or live mainnet prices.",
      "No reentrancy exploit is implemented or executed by these functional experiments."
    ]
  };
  const storage = await storageExperiment(node.provider, artifacts.StorageTest);
  const hello = await helloExperiment(node.provider, artifacts.HelloWorld);
  const results = { schemaVersion: 1, generatedAt: new Date().toISOString(), environment,
    compilation: manifest, storage, hello };
  const evidenceDirectory = path.join(ROOT, "evidence");
  await mkdir(evidenceDirectory, { recursive: true });
  await writeFile(path.join(evidenceDirectory, "local-results.json"), `${JSON.stringify(results, null, 2)}\n`);
  await writeFile(path.join(evidenceDirectory, "storage-input.json"), `${JSON.stringify(STORAGE_WORDS, null, 2)}\n`);
  const iface = new Interface(artifacts.HelloWorld.abi);
  await writeFile(path.join(evidenceDirectory, "hello-calldata.txt"), `${iface.encodeFunctionData("hello")}\n`);
  console.log(`Storage first put(): ${storage.putTransaction.gasUsed} gas; 32 data slots and the length slot verified.`);
  console.log(`Hello eth_call: ${EXPECTED_GREETING}; real local transaction: ${hello.sendTransaction.gasUsed} gas.`);
  console.log(`Local-only evidence: ${path.join(evidenceDirectory, "local-results.json")}`);
} finally {
  await node.stop();
}
