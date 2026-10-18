import assert from "node:assert/strict";
import { ContractFactory, Interface, getBytes, keccak256, toBeHex } from "ethers";

export const STORAGE_WORDS = Array.from({ length: 32 }, (_, index) =>
  `0x${(index + 1).toString(16).padStart(2, "0")}${"00".repeat(31)}`);
export const EXPECTED_GREETING = "Hello, world!";

function receiptEvidence(receipt) {
  assert.equal(receipt.status, 1, "The transaction must have succeeded.");
  return {
    hash: receipt.hash,
    blockNumber: receipt.blockNumber,
    status: receipt.status,
    gasUsed: receipt.gasUsed.toString(),
    gasPriceWei: receipt.gasPrice.toString(),
    feeWei: receipt.fee.toString()
  };
}

async function deploy(signer, artifact) {
  const factory = new ContractFactory(artifact.abi, artifact.bytecode, signer);
  const contract = await factory.deploy();
  const receipt = await contract.deploymentTransaction().wait();
  const address = await contract.getAddress();
  return { contract, address, receipt, evidence: receiptEvidence(receipt) };
}

export async function storageExperiment(provider, artifact) {
  const signer = await provider.getSigner(0);
  const { contract, address, receipt: deploymentReceipt, evidence: deployment } = await deploy(signer, artifact);
  const initialLength = await provider.getStorage(address, 0, deploymentReceipt.blockNumber);
  assert.equal(BigInt(initialLength), 0n, "A new dynamic array must be empty.");
  assert.equal(STORAGE_WORDS.length, 32);
  assert.equal(STORAGE_WORDS.reduce((sum, word) => sum + getBytes(word).length, 0), 1024);
  const transaction = await contract.put(STORAGE_WORDS);
  const receipt = await transaction.wait();
  const lengthWord = await provider.getStorage(address, 0, receipt.blockNumber);
  assert.equal(BigInt(lengthWord), 32n, "Slot zero must contain the array length 32.");
  const baseSlot = BigInt(keccak256(toBeHex(0, 32)));
  const slots = [];
  for (let index = 0; index < STORAGE_WORDS.length; index++) {
    const slot = baseSlot + BigInt(index);
    const actual = await provider.getStorage(address, slot, receipt.blockNumber);
    assert.equal(actual.toLowerCase(), STORAGE_WORDS[index], `Array element ${index} does not match.`);
    slots.push({ index, slot: toBeHex(slot, 32), expected: STORAGE_WORDS[index], actual, verified: true });
  }
  return {
    source: artifact.sourceName,
    compilerVersion: artifact.compiler.version,
    settings: artifact.settings,
    contractAddress: address,
    deployment,
    putTransaction: receiptEvidence(receipt),
    measurement: "Only the first put() on a newly deployed empty contract; deployment gas is separate.",
    input: { itemCount: 32, bytesPerItem: 32, totalBytes: 1024, words: STORAGE_WORDS,
      calldata: transaction.data, calldataBytes: getBytes(transaction.data).length },
    storage: { initialLength: "0", lengthSlot: "0x00", storedLength: BigInt(lengthWord).toString(),
      arrayBaseSlot: toBeHex(baseSlot, 32), verifiedDataSlots: slots.length, slots },
    assertions: { firstWriteFromEmptyArray: true, bytesWritten: 1024,
      lengthVerified: true, all32DataSlotsVerified: true }
  };
}

export async function helloExperiment(provider, artifact) {
  const signer = await provider.getSigner(0);
  const { contract, address, evidence: deployment } = await deploy(signer, artifact);
  const iface = new Interface(artifact.abi);
  const calldata = iface.encodeFunctionData("hello");
  const returnData = await provider.call({ to: address, data: calldata });
  const result = iface.decodeFunctionResult("hello", returnData)[0];
  assert.equal(result, EXPECTED_GREETING);
  assert.equal(await contract.hello(), EXPECTED_GREETING);
  // A pure function defaults to eth_call in ethers. Send explicitly through the
  // signer so this second interaction is a mined, gas-consuming transaction.
  const transaction = await signer.sendTransaction({ to: address, data: calldata });
  const receipt = await transaction.wait();
  assert(receipt.gasUsed > 0n);
  const mined = await provider.getTransaction(receipt.hash);
  assert.equal(mined.to.toLowerCase(), address.toLowerCase());
  assert.equal(mined.data, calldata);
  return {
    source: artifact.sourceName,
    compilerVersion: artifact.compiler.version,
    settings: artifact.settings,
    contractAddress: address,
    deployment,
    calldata,
    readCall: { method: "eth_call", result, returnData,
      createsBlockchainTransaction: false },
    sendTransaction: { ...receiptEvidence(receipt),
      createsBlockchainTransaction: true, calldata: mined.data,
      returnValueInReceipt: false },
    assertions: { exactGreetingReturned: true, actualTransactionMined: true,
      successfulTransactionUsedGas: true }
  };
}
