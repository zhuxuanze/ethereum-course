import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const routes = new Map([
  ["/", ["browser/index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["browser/index.html", "text/html; charset=utf-8"]],
  ["/app.js", ["browser/app.js", "text/javascript; charset=utf-8"]],
  ["/styles.css", ["browser/styles.css", "text/css; charset=utf-8"]],
  ["/ethers.umd.min.js", ["browser/vendor/ethers.umd.min.js", "text/javascript; charset=utf-8"]],
  ["/artifacts/HelloWorld/abi.json", ["artifacts/HelloWorld/abi.json", "application/json"]],
  ["/artifacts/HelloWorld/creation.bin", ["artifacts/HelloWorld/creation.bin", "text/plain; charset=utf-8"]],
  ["/artifacts/HelloWorld/runtime.bin", ["artifacts/HelloWorld/runtime.bin", "text/plain; charset=utf-8"]]
]);

const server = createServer(async (request, response) => {
  const headers = {
    "Cache-Control": "no-store",
    "Content-Language": "en",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
  };
  if (!["GET", "HEAD"].includes(request.method)) {
    response.writeHead(405, { ...headers, Allow: "GET, HEAD" });
    response.end("Method not allowed");
    return;
  }
  let pathname;
  try { pathname = new URL(request.url, "http://127.0.0.1:8863").pathname; }
  catch { response.writeHead(400, headers); response.end("Bad request"); return; }
  const route = routes.get(pathname);
  if (!route) { response.writeHead(404, headers); response.end("Not found"); return; }
  try {
    const content = await readFile(resolve(root, route[0]));
    response.writeHead(200, { ...headers, "Content-Type": route[1], "Content-Length": content.length });
    response.end(request.method === "HEAD" ? undefined : content);
  } catch {
    response.writeHead(500, headers);
    response.end("Required local artifact is unavailable");
  }
});
server.listen(8863, "127.0.0.1", () => {
  console.log("Assignment3 Hello World page: http://127.0.0.1:8863/");
  console.log("Only the page, local ethers bundle and three HelloWorld artifacts are served. No private keys are read or exported.");
});
