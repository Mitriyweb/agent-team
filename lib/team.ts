import fs from "node:fs";
import path from "node:path";
import * as p from "@clack/prompts";
import {
  BLUE,
  type ExternalReviewAgent,
  err,
  expandHome,
  GREEN,
  loadConfig,
  log,
  NC,
  ok,
  type ProjectConfig,
  saveConfig,
  type TelegramConfig,
  warn,
} from "./common.ts";
import { EMBEDDED_TEAM_NAMES, EMBEDDED_TEAMS } from "./embedded-agents.ts";
import {
  promptExternalReview,
  promptTelegram,
  promptVault,
} from "./prompts.ts";
import AGENT_TEMPLATE from "./templates/agent.md" with { type: "text" };
/**
 * Port of create_team logic from team.sh
 */
import LIBRARIAN_TEMPLATE from "./templates/librarian.md" with { type: "text" };
import MEMORY_TEMPLATE from "./templates/memory.md" with { type: "text" };
import PROTOCOL_TEMPLATE from "./templates/PROTOCOL.md" with { type: "text" };
import DEFAULT_SETTINGS from "./templates/settings.json" with { type: "json" };

const CLAUDE_AGENTS_DIR = path.join(".claude", "agents");

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

  if (!fs.existsSync(CLAUDE_AGENTS_DIR)) {
    fs.mkdirSync(CLAUDE_AGENTS_DIR, { recursive: true });
  }

  let prefix = name.substring(0, 2).toLowerCase();
  if (prefix) prefix = `${prefix}-`;

  const protocolFile = path.join(CLAUDE_AGENTS_DIR, `${prefix}PROTOCOL.md`);
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
    const agentFile = path.join(CLAUDE_AGENTS_DIR, `${prefix}${role}.md`);
    const agentContent = (AGENT_TEMPLATE as string)
      .replace(/{{AGENT_ROLE}}/g, roleCap)
      .replace(/{{AGENT_DESCRIPTION}}/g, description)
      .replace(/{{TEAM_NAME}}/g, name)
      .replace(/{{PROTOCOL_FILE}}/g, `${prefix}PROTOCOL.md`);
    fs.writeFileSync(agentFile, agentContent);
    ok(`Created ${agentFile}`);
  }

  const skillsDir = path.join(CLAUDE_AGENTS_DIR, "skills");
  if (!fs.existsSync(skillsDir)) fs.mkdirSync(skillsDir, { recursive: true });

  ok(`Team '${name}' created in ${CLAUDE_AGENTS_DIR}`);
}

interface InitProjectOptions {
  teamName?: string;
  humanReview?: boolean;
  sourceDir?: string;
  planner?: "builtin" | "openspec";
  vaultPath?: string;
  externalReview?: string;
  telegram?: TelegramConfig;
}

