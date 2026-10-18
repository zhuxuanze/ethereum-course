/* global ethers */
"use strict";
(() => {
  const CHAIN = 11155111n, DATA = "0x19ff1d21", GREETING = "Hello, world!";
  const EXPECTED = "0xf022a488d7730a66d9aa986077162425ca910200";
  const KNOWN = "0xa9511ae0f8e96abf1f9eb8c1aec8e04be846db521d8435257a3cc96be7e2e993";
  const KNOWN_HELLO = "0x8b950980dd75980694d889c651c7bf42f96c0b62ef242e0b0d12290f3108c9f8";
  const MANAGER = "0xdb9b1e94b5b69df7e401ddbede43491141047db3";
  const DELEGATION_CODE = "0xef010063c0c19a282a1b52b07dd5a65b58948a07dae32b";
  const KEY = "assignment3.hello.sepolia.public-evidence.v1";
  const wallets = new Map();
  const el = (id) => document.getElementById(id);
  const buttons = Object.fromEntries(["connect", "deploy", "recover", "recover-hello", "retry", "read", "send", "download"].map((id) => [id, el(id)]));
  let artifacts, selected, account, busy = false, connected = false, verified = false;
  const state = {
    schemaVersion: 2, application: "Assignment 3 HelloWorld public execution evidence", pageOrigin: location.origin,
    requiredNetwork: { name: "Sepolia", chainId: Number(CHAIN) }, expectedCourseAccount: EXPECTED,
    expectedGreeting: GREETING, helloCalldata: DATA, transactionValueWei: "0",
    compiler: { version: "0.5.17+commit.d19bba13", optimizer: { enabled: true, runs: 200 }, evmTarget: "istanbul" },
    wallet: null, network: null, contractAddress: null,
    deployment: { transactionHash: KNOWN, pending: true, recoveryRequired: true,
      source: "Already confirmed and submitted in MetaMask; recover without deploying again." },
    runtimeVerification: null, readCall: null,
    helloTransaction: { transactionHash: KNOWN_HELLO, pending: true, recoveryRequired: true },
    helloAttemptHistory: [], lastError: null
  };
  try {
    const old = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (old?.expectedCourseAccount === EXPECTED) {
      for (const key of ["wallet", "network", "contractAddress", "deployment", "deploymentRequest", "runtimeVerification", "readCall", "helloTransaction", "helloTransactionRequest", "helloAttemptHistory"]) {
        if (old[key] != null) state[key] = old[key];
      }
      state.restoredPublicEvidence = true;
    }
  } catch { state.persistenceWarning = "Saved public evidence could not be read."; }
  const json = (value) => JSON.stringify(value, (_key, item) => typeof item === "bigint" ? item.toString() : item, 2);
  function persist() {
    try { localStorage.setItem(KEY, json(state)); }
    catch { state.persistenceWarning = "Local storage is unavailable; download the public evidence."; }
  }
  function status(text, error = false) { el("status").textContent = text; el("status").className = error ? "error" : ""; }
  function render() {
    state.updatedAtUtc = new Date().toISOString(); persist(); el("evidence").textContent = json(state);
    const transactionStatus = (entry) => {
      if (!entry) return "Not recorded";
      if (entry.pending) return "Pending";
      const label = entry.status === 1 ? "Success (1)" : entry.status === 0 ? "Failed (0)" : "Status unavailable";
      return `${label} · ${entry.gasUsed ?? "unknown"} gas`;
    };
    el("summary-contract").textContent = state.contractAddress ?? "Not recorded";
    el("summary-code").textContent = state.runtimeVerification?.codeMatch ? "Runtime matches" : "Runtime not verified";
    el("summary-deployment-hash").textContent = state.deployment?.transactionHash ?? "Not recorded";
    el("summary-deployment-status").textContent = transactionStatus(state.deployment);
    el("summary-greeting").textContent = state.readCall?.result ?? "Not read";
    el("summary-read-status").textContent = state.readCall?.exactMatch ? "Verified · eth_call" : "eth_call";
    el("summary-call-hash").textContent = state.helloTransaction?.transactionHash ?? "Not sent";
    el("summary-call-status").textContent = state.helloTransaction?.status === 1 && !state.helloTransaction?.successfulHelloCall
      ? `Outer success (1), call unverified · ${state.helloTransaction.gasUsed ?? "unknown"} gas`
      : transactionStatus(state.helloTransaction);
    buttons.connect.disabled = busy || !artifacts;
    buttons.deploy.disabled = busy || !connected || Boolean(state.deployment);
    buttons.recover.disabled = busy || !connected || !artifacts;
    buttons.read.disabled = busy || !connected || !verified;
    buttons.send.disabled = busy || !connected || !verified || Boolean(state.helloTransaction);
    buttons["recover-hello"].disabled = busy || !connected || !verified || !state.helloTransaction?.transactionHash;
    buttons.retry.disabled = busy || !connected || !verified || state.helloTransaction?.status !== 0 || !state.helloTransaction?.failureConfirmed;
    buttons.download.disabled = busy;
    el("providers").textContent = wallets.size
      ? `Announced wallets: ${Array.from(wallets.values()).map((d) => `${d.info.name} (${d.info.rdns})`).join(", ")}. Selected: ${state.wallet?.name ?? "none"}.`
      : "MetaMask-only legacy fallback available; waiting for EIP-6963 announcements.";
    el("explorer-links").replaceChildren();
    for (const [label, entry] of [["Deployment on Sepolia Etherscan", state.deployment], ["hello() on Sepolia Etherscan", state.helloTransaction]]) {
      if (!entry?.transactionHash) continue;
      const link = document.createElement("a"); link.href = `https://sepolia.etherscan.io/tx/${entry.transactionHash}`;
      link.target = "_blank"; link.rel = "noopener noreferrer"; link.textContent = label; el("explorer-links").append(link);
    }
  }
  async function action(label, operation) {
    if (busy) return; busy = true; state.lastError = null; status(label); render();
    try { await operation(); }
    catch (error) { const message = String(error.shortMessage ?? error.message ?? error).slice(0, 1500);
      state.lastError = { step: label, message, code: error.code ?? null, atUtc: new Date().toISOString() }; status(message, true); }
    finally { busy = false; render(); }
  }
  function invalidate(reason) { connected = false; verified = false;
    state.connectionInvalidated = { reason, atUtc: new Date().toISOString() }; status(`${reason} Reconnect MetaMask.`, true); render(); }
  const rpc = (method, params = []) => selected.request({ method, params });
  function quantity(value) { if (value == null || value === "" || value === "0x") return null;
    try { return BigInt(value).toString(); } catch { return null; } }
  function number(value) { const parsed = quantity(value); return parsed == null ? null : Number(parsed); }
  async function check() {
    if (!selected || !account || !connected) throw new Error("Connect MetaMask on Sepolia first.");
    const chain = BigInt(await rpc("eth_chainId")), accounts = await rpc("eth_accounts");
    if (chain !== CHAIN) { invalidate("The wallet network changed."); throw new Error(`Sepolia is required. Current chain ID: ${chain}. No transaction was requested.`); }
    if (!accounts.length || ethers.getAddress(accounts[0]) !== account || account.toLowerCase() !== EXPECTED) {
      invalidate("The selected wallet account changed."); throw new Error("The account changed. No transaction was requested."); }
    state.network = { name: "Sepolia", chainId: Number(chain), checkedAtUtc: new Date().toISOString() };
  }
  function transactionSummary(tx, hash) {
    return { transactionHash: hash ?? tx?.hash ?? null, from: tx?.from ?? null, to: tx?.to ?? null,
      chainId: quantity(tx?.chainId), nonce: number(tx?.nonce), valueWei: quantity(tx?.value),
      data: tx?.input ?? tx?.data ?? null, transaction: tx ?? null };
  }
  function receiptSummary(receipt, tx) {
    const gas = quantity(receipt?.gasUsed), price = quantity(receipt?.effectiveGasPrice ?? receipt?.gasPrice ?? tx?.gasPrice);
    return { transactionHash: receipt?.transactionHash ?? tx?.hash ?? null,
      blockNumber: number(receipt?.blockNumber), blockHash: receipt?.blockHash ?? null, status: number(receipt?.status),
      from: receipt?.from ?? tx?.from ?? null, to: receipt?.to ?? null, contractAddress: receipt?.contractAddress ?? null,
      gasUsed: gas, effectiveGasPriceWei: price, feeWei: gas != null && price != null ? (BigInt(gas) * BigInt(price)).toString() : null,
      receipt };
  }
  function validate(tx, kind) {
    if (!tx) throw new Error("Transaction not yet available from Sepolia RPC. Recover again shortly.");
    if (tx.from?.toLowerCase() !== EXPECTED) throw new Error("The transaction sender is not course Account 2.");
    const chain = quantity(tx.chainId);
    if (chain != null && BigInt(chain) !== CHAIN) throw new Error("The transaction reports another chain ID.");
    if (quantity(tx.value) !== "0") throw new Error("The transaction value could not be verified as zero.");
    const input = tx.input ?? tx.data;
    if (kind === "deployment") {
      if (tx.to !== null) throw new Error("This is not a creation transaction: to must be null.");
      if (input?.toLowerCase() !== artifacts.creation.toLowerCase()) throw new Error("The input does not match the expected HelloWorld creation bytecode.");
    } else {
      if (tx.to?.toLowerCase() === state.contractAddress?.toLowerCase()) {
        if (input?.toLowerCase() !== DATA) throw new Error("The direct transaction input is not hello().");
        return { path: "direct", innerTarget: state.contractAddress, innerValueWei: "0", innerCalldata: DATA };
      }
      if (tx.to?.toLowerCase() !== MANAGER) throw new Error("The transaction target is neither HelloWorld nor the verified MetaMask DelegationManager.");
      const manager = new ethers.Interface(["function redeemDelegations(bytes[] permissionContexts,bytes32[] modes,bytes[] executionCallDatas)"]);
      const [contexts, modes, calls] = manager.decodeFunctionData("redeemDelegations", input);
      if (contexts.length !== 1 || modes.length !== 1 || calls.length !== 1) throw new Error("Only one exact wrapped hello() operation is accepted.");
      // ERC-7579 default single-call mode: all zero bytes, including the
      // execution type. The try/continue-on-failure mode is not accepted.
      if (modes[0] !== `0x${"00".repeat(32)}`) throw new Error("The wrapped operation is not default single-call revert-on-failure mode.");
      const packed = ethers.getBytes(calls[0]);
      if (packed.length !== 56) throw new Error("Unexpected wrapped execution length; hidden or additional calldata is rejected.");
      const target = ethers.hexlify(packed.slice(0, 20));
      const value = BigInt(ethers.hexlify(packed.slice(20, 52)));
      const calldata = ethers.hexlify(packed.slice(52));
      if (target.toLowerCase() !== state.contractAddress?.toLowerCase() || value !== 0n || calldata !== DATA) throw new Error("The wrapped target, value or selector does not match the intended hello() call.");
      return { path: "MetaMask EIP-7702 DelegationManager-wrapped single call", outerTarget: tx.to,
        outerSelector: input.slice(0, 10), executionMode: modes[0], revertOnInnerFailure: true,
        operationCount: 1, innerTarget: target, innerValueWei: value.toString(), innerCalldata: calldata };
    }
  }
  async function receiptFor(hash) {
    const deadline = Date.now() + 180000;
    while (Date.now() < deadline) { const receipt = await rpc("eth_getTransactionReceipt", [hash]); if (receipt) return receipt;
      await new Promise((resolve) => setTimeout(resolve, 1500)); }
    throw new Error("Receipt is pending. The hash is saved. Recover this transaction; do not resend it.");
  }
  async function finishDeployment(hash, recovered) {
    await check(); const tx = await rpc("eth_getTransactionByHash", [hash]); validate(tx, "deployment");
    const raw = await receiptFor(hash), summary = receiptSummary(raw, tx);
    state.deployment = { ...transactionSummary(tx, hash), ...summary, pending: false, recoveredWithoutSending: recovered,
      verification: { chainIdVerifiedByRpc: Number(CHAIN), fromCourseAccount: true, creationTransactionToNull: true, creationInputMatches: true, zeroValue: true } };
    persist();
    if (summary.status !== 1) throw new Error("The deployment transaction was mined but failed.");
    if (!summary.contractAddress) throw new Error("The raw receipt contains no contract address.");
    await check(); state.contractAddress = summary.contractAddress;
    const code = await rpc("eth_getCode", [state.contractAddress, raw.blockNumber ?? "latest"]);
    const matches = code.toLowerCase() === artifacts.runtime.toLowerCase();
    state.runtimeVerification = { blockNumber: summary.blockNumber, codeMatch: matches,
      expectedCodeHash: ethers.keccak256(artifacts.runtime), actualCodeHash: ethers.keccak256(code),
      expectedRuntimeBytes: ethers.getBytes(artifacts.runtime).length, actualRuntimeBytes: ethers.getBytes(code).length, code };
    if (!matches) throw new Error("The deployed runtime does not match the compiled runtime.");
    verified = true; status(`Deployment ${recovered ? "recovered" : "confirmed"}. Runtime matches. Contract: ${state.contractAddress}`);
  }
  async function finishHello(hash) {
    await check();
    const raw = await receiptFor(hash), tx = await rpc("eth_getTransactionByHash", [hash]);
    const summary = receiptSummary(raw, tx);
    // Preserve actual public data before any identity/payload validator runs.
    state.helloTransaction = { ...transactionSummary(tx, hash), ...summary, pending: false,
      submittedOnChain: true, successfulHelloCall: false, returnValueInReceipt: false };
    persist(); render();
    const decoded = validate(tx, "hello");
    if (decoded.path !== "direct") {
      const delegation = await rpc("eth_getCode", [EXPECTED, raw.blockNumber ?? "latest"]);
      if (delegation.toLowerCase() !== DELEGATION_CODE) throw new Error("The course account's delegated implementation does not match MetaMask's verified implementation.");
      decoded.delegatedAccountCode = delegation;
    }
    state.helloTransaction.callVerification = { ...decoded, fromCourseAccount: true,
      chainIdVerifiedByRpc: Number(CHAIN), receiptStatus: summary.status };
    if (summary.status === 0) {
      state.helloTransaction.failureConfirmed = true; persist();
      status("The previous hello() attempt failed on-chain. Its evidence is saved. An explicit retry may use MetaMask's native gas estimation.", true);
      return;
    }
    if (summary.status !== 1) throw new Error("The receipt does not confirm successful execution.");
    state.helloTransaction.successfulHelloCall = true;
    state.helloTransaction.createsBlockchainTransaction = true; persist();
    status(`hello() transaction confirmed. Gas used: ${summary.gasUsed ?? "not supplied by RPC"}. The return value remains the separate eth_call result.`);
  }
  window.addEventListener("eip6963:announceProvider", (event) => { const d = event.detail;
    if (!d?.info?.uuid || typeof d.provider?.request !== "function") return; wallets.set(d.info.uuid, d); render(); });
  window.dispatchEvent(new Event("eip6963:requestProvider"));
  buttons.connect.addEventListener("click", () => action("Connecting MetaMask…", async () => {
    connected = false; window.dispatchEvent(new Event("eip6963:requestProvider"));
    await new Promise((resolve) => setTimeout(resolve, 300));
    const meta = Array.from(wallets.values()).find((d) => d.info.rdns === "io.metamask");
    const legacy = window.ethereum?.isMetaMask === true && !window.ethereum?.isBinance && !window.ethereum?.isBinanceWallet;
    const candidate = meta?.provider ?? (legacy ? window.ethereum : null);
    if (!candidate) throw new Error("MetaMask was not found. Enable its extension and reload.");
    const accounts = await candidate.request({ method: "eth_requestAccounts" });
    const chain = BigInt(await candidate.request({ method: "eth_chainId" }));
    if (chain !== CHAIN) { state.network = { name: "Unsupported network", chainId: Number(chain) };
      throw new Error(`Select Sepolia in MetaMask and reconnect. Current chain ID: ${chain}.`); }
    if (!accounts.length) throw new Error("MetaMask exposed no account.");
    selected = candidate; account = ethers.getAddress(accounts[0]);
    state.wallet = { name: meta?.info.name ?? "MetaMask", rdns: meta?.info.rdns ?? null,
      selectionMethod: meta ? "EIP-6963 io.metamask" : "window.ethereum.isMetaMask fallback", account };
    if (account.toLowerCase() !== EXPECTED) throw new Error(`Selected account: ${account}. Select course Account 2 (${EXPECTED}) and reconnect. No transaction was requested.`);
    connected = true; state.network = { name: "Sepolia", chainId: Number(chain), checkedAtUtc: new Date().toISOString() };
    delete state.connectionInvalidated;
    if (typeof selected.on === "function") { selected.on("accountsChanged", () => invalidate("MetaMask accounts changed."));
      selected.on("chainChanged", () => invalidate("MetaMask chain changed.")); selected.on("disconnect", () => invalidate("MetaMask disconnected.")); }
    status(`Connected: ${account}. Recover the existing deployment; do not deploy again.`);
  }));
  buttons.recover.addEventListener("click", () => action("Recovering deployment (read-only)…", async () => {
    await check(); const hash = el("recover-hash").value.trim();
    if (!ethers.isHexString(hash, 32)) throw new Error("Enter a complete deployment transaction hash.");
    state.deployment = { transactionHash: hash, pending: true, recoveryRequired: true }; persist(); render();
    await finishDeployment(hash, true);
  }));
  buttons["recover-hello"].addEventListener("click", () => action("Recovering hello() transaction (read-only)…", async () => {
    if (!verified) throw new Error("Recover and verify the deployment first.");
    await finishHello(state.helloTransaction.transactionHash);
  }));
  buttons.deploy.addEventListener("click", () => action("Estimating deployment gas…", async () => {
    if (state.deployment) throw new Error("A deployment hash exists. Use Recover; do not deploy again.");
    await check(); const request = { from: account, data: artifacts.creation, value: "0x0" };
    const estimate = BigInt(await rpc("eth_estimateGas", [request])), limit = (estimate * 120n + 99n) / 100n;
    await check(); state.deploymentRequest = { from: account, chainId: Number(CHAIN), valueWei: "0", estimatedGas: estimate.toString(), gasLimit: limit.toString() };
    status("Confirm deployment in MetaMask."); render();
    const hash = await rpc("eth_sendTransaction", [{ ...request, gas: ethers.toQuantity(limit) }]);
    state.deployment = { transactionHash: hash, pending: true, submittedAtUtc: new Date().toISOString() }; persist();
    el("recover-hash").value = hash; status(`Hash saved. Waiting for deployment receipt: ${hash}`); render();
    await finishDeployment(hash, false);
  }));
  buttons.read.addEventListener("click", () => action("Reading hello() with eth_call…", async () => {
    await check(); if (!verified) throw new Error("Recover and verify the existing deployment first.");
    const raw = await rpc("eth_call", [{ to: state.contractAddress, data: DATA }, "latest"]);
    const result = new ethers.Interface(artifacts.abi).decodeFunctionResult("hello", raw)[0];
    state.readCall = { method: "eth_call", contractAddress: state.contractAddress, calldata: DATA, result,
      expected: GREETING, exactMatch: result === GREETING, returnData: raw, createsBlockchainTransaction: false, observedAtUtc: new Date().toISOString() };
    if (result !== GREETING) throw new Error(`Unexpected greeting: ${result}`); status(`Read result verified: ${result}`);
  }));
  async function submitHello(retry) {
    await check(); if (!verified) throw new Error("Recover the deployment first.");
    if (retry) {
      if (state.helloTransaction?.status !== 0 || !state.helloTransaction?.failureConfirmed) throw new Error("A retry requires a confirmed failed receipt for the same verified call.");
    } else if (state.helloTransaction) throw new Error("A hello() hash is saved. Recover it; do not send again.");
    const request = { from: account, to: state.contractAddress, data: DATA, value: "0x0" };
    const estimate = await rpc("eth_estimateGas", [request]);
    await check(); state.helloTransactionRequest = { ...request, informationalDirectGasEstimate: quantity(estimate),
      gasPolicy: "Gas and gasLimit omitted. MetaMask estimates its final transaction, including any smart-account wrapping.",
      rpcRequest: request };
    status("Confirm the 0 ETH hello() transaction in MetaMask using its native gas estimate."); render();
    const hash = await rpc("eth_sendTransaction", [request]);
    if (retry) state.helloAttemptHistory.push({ ...state.helloTransaction, archivedAtUtc: new Date().toISOString() });
    state.helloTransaction = { transactionHash: hash, pending: true, submittedAtUtc: new Date().toISOString() }; persist();
    status(`Hash saved. Waiting for hello() receipt: ${hash}`); render();
    await finishHello(hash);
  }
  buttons.send.addEventListener("click", () => action("Preparing hello() transaction…", () => submitHello(false)));
  buttons.retry.addEventListener("click", () => action("Preparing explicit retry after confirmed failure…", () => submitHello(true)));
  buttons.download.addEventListener("click", () => { const blob = new Blob([`${json(state)}\n`], { type: "application/json" });
    const url = URL.createObjectURL(blob), link = document.createElement("a"); link.href = url; link.download = "assignment3-sepolia-evidence.json";
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); });
  el("recover-hash").value = state.deployment?.transactionHash ?? KNOWN;
  Promise.all([fetch("/artifacts/HelloWorld/abi.json").then((r) => { if (!r.ok) throw Error("ABI unavailable"); return r.json(); }),
    ...["creation", "runtime"].map((name) => fetch(`/artifacts/HelloWorld/${name}.bin`).then((r) => { if (!r.ok) throw Error(`${name} unavailable`); return r.text(); }))
  ]).then(([abi, creation, runtime]) => {
    const normalize = (text) => `0x${text.trim().replace(/^0x/, "")}`;
    artifacts = { abi, creation: normalize(creation), runtime: normalize(runtime) };
    if (!ethers.isHexString(artifacts.creation) || !ethers.isHexString(artifacts.runtime)) throw Error("Invalid bytecode");
    if (new ethers.Interface(abi).encodeFunctionData("hello") !== DATA) throw Error("Unexpected hello() selector");
    state.artifactHashes = { creationKeccak256: ethers.keccak256(artifacts.creation), runtimeKeccak256: ethers.keccak256(artifacts.runtime) };
    state.ethersVersion = ethers.version; status("Ready. Connect MetaMask, then Recover the existing deployment. Do not deploy again."); render();
  }).catch((error) => { state.lastError = { step: "Load artifacts", message: error.message }; status(error.message, true); render(); });
  render();
})();
