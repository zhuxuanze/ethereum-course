import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
execFileSync(process.execPath,[path.join(root,'scripts/compile.mjs')],{cwd:root,stdio:'inherit'});
const dist=path.join(root,'dist');
fs.rmSync(dist,{recursive:true,force:true});
fs.mkdirSync(dist,{recursive:true});
fs.cpSync(path.join(root,'web'),dist,{recursive:true});
fs.mkdirSync(path.join(dist,'vendor'),{recursive:true});
fs.mkdirSync(path.join(dist,'artifacts'),{recursive:true});
for(const [src,dest] of [
 ['node_modules/ethers/dist/ethers.umd.min.js','vendor/ethers.umd.min.js'],
 ['node_modules/ganache/dist/web/ganache.min.js','vendor/ganache.min.js'],
 ['node_modules/ganache/dist/web/ganache.min.js.LICENSE.txt','vendor/ganache.LICENSE.txt'],
 ['node_modules/ganache/LICENSE','vendor/ganache-project.LICENSE.txt'],
 ['node_modules/ethers/LICENSE.md','vendor/ethers.LICENSE.md'],
 ['artifacts/CommunityTreasury.json','artifacts/CommunityTreasury.json']
]) fs.copyFileSync(path.join(root,src),path.join(dist,dest));
function inventory(dir,prefix=''){
 return fs.readdirSync(dir,{withFileTypes:true}).flatMap(d=>d.isDirectory()?inventory(path.join(dir,d.name),prefix+d.name+'/'):[{path:prefix+d.name,bytes:fs.statSync(path.join(dir,d.name)).size,sha256:createHash('sha256').update(fs.readFileSync(path.join(dir,d.name))).digest('hex')}]);
}
const files=inventory(dist);
if(!files.some(x=>x.path==='index.html'))throw new Error('Missing web/index.html');
fs.mkdirSync(path.join(root,'evidence'),{recursive:true});
fs.writeFileSync(path.join(root,'evidence/build-manifest.json'),JSON.stringify({builtAt:new Date().toISOString(),files},null,2)+'\n');
console.log(`Built ${files.length} static assets; ${files.reduce((n,x)=>n+x.bytes,0)} bytes.`);