export async function initProject(options: InitProjectOptions) {
  const {
    teamName,
    humanReview = true,
    sourceDir = ".",
    planner = "builtin",
    vaultPath,
    externalReview,
    telegram,
  } = options;

  log("Initializing agent-team project...");

  const dirs = [CLAUDE_AGENTS_DIR, "tasks"];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  // Update .gitignore with agent-team artifacts
  const gitignoreEntries = [
    "# Agent team artifacts",
    ".claude-loop/",
    "tasks/",
    ".agents/",
    ".claude/vault",
    "*.log",
    ".DS_Store",
    "settings.local.json",
  ];
  const gitignorePath = ".gitignore";
  const existingGitignore = fs.existsSync(gitignorePath)
    ? fs.readFileSync(gitignorePath, "utf-8")
    : "";
  const existingLines = new Set(existingGitignore.split("\n"));
  const newEntries = gitignoreEntries.filter((e) => !existingLines.has(e));
  if (newEntries.length > 0) {
    const separator =
      existingGitignore.endsWith("\n") || !existingGitignore ? "" : "\n";
    fs.appendFileSync(gitignorePath, `${separator}${newEntries.join("\n")}\n`);
  }
  ok("Updated .gitignore");

  // Save project config (including team name for detection on re-init)
  const config: ProjectConfig = { ...loadConfig(), planner };
  if (teamName) config.team = teamName;
  if (vaultPath) config.vaultPath = vaultPath;
  if (externalReview) {
    config.externalReview = { agent: externalReview as ExternalReviewAgent };
  }
  if (telegram) {
    config.telegram = telegram;
  }
  saveConfig(config);

  // Manage Obsidian vault symlink
  manageVaultSymlink(vaultPath);
  ok(`Planner: ${planner === "openspec" ? "OpenSpec" : "built-in"}`);

  // Initialize OpenSpec if selected
  if (planner === "openspec") {
    try {
      const proc = Bun.spawnSync(
        [
          "npx",
          "--no-install",
          "@fission-ai/openspec",
          "init",
          "--tools",
          "claude",
        ],
        {
          stdio: ["inherit", "inherit", "inherit"],
        },
      );
      if (proc.success) {
        ok("OpenSpec initialized");
      } else {
        err(
          "OpenSpec is not installed. Install with: npm i -g @fission-ai/openspec",
        );
      }
    } catch {
      err(
        "OpenSpec is not installed. Install with: npm i -g @fission-ai/openspec",
      );
    }
  }

  const loopDir = ".claude-loop";
  if (!fs.existsSync(loopDir)) fs.mkdirSync(loopDir, { recursive: true });
  const memoryFile = path.join(loopDir, "memory.md");
  if (!fs.existsSync(memoryFile)) {
    fs.writeFileSync(memoryFile, MEMORY_TEMPLATE as string);
    ok(`Created ${memoryFile}`);
  }
  // Migrate legacy MEMORY.md if present
  if (fs.existsSync("MEMORY.md")) {
    const legacy = fs.readFileSync("MEMORY.md", "utf-8").trim();
    if (legacy && legacy !== "# Project Memory") {
      fs.appendFileSync(
        memoryFile,
        `\n${legacy.replace("# Project Memory\n", "")}`,
      );
    }
    fs.unlinkSync("MEMORY.md");
    ok("Migrated MEMORY.md → .claude-loop/memory.md");
  }
  if (!fs.existsSync("ROADMAP.md")) {
    fs.writeFileSync("ROADMAP.md", "# Project Roadmap\n");
    ok("Created empty ROADMAP.md");
  }

  // Detect existing team and ask for confirmation before overwriting
  if (teamName && fs.existsSync(CLAUDE_AGENTS_DIR)) {
    const existingTeam = getInstalledTeam();
    if (existingTeam && existingTeam !== teamName) {
      const confirmed = await p.confirm({
        message: `Replace existing team "${existingTeam}" with "${teamName}"?`,
      });
      if (p.isCancel(confirmed) || !confirmed) {
        p.cancel("Init cancelled.");
        return;
      }
      // Clean .claude/agents/ completely
      fs.rmSync(CLAUDE_AGENTS_DIR, { recursive: true, force: true });
      fs.mkdirSync(CLAUDE_AGENTS_DIR, { recursive: true });
      ok(`Removed team: ${existingTeam}`);
    }
  }

  if (teamName) {
    if (!fs.existsSync(CLAUDE_AGENTS_DIR))
      fs.mkdirSync(CLAUDE_AGENTS_DIR, { recursive: true });

    const srcTeamDir = path.join(sourceDir, "agents", teamName);

    if (fs.existsSync(srcTeamDir)) {
      // Copy from source directory (dev mode / bun run) — flat into .claude/agents/
      copyTeamFlat(srcTeamDir, CLAUDE_AGENTS_DIR);
      ok(`Initialized team: ${teamName}`);
    } else if (EMBEDDED_TEAMS[teamName]) {
      // Extract from embedded bundle (compiled binary) — flat into .claude/agents/
      extractEmbeddedTeam(teamName, CLAUDE_AGENTS_DIR);
      ok(`Initialized team: ${teamName}`);
    } else {
      const available = [
        ...new Set([...listSourceTeams(sourceDir), ...EMBEDDED_TEAM_NAMES]),
      ];
      warn(`Team '${teamName}' not found. Available: ${available.join(", ")}`);
    }
  }

  if (!fs.existsSync(".claude")) fs.mkdirSync(".claude", { recursive: true });
  const targetSettings = path.join(".claude", "settings.json");

  // Find settings.json — now lives flat in .claude/agents/ or source agents/
  let settingsSource = "";
  if (teamName) {
    const agentSettings = path.join(CLAUDE_AGENTS_DIR, "settings.json");
    const srcSettings = path.join(
      sourceDir,
      "agents",
      teamName,
      "settings.json",
    );
    if (fs.existsSync(agentSettings)) {
      settingsSource = agentSettings;
    } else if (fs.existsSync(srcSettings)) {
      settingsSource = srcSettings;
    }
    if (settingsSource) {
      ok(`Applying team-specific Claude settings for ${teamName}`);
    }
  }

  if (settingsSource) {
    fs.copyFileSync(settingsSource, targetSettings);
  } else {
    fs.writeFileSync(targetSettings, JSON.stringify(DEFAULT_SETTINGS, null, 2));
    ok("Applying default Claude settings");
  }

  // Clean up: settings.json should only live in .claude/, not in .claude/agents/
  const leftoverSettings = path.join(CLAUDE_AGENTS_DIR, "settings.json");
  if (fs.existsSync(leftoverSettings)) fs.rmSync(leftoverSettings);

  // Deploy cross-team librarian agent
  const librarianPath = path.join(CLAUDE_AGENTS_DIR, "librarian.md");
  fs.writeFileSync(librarianPath, LIBRARIAN_TEMPLATE as string);
  ok("Deployed librarian agent");

  if (!humanReview && fs.existsSync(targetSettings)) {
    try {
      const settings = JSON.parse(fs.readFileSync(targetSettings, "utf-8"));
      if (!settings.permissions) settings.permissions = {};
      settings.permissions.defaultMode = "auto";
      // Set auto mode for all agent profiles too
      if (settings.profiles) {
        for (const profile of Object.values(settings.profiles)) {
          const p = profile as { permissions?: { defaultMode?: string } };
          if (p.permissions) p.permissions.defaultMode = "auto";
        }
      }
      fs.writeFileSync(targetSettings, JSON.stringify(settings, null, 2));
      ok(`Auto mode: ${GREEN}enabled${NC} (--no-human-review)`);
    } catch (e: unknown) {
      warn(
        `Failed to update ${targetSettings} for autoMode: ${(e as Error).message}`,
      );
    }
  }

  log("Finalizing project documentation for CLI...");
  const mdFiles = findFiles(".claude/agents", 4, ".md");
  for (const file of mdFiles) {
    if (file.startsWith(".claude/agents/")) {
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

  // Generate CLAUDE.md with agent-team context
  generateClaudeMd(teamName);

  ok("Project initialized successfully.");
  log(`Run ${BLUE}agent-team run --plan --all${NC} to start.`);
}

const CLAUDE_MD_START = "<!-- agent-team:start -->";
const CLAUDE_MD_END = "<!-- agent-team:end -->";

function generateClaudeMd(teamName?: string) {
  const claudeMdPath = "CLAUDE.md";

  // Read installed agents and protocol
  const agents: { name: string; description: string }[] = [];
  let protocolContent = "";
  if (fs.existsSync(CLAUDE_AGENTS_DIR)) {
    for (const file of fs.readdirSync(CLAUDE_AGENTS_DIR)) {
      if (!file.endsWith(".md")) continue;
      const fullPath = path.join(CLAUDE_AGENTS_DIR, file);
      const content = fs.readFileSync(fullPath, "utf-8");
      if (file.endsWith("PROTOCOL.md")) {
        protocolContent = content;
        continue;
      }
      const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
      if (!fmMatch?.[1]) continue;
      const nameMatch = fmMatch[1].match(/^name:\s*(.+)$/m);
      const descMatch = fmMatch[1].match(/^description:\s*(.+)$/m);
      if (nameMatch?.[1]) {
        agents.push({
          name: nameMatch[1].trim(),
          description: descMatch?.[1]?.trim() || "",
        });
      }
    }
  }

  const teamLabel = teamName || "development";
  const agentList = agents
    .map((a) => `- **${a.name}**: ${a.description}`)
    .join("\n");

  // Extract key sections from protocol
  let protocolSection = "";
  if (protocolContent) {
    protocolSection = extractProtocolSections(protocolContent);
  }

  const block = `${CLAUDE_MD_START}
# Agent Team: ${teamLabel}

## Team agents

${agentList || "No agents installed."}
${protocolSection}
## Shared memory

Read \`.claude-loop/memory.md\` before starting any task — it contains decisions and context from previous tasks.
After completing work, append findings to \`.claude-loop/memory.md\` using format: \`## Task #N: Title\`

The **librarian** agent runs automatically after each completed task to curate memory:
- Extracts decisions, errors, patterns, and gotchas from task reports
- Updates structured sections in \`memory.md\` (Patterns & Decisions, Known Errors & Gotchas, Session Log)
- Syncs agent-specific gotchas to \`.claude/agents/skills/\`

## External Review
${(() => {
  const cfg = loadConfig();
  if (cfg.externalReview) {
    return `\nAll code produced by agents will be independently reviewed by agent ${cfg.externalReview.agent} after each task completion.\nDo NOT skip or bypass this review step — it is mandatory when external review is enabled.\n`;
  }
  return "";
})()}
## Reports

- Task reports: .claude-loop/reports/task-{id}.md
- Task logs: .claude-loop/logs/
- Audit trail: .claude-loop/audit/audit.jsonl

## Commands

- \`agent-team run --all\` — execute all pending tasks
- \`agent-team plan [FILE]\` — decompose a roadmap into tasks
- \`agent-team audit\` — show audit report
${CLAUDE_MD_END}`;

  function extractProtocolSections(protocol: string): string {
    // Split protocol into sections by ## headers
    const sections = new Map<string, string>();
    const lines = protocol.split("\n");
    let currentHeader = "";
    let currentBody: string[] = [];

    for (const line of lines) {
      const headerMatch = line.match(/^## (.+)/);
      if (headerMatch?.[1]) {
        if (currentHeader) {
          sections.set(currentHeader, currentBody.join("\n").trim());
        }
        currentHeader = headerMatch[1];
        currentBody = [];
      } else {
        currentBody.push(line);
      }
    }
    if (currentHeader) {
      sections.set(currentHeader, currentBody.join("\n").trim());
    }

    let result = "";

    // Include Communication Graph with bullet explanations
    const graph = sections.get("Communication Graph");
    if (graph) {
      result += `\n## Communication Graph\n\n${graph}\n`;
    }

    // Include Message Types
    const messages = sections.get("Message Types");
    if (messages) {
      result += `\n## Message Types\n\n${messages}\n`;
    }

    // Include Handoff Summary
    const handoff = sections.get("Handoff Summary");
    if (handoff) {
      result += `\n## Handoff Summary\n\n${handoff}\n`;
    }

    // Include Tool Detection
    const tools = sections.get("Tool Detection");
    if (tools) {
      result += `\n## Tool Detection\n\n${tools}\n`;
    }

    return result;
  }

  if (fs.existsSync(claudeMdPath)) {
    const existing = fs.readFileSync(claudeMdPath, "utf-8");
    if (existing.includes(CLAUDE_MD_START)) {
      // Replace existing managed block
      const regex = new RegExp(`${CLAUDE_MD_START}[\\s\\S]*?${CLAUDE_MD_END}`);
      fs.writeFileSync(claudeMdPath, existing.replace(regex, block));
    } else {
      // Append managed block
      const separator = existing.endsWith("\n") ? "\n" : "\n\n";
      fs.appendFileSync(claudeMdPath, `${separator}${block}\n`);
    }
  } else {
    fs.writeFileSync(claudeMdPath, `${block}\n`);
  }
  ok("Updated CLAUDE.md with agent-team context");
}

export function validateTeam(_name: string) {
  if (!fs.existsSync(CLAUDE_AGENTS_DIR)) {
    err(`Agents directory not found: ${CLAUDE_AGENTS_DIR}`);
  }

  const installed = getInstalledTeam() || _name;
  log(`Validating team: ${BLUE}${installed}${NC}`);
  let errors = 0;

  const files = fs.readdirSync(CLAUDE_AGENTS_DIR);
  const protocolExists = files.some((f) => f.endsWith("PROTOCOL.md"));
  if (!protocolExists) {
    warn(`Missing PROTOCOL.md in ${CLAUDE_AGENTS_DIR}`);
    errors++;
  }

  const agentProfiles = files.filter(
    (f) =>
      f.endsWith(".md") && !f.endsWith("PROTOCOL.md") && f !== "librarian.md",
  );
  if (agentProfiles.length === 0) {
    warn(`No agent profiles found in ${CLAUDE_AGENTS_DIR}`);
    errors++;
  }

  for (const agentFile of agentProfiles) {
    const fullPath = path.join(CLAUDE_AGENTS_DIR, agentFile);
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
    ok(`Team '${installed}' is valid`);
  }
}

/**
 * Detect installed team by reading the project config.
 */
function getInstalledTeam(): string | undefined {
  try {
    const configFile = "agent-team.json";
    if (!fs.existsSync(configFile)) return undefined;
    const data = JSON.parse(fs.readFileSync(configFile, "utf-8"));
    return data.team || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Copy team source dir contents flat into target (no team subfolder).
 */
function copyTeamFlat(srcTeamDir: string, targetDir: string) {
  copyRecursiveSync(srcTeamDir, targetDir);
}

export async function updateProject(options: { sourceDir?: string }) {
  const { sourceDir = "." } = options;
  log("Updating agent-team project...");

  const config = loadConfig();
  const teamName = config.team;

  // 1. Re-deploy team agents from source/embedded
  if (teamName) {
    if (!fs.existsSync(CLAUDE_AGENTS_DIR))
      fs.mkdirSync(CLAUDE_AGENTS_DIR, { recursive: true });

    const srcTeamDir = path.join(sourceDir, "agents", teamName);
    if (fs.existsSync(srcTeamDir)) {
      copyTeamFlat(srcTeamDir, CLAUDE_AGENTS_DIR);
      ok(`Updated agents from source: ${teamName}`);
    } else if (EMBEDDED_TEAMS[teamName]) {
      extractEmbeddedTeam(teamName, CLAUDE_AGENTS_DIR);
      ok(`Updated agents from bundle: ${teamName}`);
    }
  }

  // 2. Refresh .claude/settings.json
  if (!fs.existsSync(".claude")) fs.mkdirSync(".claude", { recursive: true });
  const targetSettings = path.join(".claude", "settings.json");
  const agentSettings = path.join(CLAUDE_AGENTS_DIR, "settings.json");
  if (fs.existsSync(agentSettings)) {
    fs.copyFileSync(agentSettings, targetSettings);
    fs.rmSync(agentSettings);
    ok("Refreshed .claude/settings.json");
  }

  // 2b. Deploy cross-team librarian agent
  if (!fs.existsSync(CLAUDE_AGENTS_DIR))
    fs.mkdirSync(CLAUDE_AGENTS_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(CLAUDE_AGENTS_DIR, "librarian.md"),
    LIBRARIAN_TEMPLATE as string,
  );
  ok("Updated librarian agent");

  // 3. Fix legacy references in agent docs
  const mdFiles = findFiles(CLAUDE_AGENTS_DIR, 4, ".md");
  for (const file of mdFiles) {
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

  // 4. Regenerate CLAUDE.md
  generateClaudeMd(teamName);

  ok("Project updated successfully.");
}

export async function reconfigureProject(options: { sourceDir?: string }) {
  const { sourceDir = "." } = options;
  log("Reconfiguring agent-team project...");

  const config = loadConfig();
  const teamName = config.team;
  if (!teamName) {
    warn("No team configured. Run agent-team init --team NAME first.");
    return;
  }

  // 1. Update vault, external review, and telegram (interactive)
  const answers = (await p.group(
    {
      vaultPath: async () => {
        const result = await promptVault(
          "Obsidian vault path for RAG (optional):",
          config.vaultPath,
          true,
        );
        if (p.isCancel(result)) return p.cancel();
        return result as string | undefined;
      },
      externalReview: async () => {
        return promptExternalReview(config.externalReview?.agent);
      },
    },
    {
      onCancel: () => {
        p.cancel("Reconfiguration cancelled.");
        process.exit(0);
      },
    },
  )) as {
    vaultPath: string | undefined;
    externalReview: ExternalReviewAgent | undefined;
  };

  const telegramConfig = await promptTelegram(config.telegram);

  const newVaultPath = answers.vaultPath;

  if (newVaultPath) {
    config.vaultPath = newVaultPath;
    manageVaultSymlink(config.vaultPath);
  } else if (!config.vaultPath) {
    manageVaultSymlink(undefined);
  } else {
    manageVaultSymlink(config.vaultPath);
  }

  // Update external review config
  if (answers.externalReview) {
    config.externalReview = { agent: answers.externalReview };
  } else {
    delete config.externalReview;
  }

  // Update telegram config
  if (telegramConfig) {
    config.telegram = telegramConfig;
    ok("Telegram notifications enabled");
  } else {
    delete config.telegram;
  }
  saveConfig(config);

  // 2. Update skills and scripts from source
  log("Updating skills and scripts...");
  const srcTeamDir = path.join(sourceDir, "agents", teamName);
  if (!fs.existsSync(srcTeamDir) && !EMBEDDED_TEAMS[teamName]) {
    warn(`Team source not found: ${teamName}`);
    return;
  }

  const targetSkills = path.join(CLAUDE_AGENTS_DIR, "skills");
  const targetScripts = path.join(CLAUDE_AGENTS_DIR, "scripts");

  if (fs.existsSync(srcTeamDir)) {
    // From source dir
    const srcSkills = path.join(srcTeamDir, "skills");
    const srcScripts = path.join(srcTeamDir, "scripts");
    if (fs.existsSync(srcSkills)) {
      if (!fs.existsSync(targetSkills))
        fs.mkdirSync(targetSkills, { recursive: true });
      copyRecursiveSync(srcSkills, targetSkills);
      ok("Updated skills");
    }
    if (fs.existsSync(srcScripts)) {
      if (!fs.existsSync(targetScripts))
        fs.mkdirSync(targetScripts, { recursive: true });
      copyRecursiveSync(srcScripts, targetScripts);
      ok("Updated scripts");
    }
  } else if (EMBEDDED_TEAMS[teamName]) {
    // From embedded bundle — extract only skills/ and scripts/
    const prefix = `${teamName}/`;
    const files = EMBEDDED_TEAMS[teamName];
    for (const [relPath, file] of Object.entries(files)) {
      const stripped = relPath.startsWith(prefix)
        ? relPath.slice(prefix.length)
        : relPath;
      if (!stripped.startsWith("skills/") && !stripped.startsWith("scripts/"))
        continue;
      const fullPath = path.join(CLAUDE_AGENTS_DIR, stripped);
      const dir = path.dirname(fullPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      if (file.isBinary) {
        fs.writeFileSync(fullPath, Buffer.from(file.content, "base64"));
      } else {
        fs.writeFileSync(fullPath, file.content);
      }
    }
    ok("Updated skills and scripts from bundle");
  }

  // Regenerate CLAUDE.md with updated config (e.g. external review)
  generateClaudeMd(teamName);

  ok("Project reconfigured successfully.");
}

function copyRecursiveSync(src: string, dest: string) {
  if (!fs.existsSync(src)) return;
  const stats = fs.statSync(src);
  if (stats.isDirectory()) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest);
    fs.readdirSync(src).forEach((childItemName) => {
      if (childItemName === ".obsidian") return;
      copyRecursiveSync(
        path.join(src, childItemName),
        path.join(dest, childItemName),
      );
    });
  } else {
    fs.copyFileSync(src, dest);
  }
}

function extractEmbeddedTeam(teamName: string, targetDir: string) {
  const files = EMBEDDED_TEAMS[teamName];
  if (!files) return;
  const prefix = `${teamName}/`;
  for (const [relPath, file] of Object.entries(files)) {
    // Strip team name prefix — files go flat into targetDir
    const stripped = relPath.startsWith(prefix)
      ? relPath.slice(prefix.length)
      : relPath;
    const fullPath = path.join(targetDir, stripped);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (file.isBinary) {
      fs.writeFileSync(fullPath, Buffer.from(file.content, "base64"));
    } else {
      fs.writeFileSync(fullPath, file.content);
    }
  }
}

function listSourceTeams(sourceDir: string): string[] {
  const agentsDir = path.join(sourceDir, "agents");
  if (!fs.existsSync(agentsDir)) return [];
  return fs
    .readdirSync(agentsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
}

/**
 * Create or update a symlink at .claude/vault pointing to the Obsidian vault.
 */
export function manageVaultSymlink(vaultPath?: string) {
  const vaultLink = path.join(".claude", "vault");
  const expanded = vaultPath ? expandHome(vaultPath) : undefined;

  // Remove existing link/file if it exists
  try {
    if (
      fs.existsSync(vaultLink) ||
      fs.lstatSync(vaultLink, { throwIfNoEntry: false })
    ) {
      fs.unlinkSync(vaultLink);
    }
  } catch (e: unknown) {
    // Ignore error if it doesn't exist, otherwise warn
    // biome-ignore lint/suspicious/noExplicitAny: error code check
    if ((e as any).code !== "ENOENT") {
      warn(`Failed to remove existing vault link: ${(e as Error).message}`);
    }
  }

  if (expanded) {
    const absoluteVaultPath = path.resolve(expanded);
    if (fs.existsSync(absoluteVaultPath)) {
      try {
        if (!fs.existsSync(".claude"))
          fs.mkdirSync(".claude", { recursive: true });
        fs.symlinkSync(absoluteVaultPath, vaultLink);
        ok(`Connected Obsidian vault: ${BLUE}${vaultPath}${NC}`);
      } catch (e: unknown) {
        warn(`Failed to create symlink to vault: ${(e as Error).message}`);
      }
    } else {
      warn(`Obsidian vault path not found: ${vaultPath}`);
    }
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
