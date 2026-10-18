import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const ARTIFACTS = path.join(ROOT, "artifacts");

const versions = ["0.5.17", "0.4.24"];
const compilerPackages = Object.fromEntries(versions.map((version) => [
  version, require(`solc-${version}`)
]));

export function compileStandardJson(version, input) {
  const compiler = compilerPackages[version];
  if (!compiler) throw new Error(`Unsupported compiler version: ${version}`);
  const jsonInput = JSON.stringify(input);
  return JSON.parse(version === "0.4.24"
    ? compiler.compileStandardWrapper(jsonInput)
    : compiler.compile(jsonInput));
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

const outputSelection = {
  "*": {
    "*": ["abi", "metadata", "evm.bytecode", "evm.deployedBytecode"],
    "": ["ast"]
  }
};

export const BUILD_PROFILES = [
  { name: "StorageTest", version: "0.5.17", files: ["contracts/StorageTest.sol"],
    optimizer: { enabled: false, runs: 200 }, evmVersion: "istanbul" },
  { name: "HelloWorld", version: "0.5.17", files: ["contracts/HelloWorld.sol"],
    optimizer: { enabled: true, runs: 200 }, evmVersion: "istanbul" }
];

async function legacyFiles() {
  const directory = path.join(ROOT, "contracts", "legacy");
  try {
    return (await readdir(directory)).filter((name) => name.endsWith(".sol"))
      .sort().map((name) => `contracts/legacy/${name}`);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

export async function compileContracts() {
  await mkdir(ARTIFACTS, { recursive: true });
  const compilerVersions = Object.fromEntries(versions.map((version) => [
    version, compilerPackages[version].version()
  ]));
  const profiles = [...BUILD_PROFILES];
  const legacy = await legacyFiles();
  if (legacy.length) {
    profiles.push({ name: "Legacy", version: "0.4.24", files: legacy,
      optimizer: { enabled: false, runs: 200 }, evmVersion: "byzantium" });
  }
  const manifest = {
    schemaVersion: 1,
    compilerVersions,
    compilationMethod: "Independent solc-js standard JSON; Hardhat does not compile contracts.",
    legacyProfile: {
      version: "0.4.24", sourceDirectory: "contracts/legacy", sourceFiles: legacy,
      status: legacy.length ? "compiled" : "available; no legacy source supplied",
      settings: { optimizer: { enabled: false, runs: 200 }, evmVersion: "byzantium" }
    },
    builds: []
  };
  const artifacts = {};
  for (const profile of profiles) {
    const sources = {};
    for (const filename of profile.files) {
      sources[filename] = { content: await readFile(path.join(ROOT, filename), "utf8") };
    }
    const input = {
      language: "Solidity", sources,
      settings: {
        optimizer: profile.optimizer,
        evmVersion: profile.evmVersion,
        outputSelection
      }
    };
    const output = compileStandardJson(profile.version, input);
    const errors = (output.errors ?? []).filter((error) => error.severity === "error");
    if (errors.length) throw new Error(errors.map((error) => error.formattedMessage).join("\n"));
    const buildDirectory = path.join(ARTIFACTS, "builds", profile.name);
    await mkdir(buildDirectory, { recursive: true });
    await writeFile(path.join(buildDirectory, "input.json"), `${JSON.stringify(input, null, 2)}\n`);
    await writeFile(path.join(buildDirectory, "output.json"), `${JSON.stringify(output, null, 2)}\n`);
    const build = {
      name: profile.name,
      compilerPackage: `solc-${profile.version}`,
      compilerVersion: compilerVersions[profile.version],
      settings: input.settings,
      sources: Object.fromEntries(Object.entries(sources).map(([name, value]) => [
        name, { sha256: sha256(value.content) }
      ])),
      inputFile: `artifacts/builds/${profile.name}/input.json`,
      outputFile: `artifacts/builds/${profile.name}/output.json`,
      warnings: (output.errors ?? []).filter((error) => error.severity !== "error")
        .map((error) => error.formattedMessage),
      contracts: []
    };
    for (const [sourceName, contracts] of Object.entries(output.contracts ?? {})) {
      for (const [contractName, contract] of Object.entries(contracts)) {
        if (artifacts[contractName]) throw new Error(`Duplicate contract name: ${contractName}`);
        const artifact = {
          contractName, sourceName,
          compiler: { package: `solc-${profile.version}`, version: compilerVersions[profile.version] },
          settings: input.settings,
          abi: contract.abi,
          bytecode: `0x${contract.evm.bytecode.object}`,
          deployedBytecode: `0x${contract.evm.deployedBytecode.object}`,
          metadata: contract.metadata,
          sourceSha256: sha256(sources[sourceName].content)
        };
        const directory = path.join(ARTIFACTS, contractName);
        await mkdir(directory, { recursive: true });
        await writeFile(path.join(directory, "artifact.json"), `${JSON.stringify(artifact, null, 2)}\n`);
        await writeFile(path.join(directory, "abi.json"), `${JSON.stringify(artifact.abi, null, 2)}\n`);
        await writeFile(path.join(directory, "creation.bin"), `${contract.evm.bytecode.object}\n`);
        await writeFile(path.join(directory, "runtime.bin"), `${contract.evm.deployedBytecode.object}\n`);
        build.contracts.push({ name: contractName, artifactFile: `artifacts/${contractName}/artifact.json` });
        artifacts[contractName] = artifact;
      }
    }
    manifest.builds.push(build);
  }
  await writeFile(path.join(ARTIFACTS, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return { manifest, artifacts };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { manifest } = await compileContracts();
  for (const build of manifest.builds) {
    console.log(`${build.name}: ${build.compilerVersion}; optimizer=${build.settings.optimizer.enabled}; EVM target=${build.settings.evmVersion}`);
  }
  console.log(`Artifacts written under ${ARTIFACTS}`);
}
