#!/usr/bin/env bun

/**
 * Claude Code Agent Team — Package Entry Point (TypeScript)
 */

import path from "node:path";
import * as p from "@clack/prompts";
import { extractReviewSound } from "../lib/assets.ts";
import { auditReport } from "../lib/audit.ts";
import { runAuditHook } from "../lib/audit-hook.ts";
import { err } from "../lib/common.ts";
import { importConfig } from "../lib/import.ts";
import { planRoadmap } from "../lib/plan.ts";
import {
  promptImport,
  promptInit,
  promptNewTeam,
  promptSyncVault,
} from "../lib/prompts.ts";
import { type RunOptions, TaskRunner } from "../lib/run.ts";
import { syncVault } from "../lib/sync-vault.ts";
import {
  createTeam,
  initProject,
  reconfigureProject,
  updateProject,
  validateTeam,
} from "../lib/team.ts";

import PKG from "../package.json" with { type: "json" };

const args = process.argv.slice(2);
const command = args[0];

if (args.includes("-v") || args.includes("--version")) {
  console.log(PKG.version);
  process.exit(0);
}

const sourceDir = path.join(import.meta.dir, "..");

// Extract assets on startup
extractReviewSound();

/** Check if any flags were explicitly provided (non-interactive mode). */
function hasFlag(...flags: string[]): boolean {
  return flags.some((f) => args.includes(f));
}

function flagValue(flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx === -1) return undefined;
  const val = args[idx + 1];
  return val && !val.startsWith("-") ? val : undefined;
}

