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
            const summary = summarize(input.tool_response);
            logger.tool(`[POST] ${input.tool_name}`, {
              result: summary,
            });
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

function summarize(value: unknown): string {
  const str = JSON.stringify(value) ?? "";
  return str.length > 200 ? `${str.slice(0, 200)}...` : str;
}
