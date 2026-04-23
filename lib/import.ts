/**
 * Import rules and workflows from other AI coding tools
 * into agent-team configuration.
 *
 * Supported sources:
 * - .windsurf/  (Windsurf rules)
 * - .cursor/    (Cursor rules)
 * - .github/    (GitHub Copilot instructions)
 * - .claude/    (another Claude Code project)
 */

import fs from "node:fs";
import path from "node:path";
import {
  BLUE,
  CYAN,
  err,
  GREEN,
  ImportSource,
  log,
  NC,
  ok,
  RuleTrigger,
  warn,
} from "./common.ts";

interface ImportedRule {
  name: string;
  description: string;
  trigger: RuleTrigger;
  glob?: string;
  body: string;
  source: string;
}

/**
 * Main import entry point.
 * Detects source type from the path and converts to agent-team format.
 */
export async function importConfig(sourcePath: string) {
  if (!fs.existsSync(sourcePath)) {
    err(`Source not found: ${sourcePath}`);
  }

  const basename = path.basename(sourcePath);
  let rules: ImportedRule[] = [];

  if (
    basename === ImportSource.Windsurf ||
    sourcePath.endsWith(ImportSource.Windsurf)
  ) {
    rules = importWindsurf(sourcePath);
  } else if (
    basename === ImportSource.Cursor ||
    sourcePath.endsWith(ImportSource.Cursor)
  ) {
    rules = importCursor(sourcePath);
  } else if (
    basename === ImportSource.Github ||
    sourcePath.endsWith(ImportSource.Github)
  ) {
    rules = importCopilot(sourcePath);
  } else if (
    basename === ImportSource.Claude ||
    sourcePath.endsWith(ImportSource.Claude)
  ) {
    rules = importClaude(sourcePath);
  } else if (
    fs.existsSync(path.join(sourcePath, ImportSource.Windsurf)) ||
    fs.existsSync(path.join(sourcePath, ".windsurfrules"))
  ) {
    // Path is a project root, detect tool
    const wsDir = path.join(sourcePath, ImportSource.Windsurf);
    if (fs.existsSync(wsDir)) {
      rules = importWindsurf(wsDir);
    } else {
      rules = importWindsurfLegacy(path.join(sourcePath, ".windsurfrules"));
    }
  } else if (fs.existsSync(path.join(sourcePath, ImportSource.Cursor))) {
    rules = importCursor(path.join(sourcePath, ImportSource.Cursor));
  } else if (fs.existsSync(path.join(sourcePath, ImportSource.Github))) {
    rules = importCopilot(path.join(sourcePath, ImportSource.Github));
  } else {
    err(
      `Cannot detect source type from: ${sourcePath}\nSupported: ${ImportSource.Windsurf}, ${ImportSource.Cursor}, ${ImportSource.Github}, ${ImportSource.Claude}`,
    );
  }

  if (rules.length === 0) {
    warn("No rules found to import.");
    return;
  }

  log(`Found ${GREEN}${rules.length}${NC} rules to import`);

  // Write rules to .claude/rules/
  const rulesDir = path.join(".claude", "rules");
  if (!fs.existsSync(rulesDir)) fs.mkdirSync(rulesDir, { recursive: true });

  // Append always-on rules to CLAUDE.md
  const alwaysRules = rules.filter((r) => r.trigger === RuleTrigger.Always);
  const otherRules = rules.filter((r) => r.trigger !== RuleTrigger.Always);

  if (alwaysRules.length > 0) {
    appendToClaudeMd(alwaysRules);
    ok(`Added ${alwaysRules.length} always-on rule(s) to CLAUDE.md`);
  }

  for (const rule of otherRules) {
    const fileName = `${sanitizeFileName(rule.name)}.md`;
    const filePath = path.join(rulesDir, fileName);
    const content = buildRuleFile(rule);
    fs.writeFileSync(filePath, content);
    ok(
      `  ${CYAN}${fileName}${NC} ← ${rule.source} (${rule.trigger}${rule.glob ? `: ${rule.glob}` : ""})`,
    );
  }

  log(
    `\nImported ${GREEN}${rules.length}${NC} rules from ${BLUE}${basename}${NC}`,
  );
}

