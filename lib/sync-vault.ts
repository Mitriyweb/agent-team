/**
 * sync-vault.ts
 * Syncs markdown documents (agents, specs, etc.) to an Obsidian vault.
 *
 * Walks the source directory, parses frontmatter from each .md file,
 * and generates interlinked Obsidian notes with Dataview metadata.
 *
 * Supports two document types:
 *   - **agent**: has `name`, `model`, `tools` in frontmatter
 *   - **spec**: any other .md file (with or without frontmatter)
 */

import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative } from "node:path";
import { ok, VaultDocType, warn } from "./common.ts";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AgentFrontmatter {
  name: string;
  description: string;
  model: string;
  tools: string[];
}

interface DocFile {
  type: VaultDocType;
  /** Display name (agent name or spec title) */
  name: string;
  frontmatter: Record<string, string | string[] | undefined>;
  body: string;
  /** e.g. "software development" or "api" */
  relativePath: string;
  /** sub-agents mentioned in the Team table (agents only) */
  teamMembers: string[];
  /** skills referenced */
  skills: string[];
  /** wikilink targets extracted from [[...]] (specs) */
  wikilinks: string[];
}

// ── Frontmatter parser ────────────────────────────────────────────────────────

function parseRawFrontmatter(raw: string): {
  fields: Record<string, string>;
  body: string;
} | null {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return null;

  const fmRaw = match[1] ?? "";
  const body = match[2] ?? "";

  const lines = fmRaw.split("\n");
  const fields: Record<string, string> = {};
  let currentKey = "";

  for (const line of lines) {
    const keyMatch = line.match(/^(\w[\w-]*):\s*(.*)$/);
    if (keyMatch) {
      currentKey = keyMatch[1] ?? "";
      fields[currentKey] = (keyMatch[2] ?? "").trim();
    } else if (currentKey && line.trim()) {
      fields[currentKey] += ` ${line.trim()}`;
    }
  }

  return { fields, body };
}

function isAgentFrontmatter(
  fields: Record<string, string>,
): fields is Record<string, string> & { name: string; model: string } {
  return Boolean(fields.name && fields.model);
}

function parseAgentFrontmatter(
  fields: Record<string, string>,
): AgentFrontmatter {
  const toolsRaw = fields.tools ?? "";
  return {
    name: fields.name ?? "",
    description: fields.description ?? "",
    model: fields.model ?? "",
    tools: toolsRaw
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
  };
}

// ── Extract team members from markdown table ──────────────────────────────────

function extractTeamMembers(body: string): string[] {
  const members: string[] = [];
  const rowRe = /\|\s*`([a-z][a-z0-9-]+)`\s*\|/g;
  for (const m of body.matchAll(rowRe)) {
    members.push(m[1] ?? "");
  }
  return [...new Set(members.filter(Boolean))];
}

// ── Extract skills referenced ─────────────────────────────────────────────────

function extractSkills(body: string): string[] {
  const skills: string[] = [];
  const re = /`(skills\/[^`]+)`/g;
  for (const m of body.matchAll(re)) {
    skills.push(m[1] ?? "");
  }
  return [...new Set(skills.filter(Boolean))];
}

// ── Extract wikilinks [[target]] ─────────────────────────────────────────────

function extractWikilinks(body: string): string[] {
  const links: string[] = [];
  const re = /\[\[([^\]]+)\]\]/g;
  for (const m of body.matchAll(re)) {
    links.push(m[1] ?? "");
  }
  return [...new Set(links.filter(Boolean))];
}

// ── Derive a title from filename ─────────────────────────────────────────────

function titleFromFilename(filePath: string): string {
  return basename(filePath, ".md")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Find all .md files ──────────────────────────────────────────────────────

const SKIP_FILES = new Set(["PROTOCOL.md", "CLAUDE.md", "README.md"]);
const SKIP_DIRS = new Set(["skills", "node_modules", ".git"]);

async function findMarkdownFiles(dir: string): Promise<string[]> {
  const results: string[] = [];

  async function walk(current: string) {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        await walk(full);
      } else if (entry.name.endsWith(".md") && !SKIP_FILES.has(entry.name)) {
        results.push(full);
      }
    }
  }

  await walk(dir);
  return results;
}

// ── Generate Obsidian note for agent ─────────────────────────────────────────

function generateAgentNote(doc: DocFile): string {
  const fm = doc.frontmatter as unknown as AgentFrontmatter;
  const { body, teamMembers, skills, relativePath } = doc;

  const teamLinks = teamMembers.length
    ? teamMembers.map((m) => `- [[${m}]]`).join("\n")
    : "_none_";

  const skillLinks = skills.length
    ? skills.map((s) => `- \`${s}\``).join("\n")
    : "_none_";

  const tools = (fm.tools ?? []) as string[];
  const toolTags = tools.map((t) => `tool/${t}`).join(", ");

  return `---
name: ${fm.name}
model: ${fm.model}
tools: [${tools.join(", ")}]
source: ${relativePath}/${fm.name}.md
tags: [agent, ${toolTags}]
---

# ${fm.name}

> ${fm.description}

## Team

${teamLinks}

## Skills

${skillLinks}

---

${body.trim()}
`;
}

// ── Generate Obsidian note for spec ──────────────────────────────────────────

