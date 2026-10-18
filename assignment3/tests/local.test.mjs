import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { Interface, getBytes } from "ethers";
import { compileContracts, compileStandardJson } from "../scripts/compile.mjs";
import { startLocalNode } from "../scripts/local-node.mjs";
import { EXPECTED_GREETING, STORAGE_WORDS, helloExperiment, storageExperiment } from "../scripts/experiments.mjs";

let compilation;
let node;
before(async () => {
  compilation = await compileContracts();
  node = await startLocalNode();
}, { timeout: 60000 });
after(async () => { await node?.stop(); });

test("the requested compiler and optimization profiles produce ABI, creation and runtime bytecode", () => {
  const { manifest, artifacts } = compilation;
  assert.match(manifest.compilerVersions["0.5.17"], /^0\.5\.17\+/);
  assert.match(manifest.compilerVersions["0.4.24"], /^0\.4\.24\+/);
  assert.equal(artifacts.StorageTest.settings.optimizer.enabled, false);
  assert.deepEqual(artifacts.HelloWorld.settings.optimizer, { enabled: true, runs: 200 });
  for (const artifact of [artifacts.StorageTest, artifacts.HelloWorld]) {
    assert.equal(artifact.settings.evmVersion, "istanbul");
    assert(getBytes(artifact.bytecode).length > 0);
    assert(getBytes(artifact.deployedBytecode).length > 0);
    assert.notEqual(artifact.bytecode, artifact.deployedBytecode);
    assert(artifact.abi.length > 0);
  }
  const greeting = artifacts.HelloWorld.abi.find((item) => item.type === "function" && item.name === "hello");
  assert.equal(greeting.stateMutability, "pure");
  assert.equal(greeting.outputs[0].type, "string");
});

test("the supplied fixture is exactly 1 KiB with first bytes 0x01 through 0x20", () => {
  assert.equal(STORAGE_WORDS.length, 32);
  for (let index = 0; index < STORAGE_WORDS.length; index++) {
    const bytes = getBytes(STORAGE_WORDS[index]);
    assert.equal(bytes.length, 32);
    assert.equal(bytes[0], index + 1);
    assert(bytes.slice(1).every((value) => value === 0));
  }
});

test("the independent 0.4.24 compiler accepts standard JSON without Hardhat compilation", () => {
  const output = compileStandardJson("0.4.24", {
    language: "Solidity",
    sources: { "LegacyCompilerProbe.sol": {
      content: "pragma solidity ^0.4.24; contract LegacyCompilerProbe { function value() public pure returns (uint256) { return 24; } }"
    } },
    settings: { optimizer: { enabled: false, runs: 200 }, evmVersion: "byzantium",
      outputSelection: { "*": { "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"] } } }
  });
  assert.deepEqual((output.errors ?? []).filter((error) => error.severity === "error"), []);
  const probe = output.contracts["LegacyCompilerProbe.sol"].LegacyCompilerProbe;
  assert(probe.evm.bytecode.object.length > 0);
  assert(probe.evm.deployedBytecode.object.length > 0);
  assert.equal(probe.abi[0].name, "value");
});

test("first put() on a fresh contract writes all 32 words and the dynamic-array length", async () => {
  const result = await storageExperiment(node.provider, compilation.artifacts.StorageTest);
  assert.equal(result.storage.storedLength, "32");
  assert.equal(result.storage.verifiedDataSlots, 32);
  assert.equal(result.putTransaction.status, 1);
  assert(BigInt(result.putTransaction.gasUsed) > 640000n);
});

test("Hello World returns the exact string and accepts a real, mined transaction", async () => {
  const result = await helloExperiment(node.provider, compilation.artifacts.HelloWorld);
  assert.equal(result.readCall.result, EXPECTED_GREETING);
  assert.equal(result.readCall.createsBlockchainTransaction, false);
  assert.equal(result.sendTransaction.createsBlockchainTransaction, true);
  assert.equal(result.sendTransaction.status, 1);
  assert(BigInt(result.sendTransaction.gasUsed) > 0n);
  assert.equal(result.calldata, new Interface(compilation.artifacts.HelloWorld.abi).encodeFunctionData("hello"));
});
