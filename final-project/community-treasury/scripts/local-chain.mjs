import ganache from 'ganache';
const port=Number(process.env.RPC_PORT||18545);
const server=ganache.server({chain:{chainId:1337,hardfork:'shanghai'},wallet:{deterministic:true,totalAccounts:6,defaultBalance:1000},logging:{quiet:true}});
try { await server.listen(port,'127.0.0.1'); }
catch(error) { console.error(`Local RPC could not start: ${error.message}`); process.exit(1); }
console.log(`Disposable local EVM running at http://127.0.0.1:${port}, chain ID 1337. Development ETH only.`);
process.on('SIGINT',async()=>{await server.close();process.exit(0);});
process.on('SIGTERM',async()=>{await server.close();process.exit(0);});
