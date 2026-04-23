import type {
  HookCallbackMatcher,
  HookEvent,
  HookInput,
  HookJSONOutput,
} from "@anthropic-ai/claude-agent-sdk";
import { loadConfig } from "../common.ts";
import type { Logger } from "./logger.ts";

const DEFAULT_BLOCKED_PATTERNS = [
  /rm\s+-rf\s+\//,
  />\s*\/dev\//,
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
): Partial<Record<HookEvent, HookCallbackMatcher[]>> {
  const blockedPatterns = loadBlockedPatterns();

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

            logger.tool(`[PRE] ${input.tool_name}`, input.tool_input);

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
                logger.warn(`Blocked write outside cwd: ${filePath}`);
                return {
                  decision: "block",
                  reason: "Write outside project directory is not allowed",
                };
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
            logger.tool(
              `[POST] ${input.tool_name}`,
              summarizeToolResponse(input.tool_name, input.tool_response),
            );
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
            logger.info(
              `Subagent spawned | id=${input.agent_id} type=${input.agent_type}`,
            );
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
            logger.info(
              `Subagent stopped | id=${input.agent_id} type=${input.agent_type}`,
            );
            return { continue: true };
          },
        ],
      },
    ],
  };
}

function truncate(str: string, max = 200): string {
  if (!str) return "";
  const clean = str.replace(/\n+$/, "");
  return clean.length > max ? `${clean.slice(0, max)}...` : clean;
}

/**
 * Format tool responses for logging. For Bash we show just stdout/stderr
 * (optionally a truncation notice) so the log reads like a shell transcript,
 * not a JSON dump. For other tools we fall back to truncated JSON.
 */
function summarizeToolResponse(
  toolName: string,
  response: unknown,
): Record<string, unknown> {
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
    const out: Record<string, unknown> = {};
    if (r.stdout) out.stdout = truncate(r.stdout);
    if (r.stderr) out.stderr = truncate(r.stderr);
    if (r.interrupted) out.interrupted = true;
    if (Object.keys(out).length === 0) out.stdout = "(empty)";
    return out;
  }

  const str = JSON.stringify(response) ?? "";
  return { result: truncate(str) };
}
