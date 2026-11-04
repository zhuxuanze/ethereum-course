import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {JsonRpcProvider,Wallet,ContractFactory,getAddress,keccak256,formatEther} from 'ethers';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const artifact=JSON.parse(fs.readFileSync(path.join(root,'artifacts/CommunityTreasury.json'),'utf8'));
const rpc=process.env.RPC_URL||'http://127.0.0.1:18545';
const url=new URL(rpc);
const isLoopback=['127.0.0.1','localhost','[::1]'].includes(url.hostname);
const provider=new JsonRpcProvider(rpc,undefined,{cacheTimeout:-1});
try{
 const network=await provider.getNetwork();
 const local=isLoopback&&[1337n,31337n].includes(network.chainId);
 if(!local && String(network.chainId)!==process.env.EXPECTED_CHAIN_ID)throw new Error('Set EXPECTED_CHAIN_ID to the verified target network ID.');
 let signer;
 if(local) signer=await provider.getSigner(0);
 else {
  if(!/^0x[0-9a-fA-F]{64}$/.test(process.env.DEPLOYER_PRIVATE_KEY||''))throw new Error('Supply a valid signing key through the environment.');
  signer=new Wallet(process.env.DEPLOYER_PRIVATE_KEY,provider);
 }
 const supplied=(process.env.OWNER_ADDRESSES||'').split(',').filter(Boolean).map(x=>getAddress(x.trim()));
 const owners=supplied.length?supplied:local?await Promise.all([0,1,2].map(async i=>(await provider.getSigner(i)).getAddress())):[];
 if(owners.length!==3||new Set(owners.map(x=>x.toLowerCase())).size!==3||owners.some(x=>/^0x0{40}$/i.test(x)))throw new Error('OWNER_ADDRESSES must contain three distinct nonzero addresses.');
 const factory=new ContractFactory(artifact.abi,artifact.bytecode,signer);
 const request=await factory.getDeployTransaction(owners);
 const estimate=await provider.estimateGas({...request,from:await signer.getAddress()});
 console.log(JSON.stringify({mode:'deployment-plan',chainId:String(network.chainId),networkKind:local?'local-development':'external',owners,deployer:await signer.getAddress(),estimatedGas:String(estimate),balanceETH:formatEther(await provider.getBalance(await signer.getAddress())),sourceSha256:artifact.sourceSha256},null,2));
 if(!process.argv.includes('--broadcast')){console.log('Plan only. Add --broadcast after reviewing target, owners and fees.');process.exitCode=0;}
 else {
  const contract=await factory.deploy(owners);
  const tx=contract.deploymentTransaction();
  const dir=path.join(root,'deployments');fs.mkdirSync(dir,{recursive:true});
  const pendingFile=path.join(dir,`${network.chainId}-${tx.hash}.pending.json`);
  fs.writeFileSync(pendingFile,JSON.stringify({chainId:String(network.chainId),transactionHash:tx.hash,owners,submittedAt:new Date().toISOString()},null,2));
  console.log(`Submitted: ${tx.hash}`);
  const receipt=await tx.wait();
  if(receipt.status!==1)throw new Error('Deployment transaction failed.');
  const address=await contract.getAddress();
  const code=await provider.getCode(address);
  if(code.toLowerCase()!==artifact.deployedBytecode.toLowerCase())throw new Error('Deployed runtime differs from compiled artifact.');
  const observedOwners=await Promise.all([0,1,2].map(i=>contract.owners(i)));
  const threshold=Number(await contract.REQUIRED_CONFIRMATIONS());
  if(threshold!==2||observedOwners.some((x,i)=>x.toLowerCase()!==owners[i].toLowerCase()))throw new Error('Owner or threshold readback differs from deployment plan.');
  const result={verifiedAt:new Date().toISOString(),networkKind:local?'local-development':'external',chainId:String(network.chainId),address,transactionHash:tx.hash,blockNumber:receipt.blockNumber,gasUsed:String(receipt.gasUsed),status:receipt.status,owners:observedOwners,threshold,runtimeKeccak256:keccak256(code),runtimeMatches:true,sourceSha256:artifact.sourceSha256,compiler:artifact.compiler};
  const output=path.join(dir,`${network.chainId}-${address}.json`);fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');fs.unlinkSync(pendingFile);console.log(`Verified deployment record: ${output}`);
 }
}catch(error){
 const safeCodes=new Set(['NETWORK_ERROR','INSUFFICIENT_FUNDS','CALL_EXCEPTION','TIMEOUT']);
 console.error(`Deployment did not complete${safeCodes.has(error?.code)?' ('+error.code+')':''}. Check the network ID, endpoint, signer, three owner addresses and balance. Any submitted transaction is retained in deployments/.`);
 process.exitCode=1;
}finally{provider.destroy();}
