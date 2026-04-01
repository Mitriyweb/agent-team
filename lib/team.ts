import fs from "node:fs";
import path from "node:path";
import { BLUE, err, GREEN, log, NC, ok, warn } from "./common.ts";
// @ts-expect-error
import AGENT_TEMPLATE from "./templates/agent.md" with { type: "text" };
/**
 * Port of create_team logic from team.sh
 */
// @ts-expect-error
import PROTOCOL_TEMPLATE from "./templates/PROTOCOL.md" with { type: "text" };
import DEFAULT_SETTINGS from "./templates/settings.json" with { type: "json" };

const AGENTS_ROOT = "agents";

interface CreateTeamOptions {
  name: string;
  description: string;
  roles: string;
  humanReview?: boolean;
}

export async function createTeam(options: CreateTeamOptions) {
  const { name, description, roles: rolesStr, humanReview = true } = options;

  if (!name) err("Team name is required (--name)");
  if (!description) err("Team description is required (--description)");
  if (!rolesStr) err("Roles are required (--roles)");

  const teamDir = path.join(AGENTS_ROOT, name);
  if (!fs.existsSync(teamDir)) {
    fs.mkdirSync(teamDir, { recursive: true });
  }

  let prefix = name.substring(0, 2).toLowerCase();
  if (prefix) prefix = `${prefix}-`;

  const protocolFile = path.join(teamDir, `${prefix}PROTOCOL.md`);
  let protocolContent = (PROTOCOL_TEMPLATE as string).replace(
    /{{TEAM_PREFIX}}/g,
    prefix,
  );
  if (!humanReview) {
    protocolContent = protocolContent
      .split("\n")
      .filter((line) => !line.includes("HUMAN_REVIEW"))
      .join("\n");
  }
  fs.writeFileSync(protocolFile, protocolContent);
  ok(`Created ${protocolFile}`);

  const roles = rolesStr.split(",").map((r) => r.trim());
  for (const role of roles) {
    const roleCap = role.charAt(0).toUpperCase() + role.slice(1);
    const agentFile = path.join(teamDir, `${prefix}${role}.md`);
    const agentContent = (AGENT_TEMPLATE as string)
      .replace(/{{AGENT_ROLE}}/g, roleCap)
      .replace(/{{AGENT_DESCRIPTION}}/g, description)
      .replace(/{{TEAM_NAME}}/g, name)
      .replace(/{{PROTOCOL_FILE}}/g, `${prefix}PROTOCOL.md`);
    fs.writeFileSync(agentFile, agentContent);
    ok(`Created ${agentFile}`);
  }

  const skillsDir = path.join(teamDir, "skills");
  if (!fs.existsSync(skillsDir)) fs.mkdirSync(skillsDir, { recursive: true });

  const claudeDir = path.join(teamDir, "claude");
  if (!fs.existsSync(claudeDir)) fs.mkdirSync(claudeDir, { recursive: true });

  fs.writeFileSync(
    path.join(claudeDir, "settings.json"),
    JSON.stringify(DEFAULT_SETTINGS, null, 2),
  );
  ok(`Copied default claude settings to ${claudeDir}/`);

  ok(`Team '${name}' successfully created in ${teamDir}`);
}

interface InitProjectOptions {
  teamName?: string;
  humanReview?: boolean;
  sourceDir?: string;
}