// --- Windsurf ---

function importWindsurf(wsDir: string): ImportedRule[] {
  const rules: ImportedRule[] = [];
  const rulesDir = path.join(wsDir, "rules");

  if (fs.existsSync(rulesDir)) {
    for (const file of fs.readdirSync(rulesDir)) {
      if (!file.endsWith(".md")) continue;
      const content = fs.readFileSync(path.join(rulesDir, file), "utf-8");
      const parsed = parseFrontmatter(content);

      const trigger = mapWindsurfTrigger(parsed.frontmatter.trigger);
      rules.push({
        name: path.basename(file, ".md"),
        description: parsed.frontmatter.description || "",
        trigger,
        glob: parsed.frontmatter.glob,
        body: parsed.body,
        source: `.windsurf/rules/${file}`,
      });
    }
  }

  // Also check legacy .windsurfrules
  const legacyFile = path.join(path.dirname(wsDir), ".windsurfrules");
  if (fs.existsSync(legacyFile)) {
    rules.push(...importWindsurfLegacy(legacyFile));
  }

  return rules;
}

function importWindsurfLegacy(filePath: string): ImportedRule[] {
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, "utf-8");
  return [
    {
      name: "windsurfrules",
      description: "Imported from .windsurfrules",
      trigger: RuleTrigger.Always,
      body: content,
      source: ".windsurfrules",
    },
  ];
}

function mapWindsurfTrigger(trigger?: string): RuleTrigger {
  switch (trigger) {
    case "always_on":
      return RuleTrigger.Always;
    case "glob":
      return RuleTrigger.Glob;
    case "manual":
      return RuleTrigger.Manual;
    case "model_decision":
      return RuleTrigger.Manual;
    default:
      return RuleTrigger.Always;
  }
}

// --- Cursor ---

function importCursor(cursorDir: string): ImportedRule[] {
  const rules: ImportedRule[] = [];
  const rulesDir = path.join(cursorDir, "rules");

  if (fs.existsSync(rulesDir)) {
    for (const file of fs.readdirSync(rulesDir)) {
      if (!file.endsWith(".mdc") && !file.endsWith(".md")) continue;
      const content = fs.readFileSync(path.join(rulesDir, file), "utf-8");
      const parsed = parseFrontmatter(content);

      const alwaysApply =
        parsed.frontmatter.alwaysApply === true ||
        parsed.frontmatter.alwaysApply === "true";
      const globs = parsed.frontmatter.globs;

      let trigger: RuleTrigger;
      if (alwaysApply) {
        trigger = RuleTrigger.Always;
      } else if (globs) {
        trigger = RuleTrigger.Glob;
      } else {
        trigger = RuleTrigger.Manual;
      }

      rules.push({
        name: path.basename(file, path.extname(file)),
        description: parsed.frontmatter.description || "",
        trigger,
        glob: globs,
        body: parsed.body,
        source: `.cursor/rules/${file}`,
      });
    }
  }

  // Legacy .cursorrules
  const legacyFile = path.join(path.dirname(cursorDir), ".cursorrules");
  if (fs.existsSync(legacyFile)) {
    const content = fs.readFileSync(legacyFile, "utf-8");
    rules.push({
      name: "cursorrules",
      description: "Imported from .cursorrules",
      trigger: RuleTrigger.Always,
      body: content,
      source: ".cursorrules",
    });
  }

  return rules;
}

// --- GitHub Copilot ---

function importCopilot(githubDir: string): ImportedRule[] {
  const rules: ImportedRule[] = [];

  // Repo-wide instructions
  const repoInstructions = path.join(githubDir, "copilot-instructions.md");
  if (fs.existsSync(repoInstructions)) {
    const content = fs.readFileSync(repoInstructions, "utf-8");
    rules.push({
      name: "copilot-instructions",
      description: "Imported from .github/copilot-instructions.md",
      trigger: RuleTrigger.Always,
      body: content,
      source: ".github/copilot-instructions.md",
    });
  }

  // Agent instructions
  const agentInstructions = path.join(githubDir, "copilot", "AGENT.md");
  if (fs.existsSync(agentInstructions)) {
    const content = fs.readFileSync(agentInstructions, "utf-8");
    rules.push({
      name: "copilot-agent",
      description: "Imported from .github/copilot/AGENT.md",
      trigger: RuleTrigger.Always,
      body: content,
      source: ".github/copilot/AGENT.md",
    });
  }

  return rules;
}

