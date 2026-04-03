#!/usr/bin/env bun

/**
 * Claude Code Agent Team — Package Entry Point (TypeScript)
 */

import path from "node:path";
import { extractReviewSound } from "../lib/assets.ts";
import { auditReport } from "../lib/audit.ts";
import { err } from "../lib/common.ts";
import { planRoadmap } from "../lib/plan.ts";
import { type RunOptions, TaskRunner } from "../lib/run.ts";
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

async function main() {
  if (command === "init") {
    const teamIdx = args.indexOf("--team");
    const teamName = teamIdx !== -1 ? args[teamIdx + 1] : args[1];
    const noHumanReview = args.includes("--no-human-review");
    const plannerIdx = args.indexOf("--planner");
    const plannerArg = plannerIdx !== -1 ? args[plannerIdx + 1] : undefined;
    const planner =
      plannerArg === "openspec" ? "openspec" : ("builtin" as const);

    await initProject({
      teamName: teamName && !teamName.startsWith("-") ? teamName : undefined,
      humanReview: !noHumanReview,
      sourceDir,
      planner,
    });
  } else if (command === "run") {
    const options: RunOptions = {
      all: args.includes("--all"),
      dryRun: args.includes("--dry-run"),
      approvePlan: args.includes("--approve-plan"),
      branch: args.includes("--branch"),
    };

    const resumeIdx = args.indexOf("--resume");
    if (resumeIdx !== -1) options.resumeId = args[resumeIdx + 1] ?? "";

    const budgetIdx = args.indexOf("--budget");
    if (budgetIdx !== -1)
      options.budget = parseFloat(args[budgetIdx + 1] ?? "0");

    const teamIdx = args.indexOf("--team");
    if (teamIdx !== -1) options.team = args[teamIdx + 1] ?? "";

    const runner = new TaskRunner(options);
    await runner.run();
  } else if (command === "plan") {
    const inputFile =
      args[1] && !args[1].startsWith("-") ? args[1] : "ROADMAP.md";
    await planRoadmap(inputFile);
  } else if (command === "new-team") {
    const nameIdx = args.indexOf("--name");
    const descIdx = args.indexOf("--description");
    const rolesIdx = args.indexOf("--roles");
    const noHumanReview = args.includes("--no-human-review");

    if (nameIdx === -1 || descIdx === -1 || rolesIdx === -1) {
      err(
        "Usage: agent-team new-team --name NAME --description DESC --roles ROLE1,ROLE2",
      );
    }

    await createTeam({
      name: args[nameIdx + 1] ?? "",
      description: args[descIdx + 1] ?? "",
      roles: args[rolesIdx + 1] ?? "",
      humanReview: !noHumanReview,
    });
  } else if (command === "update") {
    await updateProject({ sourceDir });
  } else if (command === "reconfigurate") {
    await reconfigureProject({ sourceDir });
  } else if (command === "validate") {
    const name = args[1];
    if (!name) err("Usage: agent-team validate NAME");
    validateTeam(name);
  } else if (command === "audit") {
    auditReport();
  } else {
    console.log("Claude Code Agent Team (Self-Contained TS Architecture)");
    console.log("Usage:");
    console.log(
      "  agent-team init [--team NAME] [--planner builtin|openspec] [--no-human-review]",
    );
    console.log(
      "  agent-team run [--all] [--dry-run] [--team NAME]    # Execute tasks",
    );
    console.log(
      "  agent-team plan [ROADMAP.md]                        # Decompose roadmap",
    );
    console.log(
      "  agent-team update                                    # Update project configs",
    );
    console.log(
      "  agent-team reconfigurate                             # Update skills & workflows",
    );
    console.log(
      "  agent-team new-team --name NAME --description DESC  # Create custom team",
    );
    console.log(
      "  agent-team validate NAME                             # Validate team structure",
    );
    console.log(
      "  agent-team audit                                     # Show audit report",
    );
    console.log(
      "  agent-team -h, --help                               # Show this help",
    );
    process.exit(0);
  }
}

main().catch((e) => {
  err(e.message);
});
