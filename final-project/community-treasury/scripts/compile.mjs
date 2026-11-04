import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import solc from 'solc';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceFiles = ['contracts/CommunityTreasury.sol', 'contracts/test/ReceiverFixtures.sol'];
const sources = Object.fromEntries(sourceFiles.map(file => [file, { content: fs.readFileSync(path.join(ROOT, file), 'utf8') }]));
const settings = {
  optimizer: { enabled: true, runs: 200 },
  evmVersion: 'shanghai',
  outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object', 'metadata'] } }
};
const output = JSON.parse(solc.compile(JSON.stringify({ language: 'Solidity', sources, settings })));
for (const diagnostic of output.errors ?? []) {
  if (diagnostic.severity === 'error') console.error(diagnostic.formattedMessage);
}
if ((output.errors ?? []).some(error => error.severity === 'error')) process.exit(1);
fs.mkdirSync(path.join(ROOT, 'artifacts'), { recursive: true });
for (const [sourceName, contracts] of Object.entries(output.contracts ?? {})) {
  for (const [contractName, compiled] of Object.entries(contracts)) {
    const artifact = {
      contractName,
      sourceName,
      compiler: solc.version(),
      settings: { optimizer: settings.optimizer, evmVersion: settings.evmVersion },
      sourceSha256: createHash('sha256').update(sources[sourceName].content).digest('hex'),
      abi: compiled.abi,
      bytecode: `0x${compiled.evm.bytecode.object}`,
      deployedBytecode: `0x${compiled.evm.deployedBytecode.object}`,
    };
    fs.writeFileSync(path.join(ROOT, 'artifacts', `${contractName}.json`), `${JSON.stringify(artifact, null, 2)}\n`);
  }
}
console.log(`Compiled CommunityTreasury and receiver fixtures with ${solc.version()} (Shanghai, optimizer 200).`);
