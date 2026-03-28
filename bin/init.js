#!/usr/bin/env node

/**
 * Claude Code Agent Team — Package Entry Point
 */

const { spawn } = require("node:child_process");
const path = require("node:path");

const args = process.argv.slice(2);
const command = args[0];

const sourceDir = path.join(__dirname, "..");

function runScript(script, scriptArgs) {
  const child = spawn("bash", [script, ...scriptArgs], {
    stdio: "inherit",
    env: { ...process.env, SOURCE_DIR: sourceDir },
  });
  child.on("close", (code) => process.exit(code || 0));
}

if (command === "init") {
  runScript(path.join(sourceDir, "scripts/team.sh"), [
    "init",
    ...args.slice(1),
  ]);
} else if (command === "new-team") {
  runScript(path.join(sourceDir, "scripts/team.sh"), [
    "create",
    ...args.slice(1),
  ]);
} else if (command === "validate") {
  runScript(path.join(sourceDir, "scripts/team.sh"), [
    "validate",
    ...args.slice(1),
  ]);
} else {
  console.log("Claude Code Agent Team");
  console.log("Usage:");
  console.log(
    "  npx @mitriyweb/agent-team init [--team NAME] [--no-human-review]",
  );
  console.log(
    "  npx @mitriyweb/agent-team new-team --name NAME --description DESC --roles ROLE1,ROLE2 [--no-human-review]",
  );
  console.log("  npx @mitriyweb/agent-team validate NAME");
  process.exit(0);
}
