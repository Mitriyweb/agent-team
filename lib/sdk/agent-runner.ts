import fs from "node:fs";
import path from "node:path";
import type {
  Options,
  PermissionMode,
  SDKResultMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { resolveModelAlias } from "../common.ts";
import { createHooks } from "./hooks.ts";
import { createLogger, type Logger } from "./logger.ts";

export interface AgentRunnerOptions {
  /** Team name (e.g. "software development", "frontend") */
  team: string;
  /** Role/agent name (e.g. "architect", "developer") */
  role: string;
  /** Task prompt */
  prompt: string;
  /** Override allowed tools from frontmatter */
  allowedTools?: string[];
  /** Add extra tools on top of frontmatter ones */
  extraTools?: string[];
  /** Override max_turns from frontmatter */
  maxTurns?: number;
  /** Override model from frontmatter */
  model?: string;
  /** Working directory for the agent */
  cwd?: string;
}

export interface AgentRunResult {
  output: string;
  cost?: number;
  turns: number;
  timedOut: boolean;
  sessionId?: string;
}

interface AgentFrontmatter {
  name?: string;
  role?: string;
  team?: string;
  description?: string;
  model?: string;
  tools?: string;
  allowed_tools?: string[];
  max_turns?: number;
  allow_sub_agents?: boolean;
  permission_mode?: string;
}

const DEFAULT_TOOLS = ["Read", "Edit", "Bash", "Glob", "Grep", "WebSearch"];

/**
 * Find agent definition file. Supports multiple naming conventions:
 * - .claude/agents/{role}.md (deployed)
 * - agents/{team}/{role}.md
 * - agents/{team}/sw-{role}.md (prefixed)
 * - agents/{team}/{role}/CLAUDE.md (SDK convention)
 */
function findAgentFile(team: string, role: string): string | undefined {
  const candidates = [
    path.join(".claude", "agents", `${role}.md`),
    path.join("agents", team, `${role}.md`),
    path.join("agents", team, `sw-${role}.md`),
    path.join("agents", team, role, "CLAUDE.md"),
  ];
  return candidates.find((p) => fs.existsSync(p));
}

/**
 * Parse YAML frontmatter from agent .md file.
 * Handles both formats:
 * - tools: "Read, Edit, Bash" (comma-separated string)
 * - allowed_tools: [Read, Edit, Bash] (YAML list)
 */
function parseFrontmatter(filePath: string): {
  frontmatter: AgentFrontmatter;
  systemPrompt: string;
} {
  const raw = fs.readFileSync(filePath, "utf-8");
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);

  if (!match) {
    return { frontmatter: {}, systemPrompt: raw.trim() };
  }

  const [, yamlBlock, body] = match;
  const frontmatter: AgentFrontmatter = {};
  const lines = (yamlBlock ?? "").split(/\r?\n/);

  let currentKey: string | null = null;
  let currentList: string[] = [];

  const flush = () => {
    if (currentKey && currentList.length > 0) {
      (frontmatter as Record<string, unknown>)[currentKey] = currentList;
      currentList = [];
      currentKey = null;
    }
  };

  for (const line of lines) {
    if (/^\s+-\s+/.test(line)) {
      const value = line
        .replace(/^\s+-\s+/, "")
        .trim()
        .replace(/^['"]|['"]$/g, "");
      currentList.push(value);
      continue;
    }

    const kvMatch = line.match(/^([a-z_]+):\s*(.*)$/);
    if (kvMatch) {
      flush();
      const [, key, raw] = kvMatch;
      const value = (raw ?? "").trim().replace(/^['"]|['"]$/g, "");

      if (value === "") {
        currentKey = key ?? null;
      } else if (key) {
        (frontmatter as Record<string, unknown>)[key] = coerce(value);
      }
    }
  }
  flush();

  return { frontmatter, systemPrompt: (body ?? "").trim() };
}

function coerce(value: string): string | number | boolean {
  if (value === "true") return true;
  if (value === "false") return false;
  const num = Number(value);
  if (!Number.isNaN(num) && value !== "") return num;
  return value;
}

/**
 * Resolve tools from frontmatter. Handles:
 * - tools: "Read, Edit, Bash" (comma string from existing agents)
 * - allowed_tools: ["Read", "Edit"] (list from SDK-style agents)
 */
function resolveTools(fm: AgentFrontmatter): string[] {
  if (fm.allowed_tools && Array.isArray(fm.allowed_tools)) {
    return fm.allowed_tools;
  }
  if (typeof fm.tools === "string") {
    return fm.tools.split(",").map((t) => t.trim());
  }
  return DEFAULT_TOOLS;
}

/**
 * Find globally installed claude CLI binary.
 * The SDK needs pathToClaudeCodeExecutable when the native binary
 * for the current platform isn't bundled in node_modules.
 */
function findGlobalClaude(): string | undefined {
  const candidates = [
    path.join(process.env.HOME || "", ".local", "bin", "claude"),
    "/usr/local/bin/claude",
    "/opt/homebrew/bin/claude",
  ];
  // Also try `which claude` via sync exec
  try {
    const result = Bun.spawnSync(["which", "claude"], { stdout: "pipe" });
    const whichPath = new TextDecoder().decode(result.stdout).trim();
    if (whichPath) candidates.unshift(whichPath);
  } catch {
    // ignore
  }
  return candidates.find((p) => fs.existsSync(p));
}

export async function runAgent(
  opts: AgentRunnerOptions,
): Promise<AgentRunResult> {
  const {
    team,
    role,
    prompt,
    allowedTools,
    extraTools = [],
    maxTurns,
    model,
    cwd,
  } = opts;

  const logger: Logger = createLogger(`${team}/${role}`);
  const agentFile = findAgentFile(team, role);

  let frontmatter: AgentFrontmatter = {};
  let systemPrompt = "";

  if (agentFile) {
    const parsed = parseFrontmatter(agentFile);
    frontmatter = parsed.frontmatter;
    systemPrompt = parsed.systemPrompt;
    logger.info(`Loaded agent: ${agentFile}`);
  } else {
    logger.warn(`No agent file found for ${team}/${role}, using defaults`);
  }

  // Priority: call option > frontmatter > default
  const resolvedTools = [
    ...(allowedTools ?? resolveTools(frontmatter)),
    ...extraTools,
    ...(frontmatter.allow_sub_agents ? ["Agent"] : []),
  ];

  const resolvedMaxTurns = maxTurns ?? frontmatter.max_turns ?? 50;
  const resolvedModel = resolveModelAlias(
    model ?? (typeof frontmatter.model === "string" ? frontmatter.model : ""),
  );
  const resolvedPermission = (frontmatter.permission_mode ??
    "acceptEdits") as PermissionMode;

  // CLI path: env > local node_modules > global which(claude)
  const cliPath =
    process.env.CLAUDE_CLI_PATH ??
    (fs.existsSync("./node_modules/.bin/claude")
      ? "./node_modules/.bin/claude"
      : findGlobalClaude());

  const hooks = createHooks(logger, role, team);

  const options: Options = {
    systemPrompt: systemPrompt || undefined,
    allowedTools: [...new Set(resolvedTools)],
    permissionMode: resolvedPermission,
    maxTurns: resolvedMaxTurns,
    hooks,
    ...(cliPath ? { pathToClaudeCodeExecutable: cliPath } : {}),
    ...(resolvedModel ? { model: resolvedModel } : {}),
    ...(cwd ? { cwd } : {}),
  };

  let output = "";
  let cost: number | undefined;
  let turns = 0;
  let timedOut = false;
  let sessionId: string | undefined;

  logger.info(
    `Starting | model: ${resolvedModel || "(sdk default)"} | tools: [${options.allowedTools?.join(", ")}] maxTurns: ${resolvedMaxTurns}`,
  );

  try {
    for await (const message of query({ prompt, options })) {
      if (message.type === "system") continue;

      if (message.type === "assistant") {
        turns++;
        for (const block of message.message.content) {
          if (block.type === "text" && block.text) {
            logger.assistant(block.text);
          }
          // tool_use blocks are logged by the PreToolUse hook as [PRE] <name>,
          // and PostToolUse as [POST] <name> with the result. No need to log
          // again here — it just duplicates the pre-execution line.
        }
      }

      if (message.type === "result") {
        const result = message as SDKResultMessage;
        sessionId = result.session_id;
        cost = result.total_cost_usd;
        turns = result.num_turns;
        timedOut = result.is_error;
        if (result.subtype === "success") {
          output = result.result ?? "";
        }
        logger.info(`Done | turns=${turns} cost=$${cost?.toFixed(4) ?? "?"}`);
      }
    }
  } catch (err) {
    logger.error(`Agent error: ${err}`);
    throw err;
  }

  return { output, cost, turns, timedOut, sessionId };
}
