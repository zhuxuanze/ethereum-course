"use strict";
// Truffle 5.11.5's console JSON-parses metadata even when solc 0.5.1 emits
// an empty string for an interface. Omit only that empty optional field.
// ABI, bytecode, source and network deployment records are unchanged.
const fs = require("node:fs");
const path = require("node:path");
const directory = path.join(__dirname, "..", "build", "contracts");
for (const file of fs.readdirSync(directory).filter(f => f.endsWith(".json"))) {
  const target = path.join(directory, file);
  const artifact = JSON.parse(fs.readFileSync(target, "utf8"));
  if (artifact.metadata === "") {
    delete artifact.metadata;
    fs.writeFileSync(target, JSON.stringify(artifact, null, 2) + "\n");
    console.log(`Prepared console artifact: ${file}`);
  }
}