export async function initProject(options: InitProjectOptions) {
  const { teamName, humanReview = true, sourceDir = "." } = options;

  log("Initializing agent-team project...");

  const dirs = ["agents", "tasks", ".agents/workflows"];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  const srcWorkflows = path.join(sourceDir, ".agents/workflows");
  if (fs.existsSync(srcWorkflows)) {
    const files = fs.readdirSync(srcWorkflows);
    for (const file of files) {
      fs.copyFileSync(
        path.join(srcWorkflows, file),
        path.join(".agents/workflows", file),
      );
    }
    ok("Copied workflows to .agents/workflows/");
  }

  if (!fs.existsSync("MEMORY.md")) {
    const srcMemory = path.join(sourceDir, "MEMORY.md");
    if (fs.existsSync(srcMemory)) {
      fs.copyFileSync(srcMemory, "MEMORY.md");
    } else {
      fs.writeFileSync("MEMORY.md", "# Project Memory\n");
    }
    ok("Created MEMORY.md");
  }
  if (!fs.existsSync("ROADMAP.md")) {
    fs.writeFileSync("ROADMAP.md", "# Project Roadmap\n");
    ok("Created empty ROADMAP.md");
  }

  if (teamName) {
    const srcTeamDir = path.join(sourceDir, "agents", teamName);
    if (fs.existsSync(srcTeamDir)) {
      const targetTeamDir = path.join("agents", teamName);
      if (!fs.existsSync(targetTeamDir))
        fs.mkdirSync(targetTeamDir, { recursive: true });
      copyRecursiveSync(srcTeamDir, targetTeamDir);
      ok(`Initialized team: ${teamName}`);
    } else {
      warn(`Team '${teamName}' not found in ${sourceDir}/agents/`);
    }
  }

  if (!fs.existsSync(".claude")) fs.mkdirSync(".claude", { recursive: true });
  const targetSettings = path.join(".claude", "settings.json");

  let settingsSource = "";
  if (
    teamName &&
    fs.existsSync(
      path.join(sourceDir, "agents", teamName, "claude/settings.json"),
    )
  ) {
    settingsSource = path.join(
      sourceDir,
      "agents",
      teamName,
      "claude/settings.json",
    );
    ok(`Applying team-specific Claude settings for ${teamName}`);
  }

  if (settingsSource) {
    fs.copyFileSync(settingsSource, targetSettings);
  } else {
    fs.writeFileSync(targetSettings, JSON.stringify(DEFAULT_SETTINGS, null, 2));
    ok("Applying default Claude settings");
  }

  if (!humanReview && fs.existsSync(targetSettings)) {
    try {
      const settings = JSON.parse(fs.readFileSync(targetSettings, "utf-8"));
      if (!settings.permissions) settings.permissions = {};
      settings.permissions.defaultMode = "auto";
      fs.writeFileSync(targetSettings, JSON.stringify(settings, null, 2));
      ok(`Auto mode: ${GREEN}enabled${NC} (--no-human-review)`);
    } catch (e: unknown) {
      warn(
        `Failed to update ${targetSettings} for autoMode: ${(e as Error).message}`,
      );
    }
  }

  log("Finalizing project documentation for CLI...");
  const mdFiles = findFiles(".", 3, ".md");
  for (const file of mdFiles) {
    if (
      file.startsWith("./agents/") ||
      file.startsWith("./.agents/workflows/")
    ) {
      const content = fs.readFileSync(file, "utf-8");
      const original = content;
      const newContent = content
        .replace(/\.\/scripts\/run\.sh/g, "agent-team run")
        .replace(/\.\/scripts\/plan\.sh/g, "agent-team plan")
        .replace(/plan\.sh /g, "agent-team plan ")
        .replace(/run\.sh /g, "agent-team run ")
        .replace(/`plan\.sh`/g, "`agent-team plan`")
        .replace(/`run\.sh`/g, "`agent-team run`")
        .replace(/_common\.sh/g, "lib/common.ts");

      if (newContent !== original) {
        fs.writeFileSync(file, newContent);
      }
    }
  }

  ok("Project initialized successfully.");
  log(`Run ${BLUE}agent-team run --plan --all${NC} to start.`);
}

export function validateTeam(name: string) {
  const teamDir = path.join(AGENTS_ROOT, name);

  if (!fs.existsSync(teamDir)) {
    err(`Team '${name}' not found at ${teamDir}`);
  }

  log(`Validating team: ${BLUE}${name}${NC}`);
  let errors = 0;

  const files = fs.readdirSync(teamDir);
  const protocolExists = files.some((f) => f.endsWith("PROTOCOL.md"));
  if (!protocolExists) {
    warn(`Missing PROTOCOL.md in ${teamDir}`);
    errors++;
  }

  const agentProfiles = files.filter(
    (f) => f.endsWith(".md") && !f.endsWith("PROTOCOL.md"),
  );
  if (agentProfiles.length === 0) {
    warn(`No agent profiles found in ${teamDir}`);
    errors++;
  }

  for (const agentFile of agentProfiles) {
    const fullPath = path.join(teamDir, agentFile);
    const content = fs.readFileSync(fullPath, "utf-8");
    if (!content.match(/^# /m)) {
      warn(`Agent file ${agentFile} missing H1 title`);
      errors++;
    }
    if (!content.match(/^## Instructions/m)) {
      warn(`Agent file ${agentFile} missing '## Instructions' section`);
      errors++;
    }
  }

  if (errors > 0) {
    err(`Team validation failed with ${errors} error(s)`);
  } else {
    ok(`Team '${name}' is valid`);
  }
}

function copyRecursiveSync(src: string, dest: string) {
  if (!fs.existsSync(src)) return;
  const stats = fs.statSync(src);
  if (stats.isDirectory()) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest);
    fs.readdirSync(src).forEach((childItemName) => {
      copyRecursiveSync(
        path.join(src, childItemName),
        path.join(dest, childItemName),
      );
    });
  } else {
    fs.copyFileSync(src, dest);
  }
}

function findFiles(
  dir: string,
  maxDepth: number,
  extension: string,
  currentDepth = 0,
): string[] {
  if (currentDepth > maxDepth) return [];
  let results: string[] = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    if (file === "node_modules" || file === ".git" || file === "dist") continue;
    const fullPath = path.join(dir, file);
    if (!fs.existsSync(fullPath)) continue;
    const stat = fs.statSync(fullPath);
    if (stat?.isDirectory()) {
      results = results.concat(
        findFiles(fullPath, maxDepth, extension, currentDepth + 1),
      );
    } else {
      if (file.endsWith(extension)) results.push(fullPath);
    }
  }
  return results;
}