async function main() {
  if (command === "init") {
    // Detect explicit flags → non-interactive
    const explicitTeam = flagValue("--team") ?? args[1];
    const teamFromFlag =
      explicitTeam && !explicitTeam.startsWith("-") ? explicitTeam : undefined;
    const explicitPlanner = flagValue("--planner");
    const explicitNoReview = hasFlag("--no-human-review");
    const explicitVault = flagValue("--vault");

    const isNonInteractive =
      teamFromFlag !== undefined ||
      explicitPlanner !== undefined ||
      explicitNoReview ||
      explicitVault !== undefined;

    let teamName: string | undefined;
    let planner: "builtin" | "openspec";
    let humanReview: boolean;
    let vaultPath: string | undefined;

    if (isNonInteractive) {
      // Classic flag-based mode
      teamName = teamFromFlag;
      planner =
        explicitPlanner === "openspec" ? "openspec" : ("builtin" as const);
      humanReview = !explicitNoReview;
      vaultPath = explicitVault;
    } else {
      // Interactive mode
      p.intro("agent-team");
      const answers = await promptInit(sourceDir, {});
      if (!answers) return;
      teamName = answers.teamName;
      planner = answers.planner;
      humanReview = answers.humanReview;
      vaultPath = answers.vaultPath;
    }

    await initProject({
      teamName,
      humanReview,
      sourceDir,
      planner,
      vaultPath,
    });

    if (!isNonInteractive)
      p.outro("Done. Run agent-team run --plan --all to start.");
  } else if (command === "run") {
    const options: RunOptions = {
      all: args.includes("--all"),
      dryRun: args.includes("--dry-run"),
      approvePlan: args.includes("--approve-plan"),
      branch: args.includes("--branch"),
      planFirst: args.includes("--plan"),
      cli: args.includes("--cli"),
    };

    const resumeIdx = args.indexOf("--resume");
    if (resumeIdx !== -1) options.resumeId = args[resumeIdx + 1] ?? "";

    const budgetIdx = args.indexOf("--budget");
    if (budgetIdx !== -1)
      options.budget = parseFloat(args[budgetIdx + 1] ?? "0");

    const teamIdx = args.indexOf("--team");
    if (teamIdx !== -1) options.team = args[teamIdx + 1] ?? "";

    const modelIdx = args.indexOf("--model");
    if (modelIdx !== -1) options.model = args[modelIdx + 1] ?? "";

    const runner = new TaskRunner(options);
    await runner.run();
  } else if (command === "plan") {
    const inputFile =
      args[1] && !args[1].startsWith("-") ? args[1] : "ROADMAP.md";
    const modelIdx = args.indexOf("--model");
    const planModel = modelIdx !== -1 ? args[modelIdx + 1] : undefined;
    await planRoadmap(inputFile, planModel);
  } else if (command === "new-team") {
    const nameFromFlag = flagValue("--name");
    const descFromFlag = flagValue("--description");
    const rolesFromFlag = flagValue("--roles");
    const noHumanReview = hasFlag("--no-human-review");

    const isNonInteractive =
      nameFromFlag !== undefined &&
      descFromFlag !== undefined &&
      rolesFromFlag !== undefined;

    if (isNonInteractive) {
      await createTeam({
        name: nameFromFlag,
        description: descFromFlag,
        roles: rolesFromFlag,
        humanReview: !noHumanReview,
      });
    } else {
      p.intro("agent-team new-team");
      const answers = await promptNewTeam({
        name: nameFromFlag,
        description: descFromFlag,
        roles: rolesFromFlag,
        humanReview: noHumanReview ? false : undefined,
      });
      if (!answers) return;
      await createTeam(answers);
      p.outro("Team created.");
    }
  } else if (command === "import") {
    const source = args[1];

    if (source) {
      await importConfig(source);
    } else {
      p.intro("agent-team import");
      const answers = await promptImport();
      if (!answers) return;
      await importConfig(answers.source);
      p.outro("Import complete.");
    }
  } else if (command === "update") {
    await updateProject({ sourceDir });
  } else if (command === "reconfigure") {
    await reconfigureProject({ sourceDir });
  } else if (command === "validate") {
    const name = args[1];
    if (!name) err("Usage: agent-team validate NAME");
    validateTeam(name);
  } else if (command === "audit-hook") {
    const phase = args[1] || "PRE";
    await runAuditHook(phase);
  } else if (command === "audit") {
    auditReport();
  } else if (command === "sync-vault") {
    const agentsDirFlag = flagValue("--source") ?? flagValue("--agents");
    const vaultDirFlag = flagValue("--vault");

    // Also support positional args: sync-vault <source> <vault>
    const positionalSource =
      !agentsDirFlag && args[1] && !args[1].startsWith("--")
        ? args[1]
        : undefined;
    const positionalVault =
      !vaultDirFlag && args[2] && !args[2].startsWith("--")
        ? args[2]
        : undefined;

    const sourceDir = agentsDirFlag ?? positionalSource;
    const vaultDir_ = vaultDirFlag ?? positionalVault;

    const isNonInteractive = sourceDir !== undefined || vaultDir_ !== undefined;

    let agentsDir: string;
    let vaultDir: string;

    if (isNonInteractive) {
      agentsDir = sourceDir ?? "./agents";
      vaultDir = vaultDir_ ?? "./vault";
    } else {
      p.intro("agent-team sync-vault");
      const answers = await promptSyncVault({});
      if (!answers) return;
      agentsDir = answers.agentsDir;
      vaultDir = answers.vaultDir;
    }

    await syncVault({ agentsDir, vaultDir });

    if (!isNonInteractive) p.outro(`Vault synced to ${vaultDir}`);
  } else {
    console.log("Claude Code Agent Team");
    console.log("");
    console.log("Usage:");
    console.log("");
    console.log("  Setup:");
    console.log(
      "    agent-team init                                      Interactive setup",
    );
    console.log(
      "    agent-team init --team NAME [--planner P] [--vault V] Non-interactive",
    );
    console.log(
      "    agent-team update                                    Update project configs",
    );
    console.log(
      "    agent-team reconfigure                               Update skills & workflows",
    );
    console.log(
      "    agent-team import [path]                             Import rules (interactive if no path)",
    );
    console.log("");
    console.log("  Execution:");
    console.log(
      "    agent-team run [--all] [--plan] [--dry-run]          Execute tasks",
    );
    console.log("                  [--team NAME] [--model MODEL]");
    console.log("                  [--budget N] [--resume ID] [--branch]");
    console.log(
      "                  [--cli]                               Use CLI subprocess instead of SDK",
    );
    console.log(
      "    agent-team plan [FILE] [--model MODEL]               Decompose roadmap into tasks",
    );
    console.log("");
    console.log("  Teams:");
    console.log(
      "    agent-team new-team                                  Interactive team creation",
    );
    console.log(
      "    agent-team new-team --name N --description D --roles R1,R2",
    );
    console.log(
      "    agent-team validate NAME                             Validate team structure",
    );
    console.log("");
    console.log("  Export:");
    console.log(
      "    agent-team sync-vault [SOURCE] [VAULT]               Sync docs to Obsidian vault",
    );
    console.log(
      "    agent-team sync-vault [--source DIR] [--vault DIR]   (agents, specs, or mixed)",
    );
    console.log("");
    console.log("  Monitoring:");
    console.log(
      "    agent-team audit                                     Show audit report",
    );
    console.log("");
    console.log(
      "    agent-team -v, --version                             Show version",
    );
    console.log(
      "    agent-team -h, --help                                Show this help",
    );
    process.exit(0);
  }
}

main().catch((e) => {
  err(e.message);
});
