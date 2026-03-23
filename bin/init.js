#!/usr/bin/env node

/**
 * Claude Code Agent Team — Package Entry Point
 *
 * This script handles the 'init' command by delegating to the
 * project's install.sh script.
 */

const { spawn } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");

const args = process.argv.slice(2);
const command = args[0];

if (command === "init") {
  const installPath = path.join(__dirname, "../install.sh");

  if (!fs.existsSync(installPath)) {
    console.error(`Error: install.sh not found at ${installPath}`);
    process.exit(1);
  }

  // Ensure install.sh is executable
  try {
    fs.chmodSync(installPath, "755");
  } catch (e) {
    // Ignore errors if we can't chmod (might already be executable or restricted)
  }

  const child = spawn("bash", [installPath], {
    stdio: "inherit",
    env: {
      ...process.env,
      SOURCE_DIR: path.join(__dirname, ".."),
    },
  });

  child.on("close", (code) => {
    process.exit(code || 0);
  });
} else {
  console.log("Claude Code Agent Team");
  console.log("Usage: npx @mitriyweb/agent-team init");
  process.exit(0);
}
