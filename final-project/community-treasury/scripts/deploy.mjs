import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {JsonRpcProvider,Wallet,ContractFactory,getAddress,keccak256,formatEther,toQuantity} from 'ethers';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const artifact=JSON.parse(fs.readFileSync(path.join(root,'artifacts/CommunityTreasury.json'),'utf8'));
const rpc=process.env.RPC_URL||'http://127.0.0.1:18545';
const url=new URL(rpc);
const isLoopback=['127.0.0.1','localhost','[::1]'].includes(url.hostname);
const provider=new JsonRpcProvider(rpc,undefined,{cacheTimeout:-1});
class PlanInputError extends Error {}
try{
 const args=process.argv.slice(2);
 const broadcast=args.includes('--broadcast');
 const outputIndex=args.indexOf('--unsigned-file');
 const unsignedFile=outputIndex===-1?null:args[outputIndex+1];
 if(outputIndex!==-1 && (broadcast||!unsignedFile||unsignedFile.startsWith('--'))){
  throw new PlanInputError('Use --unsigned-file PATH only in plan mode.');
 }
 const network=await provider.getNetwork();
 const local=isLoopback&&[1337n,31337n].includes(network.chainId);
 if((!local||process.env.EXPECTED_CHAIN_ID) && String(network.chainId)!==process.env.EXPECTED_CHAIN_ID)throw new PlanInputError('Set EXPECTED_CHAIN_ID to the verified target network ID.');
 const publicAddress=process.env.DEPLOYER_ADDRESS?getAddress(process.env.DEPLOYER_ADDRESS):null;
 let signer;
 if(broadcast||!publicAddress){
  if(local) signer=await provider.getSigner(0);
  else {
   if(!/^0x[0-9a-fA-F]{64}$/.test(process.env.DEPLOYER_PRIVATE_KEY||'')){
    throw new PlanInputError(broadcast?'External broadcast requires a locally configured signer.':'Set DEPLOYER_ADDRESS to your public funding address for an unsigned plan.');
   }
   signer=new Wallet(process.env.DEPLOYER_PRIVATE_KEY,provider);
  }
 }
 const deployer=signer?await signer.getAddress():publicAddress;
 if(publicAddress && publicAddress!==deployer)throw new PlanInputError('DEPLOYER_ADDRESS does not match the signer.');
 const supplied=(process.env.OWNER_ADDRESSES||'').split(',').filter(Boolean).map(x=>getAddress(x.trim()));
 const owners=supplied.length?supplied:local?await Promise.all([0,1,2].map(async i=>(await provider.getSigner(i)).getAddress())):[];
 if(owners.length!==3||new Set(owners.map(x=>x.toLowerCase())).size!==3||owners.some(x=>/^0x0{40}$/i.test(x)))throw new Error('OWNER_ADDRESSES must contain three distinct nonzero addresses.');
 const factory=new ContractFactory(artifact.abi,artifact.bytecode,signer);
 const request=await factory.getDeployTransaction(owners);
 const [estimate,balance,fees]=await Promise.all([
  provider.estimateGas({...request,from:deployer}),provider.getBalance(deployer),provider.getFeeData()
 ]);
 const dynamicFees=fees.maxFeePerGas!==null && fees.maxPriorityFeePerGas!==null;
 const feePerGas=dynamicFees?fees.maxFeePerGas:fees.gasPrice;
 if(feePerGas===null)throw new PlanInputError('The RPC did not return a gas price.');
 const feeFields=dynamicFees
  ?{maxFeePerGas:toQuantity(fees.maxFeePerGas),maxPriorityFeePerGas:toQuantity(fees.maxPriorityFeePerGas)}
  :{gasPrice:toQuantity(feePerGas)};
 const plan={mode:'deployment-plan',chainId:String(network.chainId),networkKind:local?'local-development':'external',
  owners,deployer,estimatedGas:String(estimate),quotedFeePerGasWei:String(feePerGas),
  estimatedMaxExecutionFeeETH:formatEther(estimate*feePerGas),balanceETH:formatEther(balance),sourceSha256:artifact.sourceSha256};
 console.log(JSON.stringify(plan,null,2));
 if(unsignedFile){
  const transaction={chainId:toQuantity(network.chainId),from:deployer,data:request.data,value:'0x0',gas:toQuantity(estimate),...feeFields};
  fs.writeFileSync(unsignedFile,JSON.stringify({...plan,signed:false,transaction},null,2)+'\n',{flag:'wx'});
  console.log('Unsigned contract creation request saved: '+unsignedFile);
 }
 if(!broadcast){console.log('Plan only. No transaction was sent.');process.exitCode=0;}
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
 const message=error instanceof PlanInputError?error.message:error?.code==='EEXIST'?'The output file already exists. Choose a new path.':'Check the network ID, endpoint, signer, three owner addresses and balance.';
 console.error(`Deployment did not complete${safeCodes.has(error?.code)?' ('+error.code+')':''}. ${message}`);
 process.exitCode=1;
}finally{provider.destroy();}
