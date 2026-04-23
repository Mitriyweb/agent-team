import fs from "node:fs";
import path from "node:path";
import type {
  HookCallbackMatcher,
  HookEvent,
  HookInput,
  HookJSONOutput,
} from "@anthropic-ai/claude-agent-sdk";
import { loadConfig } from "../common.ts";
import { createLogger, type Logger } from "./logger.ts";

/** Warn threshold (in bytes) for Read — beyond this the file is likely a log
 * or artifact and shouldn't be injected whole into the prompt. */
const LARGE_FILE_WARN_BYTES = 500_000;

const DEFAULT_BLOCKED_PATTERNS = [
  /rm\s+-rf\s+\//,
  // Writes to raw block devices (disk overwrite). /dev/null, /dev/tty, /dev/stderr, etc. are allowed.
  />\s*\/dev\/(sd[a-z]|hd[a-z]|nvme\d|disk\d|xvd[a-z]|vd[a-z])/,
  /curl.*\|\s*sh/,
  /wget.*\|\s*bash/,
];

function loadBlockedPatterns(): RegExp[] {
  const config = loadConfig();
  const extra = (config.blockedBashPatterns ?? []).map((p) => new RegExp(p));
  return [...DEFAULT_BLOCKED_PATTERNS, ...extra];
}

export function createHooks(
  logger: Logger,
  _role: string,
  team?: string,
): Partial<Record<HookEvent, HookCallbackMatcher[]>> {
  const blockedPatterns = loadBlockedPatterns();

  // If a hook fires from within a sub-agent, re-tag the log line with
  // "<team>/<sub-agent>" so the reader sees who actually executed the tool,
  // not the parent that was orchestrating.
  const subAgentLoggerCache = new Map<string, Logger>();
  function loggerFor(input: HookInput): Logger {
    const hookInput = input as HookInput & { agent_type?: string };
    const agentType = hookInput.agent_type;
    if (!agentType) return logger;
    const key = agentType;
    const cached = subAgentLoggerCache.get(key);
    if (cached) return cached;
    const prefix = team ? `${team}/${agentType}` : agentType;
    const subLogger = createLogger(prefix);
    subAgentLoggerCache.set(key, subLogger);
    return subLogger;
  }

  return {
    PreToolUse: [
      {
        hooks: [
          async (
            input: HookInput,
            _toolUseID: string | undefined,
          ): Promise<HookJSONOutput> => {
            if (input.hook_event_name !== "PreToolUse") {
              return { continue: true };
            }

            loggerFor(input).tool(`[PRE] ${input.tool_name}`, input.tool_input);

            // Block dangerous bash commands
            if (input.tool_name === "Bash") {
              const cmd = String(
                (input.tool_input as Record<string, unknown>)?.command ?? "",
              );
              for (const pattern of blockedPatterns) {
                if (pattern.test(cmd)) {
                  logger.warn(`Blocked dangerous command: ${cmd}`);
                  return {
                    decision: "block",
                    reason: `Command matches blocked pattern: ${pattern}`,
                  };
                }
              }
            }

            // Block writes outside cwd
            if (input.tool_name === "Edit" || input.tool_name === "Write") {
              const toolInput = input.tool_input as Record<string, unknown>;
              const filePath = String(
                toolInput?.file_path ?? toolInput?.path ?? "",
              );
              if (filePath.startsWith("/") && !filePath.startsWith(input.cwd)) {
                loggerFor(input).warn(`Blocked write outside cwd: ${filePath}`);
                return {
                  decision: "block",
                  reason: "Write outside project directory is not allowed",
                };
              }
            }

            // Warn when Read pulls in a huge file (common cost trap — e.g.,
            // an agent re-reading a 4 MB coverage log into the prompt).
            if (input.tool_name === "Read") {
              const toolInput = input.tool_input as Record<string, unknown>;
              const filePath = String(toolInput?.file_path ?? "");
              if (filePath) {
                try {
                  const stat = fs.statSync(filePath);
                  if (stat.size > LARGE_FILE_WARN_BYTES) {
                    loggerFor(input).warn(
                      `Large Read: ${filePath} is ${(stat.size / 1024 / 1024).toFixed(1)} MB. Consider Grep/Bash('tail -N')/ask QA for a summary instead.`,
                    );
                  }
                } catch {
                  /* file may not exist yet; ignore */
                }
              }
            }

            return { continue: true };
          },
        ],
      },
    ],

    PostToolUse: [
      {
        hooks: [
          async (input: HookInput): Promise<HookJSONOutput> => {
            if (input.hook_event_name !== "PostToolUse") {
              return { continue: true };
            }
            const formatted = summarizeToolResponse(
              input.tool_name,
              input.tool_response,
            );
            loggerFor(input).tool(`[POST] ${input.tool_name}`, formatted);
            return { continue: true };
          },
        ],
      },
    ],

    SubagentStart: [
      {
        hooks: [
          async (input: HookInput): Promise<HookJSONOutput> => {
            if (input.hook_event_name !== "SubagentStart") {
              return { continue: true };
            }
            const model = lookupAgentModel(input.agent_type);
            const parts = [`spawned by ${logger.tag ?? "team-lead"}`];
            if (model) parts.push(`model=${model}`);
            loggerFor(input).info(`↪ Subagent ${parts.join(" | ")}`);
            return { continue: true };
          },
        ],
      },
    ],

    SubagentStop: [
      {
        hooks: [
          async (input: HookInput): Promise<HookJSONOutput> => {
            if (input.hook_event_name !== "SubagentStop") {
              return { continue: true };
            }
            loggerFor(input).info("✓ Subagent done");
            return { continue: true };
          },
        ],
      },
    ],
  };
}

function truncate(str: string, max = 600): string {
  if (!str) return "";
  const clean = str.replace(/\n+$/, "");
  return clean.length > max ? `${clean.slice(0, max)}...` : clean;
}

/**
 * Read the `model:` field from `.claude/agents/<name>.md` frontmatter so we
 * can surface which model a spawned sub-agent is actually using. Returns
 * undefined if the file or field is missing.
 */
function lookupAgentModel(agentType: string | undefined): string | undefined {
  if (!agentType) return undefined;
  const candidates = [
    path.join(".claude", "agents", `${agentType}.md`),
    path.join(".claude", "agents", `${agentType}`, "CLAUDE.md"),
  ];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    try {
      const content = fs.readFileSync(file, "utf-8");
      const fm = content.match(/^---\n([\s\S]*?)\n---/);
      const model = fm?.[1]?.match(/^model:\s*(.+)$/m);
      if (model?.[1]) return model[1].trim();
    } catch {
      /* ignore */
    }
  }
  return undefined;
}

/**
 * Format a tool response for logging. Bash returns a multi-line string
 * (rendered as indented shell transcript by the logger). Other tools
 * return a Record rendered as single-line JSON.
 */
function summarizeToolResponse(
  toolName: string,
  response: unknown,
): string | Record<string, unknown> {
  if (
    toolName === "Bash" &&
    response &&
    typeof response === "object" &&
    "stdout" in response
  ) {
    const r = response as {
      stdout?: string;
      stderr?: string;
      interrupted?: boolean;
    };
    const parts: string[] = [];
    const stdout = truncate(r.stdout ?? "", 400);
    if (stdout) parts.push(stdout);
    const stderr = truncate(r.stderr ?? "", 200);
    if (stderr) parts.push(`stderr: ${stderr}`);
    if (r.interrupted) parts.push("(interrupted)");
    if (parts.length === 0) return "(empty)";
    return parts.join("\n");
  }

  const str = JSON.stringify(response) ?? "";
  return { result: truncate(str) };
}
