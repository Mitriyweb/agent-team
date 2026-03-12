#!/usr/bin/env node

const { spawn } = require("node:child_process");
const path = require("node:path");

const installScript = path.join(__dirname, "..", "install.sh");

const args = process.argv.slice(2);
if (args.length > 0 && args[0] !== "init") {
  console.error(`Unknown command: ${args[0]}. Use "init" to install.`);
  process.exit(1);
}

const child = spawn("bash", [installScript], {
  stdio: "inherit",
});

child.on("exit", (code) => {
  process.exit(code);
});
