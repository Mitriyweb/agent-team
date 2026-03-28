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
} else if (command === "new-team") {
  const teamPath = path.join(__dirname, "../scripts/team.sh");
  const child = spawn("bash", [teamPath, "create", ...args.slice(1)], {
    stdio: "inherit",
    env: { ...process.env, SOURCE_DIR: path.join(__dirname, "..") },
  });
  child.on("close", (code) => process.exit(code || 0));
} else if (command === "validate") {
  const teamPath = path.join(__dirname, "../scripts/team.sh");
  const child = spawn("bash", [teamPath, "validate", ...args.slice(1)], {
    stdio: "inherit",
    env: { ...process.env, SOURCE_DIR: path.join(__dirname, "..") },
  });
  child.on("close", (code) => process.exit(code || 0));
} else {
  console.log("Claude Code Agent Team");
  console.log("Usage:");
  console.log("  npx @mitriyweb/agent-team init");
  console.log("  npx @mitriyweb/agent-team new-team --name NAME --description DESC --roles ROLE1,ROLE2");
  console.log("  npx @mitriyweb/agent-team validate NAME");
  process.exit(0);
}