function generateSpecNote(doc: DocFile): string {
  const { name, frontmatter, body, relativePath, wikilinks } = doc;

  // Build frontmatter from all parsed fields + vault metadata
  const fmLines: string[] = [];
  fmLines.push(`title: "${name}"`);
  fmLines.push(`source: ${relativePath}/${basename(name)}.md`);
  fmLines.push("tags: [spec]");

  // Carry over any original frontmatter fields (except title which we set)
  for (const [key, value] of Object.entries(frontmatter)) {
    if (key === "title") continue;
    if (value !== undefined) {
      fmLines.push(
        `${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`,
      );
    }
  }

  const linksSection = wikilinks.length
    ? wikilinks.map((l) => `- [[${l}]]`).join("\n")
    : "_none_";

  return `---
${fmLines.join("\n")}
---

# ${name}

## Links

${linksSection}

---

${body.trim()}
`;
}

// ── Generate vault note (dispatch by type) ───────────────────────────────────

function generateVaultNote(doc: DocFile): string {
  return doc.type === "agent" ? generateAgentNote(doc) : generateSpecNote(doc);
}

// ── Write index note ──────────────────────────────────────────────────────────

async function writeIndexNote(docs: DocFile[], vaultDir: string) {
  const agents = docs.filter((d) => d.type === VaultDocType.Agent);
  const specs = docs.filter((d) => d.type === VaultDocType.Spec);

  const lines = ["# Vault Index", ""];

  if (agents.length > 0) {
    lines.push(
      "## Agents",
      "",
      "```dataview",
      "TABLE description, model, tools",
      'FROM "agents"',
      "SORT name ASC",
      "```",
      "",
    );
    for (const a of agents) lines.push(`- [[${a.name}]]`);
    lines.push("");
  }

  if (specs.length > 0) {
    lines.push(
      "## Specs",
      "",
      "```dataview",
      'TABLE title, tags FROM "specs"',
      "SORT title ASC",
      "```",
      "",
    );
    for (const s of specs) lines.push(`- [[${s.name}]]`);
    lines.push("");
  }

  const indexPath = join(vaultDir, "index.md");
  await writeFile(indexPath, lines.join("\n"), "utf-8");
  ok("index.md");
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface SyncVaultOptions {
  /** Source directory (agents, specs, or mixed) */
  agentsDir: string;
  vaultDir: string;
}

export async function syncVault(options: SyncVaultOptions) {
  const { agentsDir, vaultDir } = options;

  if (!existsSync(agentsDir)) {
    throw new Error(`Source directory not found: ${agentsDir}`);
  }

  const mdFiles = await findMarkdownFiles(agentsDir);

  if (mdFiles.length === 0) {
    throw new Error(`No .md files found in ${agentsDir}`);
  }

  const docs: DocFile[] = [];

  for (const filePath of mdFiles) {
    const raw = await readFile(filePath, "utf-8");
    const parsed = parseRawFrontmatter(raw);

    const relPath = relative(agentsDir, dirname(filePath));
    const fileName = basename(filePath, ".md");

    if (parsed && isAgentFrontmatter(parsed.fields)) {
      // ── Agent file ──
      const fm = parseAgentFrontmatter(parsed.fields);

      if (!fm.name) {
        warn(`Skipping ${basename(filePath)} — missing name in frontmatter`);
        continue;
      }

      const doc: DocFile = {
        type: VaultDocType.Agent,
        name: fm.name,
        frontmatter: fm as unknown as Record<
          string,
          string | string[] | undefined
        >,
        body: parsed.body,
        relativePath: relPath,
        teamMembers: extractTeamMembers(parsed.body),
        skills: extractSkills(parsed.body),
        wikilinks: [],
      };

      docs.push(doc);

      const note = generateVaultNote(doc);
      const outDir = join(vaultDir, "agents", relPath);
      const outFile = join(outDir, `${fm.name}.md`);

      if (!existsSync(outDir)) await mkdir(outDir, { recursive: true });
      await writeFile(outFile, note, "utf-8");

      const memberSummary = doc.teamMembers.length
        ? `→ ${doc.teamMembers.join(", ")}`
        : "";
      ok(`[agent] ${fm.name.padEnd(20)} ${memberSummary}`);
    } else {
      // ── Spec / generic doc ──
      const body = parsed ? parsed.body : raw;
      const fields = parsed ? parsed.fields : {};
      const title =
        (fields.title as string) ||
        (fields.name as string) ||
        titleFromFilename(filePath);

      const doc: DocFile = {
        type: VaultDocType.Spec,
        name: title,
        frontmatter: fields,
        body,
        relativePath: relPath,
        teamMembers: [],
        skills: extractSkills(body),
        wikilinks: extractWikilinks(body),
      };

      docs.push(doc);

      const note = generateVaultNote(doc);
      const outDir = join(vaultDir, "specs", relPath);
      const outFile = join(outDir, `${fileName}.md`);

      if (!existsSync(outDir)) await mkdir(outDir, { recursive: true });
      await writeFile(outFile, note, "utf-8");

      ok(`[spec]  ${title.padEnd(20)}`);
    }
  }

  const agentCount = docs.filter((d) => d.type === VaultDocType.Agent).length;
  const specCount = docs.filter((d) => d.type === VaultDocType.Spec).length;

  console.log(
    `\nSynced ${docs.length} doc(s): ${agentCount} agent(s), ${specCount} spec(s)`,
  );

  await writeIndexNote(docs, vaultDir);

  console.log(`Vault written to: ${vaultDir}/`);
}