// --- Claude (from another project) ---

function importClaude(claudeDir: string): ImportedRule[] {
  const rules: ImportedRule[] = [];

  // Import CLAUDE.md from project root
  const claudeMd = path.join(path.dirname(claudeDir), "CLAUDE.md");
  if (fs.existsSync(claudeMd)) {
    const content = fs.readFileSync(claudeMd, "utf-8");
    // Strip any existing agent-team managed block
    const cleaned = content
      .replace(/<!-- agent-team:start -->[\s\S]*?<!-- agent-team:end -->/g, "")
      .trim();
    if (cleaned) {
      rules.push({
        name: "claude-project-rules",
        description: "Imported from CLAUDE.md",
        trigger: RuleTrigger.Always,
        body: cleaned,
        source: "CLAUDE.md",
      });
    }
  }

  // Import .claude/rules/*.md
  const rulesDir = path.join(claudeDir, "rules");
  if (fs.existsSync(rulesDir)) {
    for (const file of fs.readdirSync(rulesDir)) {
      if (!file.endsWith(".md")) continue;
      const content = fs.readFileSync(path.join(rulesDir, file), "utf-8");
      rules.push({
        name: path.basename(file, ".md"),
        description: `Imported from .claude/rules/${file}`,
        trigger: RuleTrigger.Always,
        body: content,
        source: `.claude/rules/${file}`,
      });
    }
  }

  return rules;
}

// --- Helpers ---

function parseFrontmatter(content: string): {
  // biome-ignore lint/suspicious/noExplicitAny: frontmatter is dynamic
  frontmatter: Record<string, any>;
  body: string;
} {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!fmMatch) {
    return { frontmatter: {}, body: content };
  }

  // biome-ignore lint/suspicious/noExplicitAny: frontmatter is dynamic
  const frontmatter: Record<string, any> = {};
  for (const line of (fmMatch[1] || "").split("\n")) {
    const match = line.match(/^(\w+):\s*(.+)$/);
    if (match?.[1] && match[2]) {
      let value: string | boolean = match[2].trim();
      if (value === "true") value = true;
      else if (value === "false") value = false;
      else if (value.startsWith('"') && value.endsWith('"'))
        value = value.slice(1, -1);
      frontmatter[match[1]] = value;
    }
  }

  return { frontmatter, body: (fmMatch[2] || "").trim() };
}

function sanitizeFileName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function buildRuleFile(rule: ImportedRule): string {
  let content = `# ${rule.name}\n\n`;
  if (rule.description) {
    content += `> ${rule.description}\n\n`;
  }
  if (rule.source) {
    content += `> Imported from: ${rule.source}\n\n`;
  }
  content += rule.body;
  return content;
}

const IMPORT_START = "<!-- agent-team:import-start -->";
const IMPORT_END = "<!-- agent-team:import-end -->";

function appendToClaudeMd(rules: ImportedRule[]) {
  const claudeMdPath = "CLAUDE.md";

  let block = `${IMPORT_START}\n`;
  block += "## Imported Rules\n\n";
  for (const rule of rules) {
    block += `### ${rule.name}\n\n`;
    if (rule.source) {
      block += `> Source: ${rule.source}\n\n`;
    }
    block += `${rule.body}\n\n`;
  }
  block += IMPORT_END;

  if (fs.existsSync(claudeMdPath)) {
    const existing = fs.readFileSync(claudeMdPath, "utf-8");
    if (existing.includes(IMPORT_START)) {
      const regex = new RegExp(`${IMPORT_START}[\\s\\S]*?${IMPORT_END}`);
      fs.writeFileSync(claudeMdPath, existing.replace(regex, block));
    } else {
      const separator = existing.endsWith("\n") ? "\n" : "\n\n";
      fs.appendFileSync(claudeMdPath, `${separator}${block}\n`);
    }
  } else {
    fs.writeFileSync(claudeMdPath, `${block}\n`);
  }
}
