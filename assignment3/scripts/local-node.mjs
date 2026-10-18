import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { JsonRpcProvider } from "ethers";
import { ROOT } from "./compile.mjs";

async function unusedPort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

export async function startLocalNode() {
  const port = await unusedPort();
  const packageJson = JSON.parse(await readFile(path.join(ROOT, "node_modules/hardhat/package.json"), "utf8"));
  const executable = path.join(ROOT, "node_modules/hardhat", packageJson.bin.hardhat);
  // Hardhat prints disposable local keys to stdout. Discard that stream: no key
  // material is copied to evidence, terminal output, or a tracked log file.
  const child = spawn(process.execPath, [executable, "node", "--network", "local",
    "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: ROOT, stdio: ["ignore", "ignore", "pipe"],
    env: { ...process.env, HARDHAT_DISABLE_TELEMETRY: "true" }
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(-8000); });
  const provider = new JsonRpcProvider(`http://127.0.0.1:${port}`, 31337, {
    staticNetwork: true, pollingInterval: 50, cacheTimeout: -1
  });
  let stopped = false;
  async function stop() {
    if (stopped) return;
    stopped = true;
    provider.destroy();
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exited = new Promise((resolve) => child.once("exit", resolve));
    child.kill("SIGTERM");
    await Promise.race([exited, delay(3000)]);
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
  }
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      await stop();
      throw new Error(`Local Hardhat node exited (${child.exitCode}): ${stderr}`);
    }
    try {
      const chainId = await provider.send("eth_chainId", []);
      if (chainId !== "0x7a69") throw new Error(`Unexpected chain ID ${chainId}`);
      return { provider, port, stop, hardhatVersion: packageJson.version,
        clientVersion: await provider.send("web3_clientVersion", []) };
    } catch {
      await delay(100);
    }
  }
  await stop();
  throw new Error(`Timed out waiting for the local Hardhat node: ${stderr}`);
}
