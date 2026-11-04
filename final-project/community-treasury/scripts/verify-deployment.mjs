import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {JsonRpcProvider,Contract,keccak256,getAddress} from 'ethers';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const a=JSON.parse(fs.readFileSync(path.join(root,'artifacts/CommunityTreasury.json'),'utf8'));
const address=getAddress(process.env.CONTRACT_ADDRESS||'');
const rpc=process.env.RPC_URL||'http://127.0.0.1:18545';
const provider=new JsonRpcProvider(rpc,undefined,{cacheTimeout:-1});
try{
 const network=await provider.getNetwork();
 const local=['127.0.0.1','localhost','[::1]'].includes(new URL(rpc).hostname)&&[1337n,31337n].includes(network.chainId);
 if((!local&&!process.env.EXPECTED_CHAIN_ID)||(process.env.EXPECTED_CHAIN_ID&&String(network.chainId)!==process.env.EXPECTED_CHAIN_ID))throw new Error('Unexpected chain ID.');
 const code=await provider.getCode(address);
 const contract=new Contract(address,a.abi,provider);
 const owners=await Promise.all([0,1,2].map(i=>contract.owners(i)));
 const threshold=Number(await contract.REQUIRED_CONFIRMATIONS());
 const expectedOwners=(process.env.OWNER_ADDRESSES||'').split(',').filter(Boolean).map(x=>getAddress(x.trim()));
 if(!local&&expectedOwners.length!==3)throw new Error('Expected owners are required for external verification.');
 if(expectedOwners.length&& (expectedOwners.length!==3||owners.some((x,i)=>x.toLowerCase()!==expectedOwners[i].toLowerCase())))throw new Error('Owner mismatch.');
 const result={verifiedAt:new Date().toISOString(),chainId:String(network.chainId),address,runtimeMatches:code.toLowerCase()===a.deployedBytecode.toLowerCase(),runtimeKeccak256:keccak256(code),owners,threshold,expectedOwnersChecked:expectedOwners.length===3,sourceSha256:a.sourceSha256};
 if(!result.runtimeMatches||threshold!==2||new Set(owners).size!==3)throw new Error('Contract identity or threshold verification failed.');
 fs.mkdirSync(path.join(root,'evidence'),{recursive:true});
 fs.writeFileSync(path.join(root,'evidence/deployment-verification.json'),JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify(result,null,2));
}catch(error){console.error('Deployment verification failed. Check the expected network, expected owner addresses, contract address and compiled runtime.');process.exitCode=1;}finally{provider.destroy();}
