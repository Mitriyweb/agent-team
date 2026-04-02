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
} else if (command === "run") {
  runScript(path.join(sourceDir, "scripts/run.sh"), args.slice(1));
} else if (command === "plan") {
  runScript(path.join(sourceDir, "scripts/plan.sh"), args.slice(1));
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
  console.log("  agent-team init [--team NAME] [--no-human-review]   # Initialize project");
  console.log("  agent-team run [--all] [--dry-run] [--team NAME]    # Execute tasks");
  console.log("  agent-team plan [ROADMAP.md]                        # Decompose roadmap");
  console.log("  agent-team new-team --name NAME --description DESC  # Create custom team");
  console.log("  agent-team validate NAME                             # Validate team structure");
  console.log("  agent-team -h, --help                               # Show this help");
  process.exit(0);
}
