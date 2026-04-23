export interface Logger {
  /** The display prefix used in log lines (without brackets). */
  tag: string;
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
  assistant(text: string): void;
  /**
   * Log a tool call. Pass a string (pre-formatted, may be multi-line) or an
   * object (tool input / response) — the logger picks a Claude Code–style
   * summary automatically based on the tool name.
   */
  tool(nameWithPhase: string, input?: unknown): void;
}

const COLOR_TAG = "\x1b[2m"; // dim
const COLOR_TOOL_PRE = "\x1b[35m"; // magenta
const COLOR_TOOL_POST = "\x1b[90m"; // bright black
const COLOR_ASSISTANT = "\x1b[36m"; // cyan
const COLOR_WARN = "\x1b[33m";
const COLOR_ERROR = "\x1b[31m";
const NC = "\x1b[0m";

export function createLogger(prefix: string): Logger {
  const bracketed = `[${prefix}]`;

  const log: Logger = {
    tag: prefix,
    info(msg) {
      console.log(`${COLOR_TAG}${bracketed}${NC} ${msg}`);
    },
    warn(msg) {
      console.warn(`${COLOR_WARN}${bracketed} WARN: ${msg}${NC}`);
    },
    error(msg) {
      console.error(`${COLOR_ERROR}${bracketed} ERROR: ${msg}${NC}`);
    },
    assistant(text) {
      const preview = text.length > 500 ? `${text.slice(0, 500)}...` : text;
      console.log(`${COLOR_ASSISTANT}${bracketed} > ${preview}${NC}`);
    },
    tool(nameWithPhase, input) {
      const isPost = nameWithPhase.startsWith("[POST]");
      const color = isPost ? COLOR_TOOL_POST : COLOR_TOOL_PRE;
      const { tool, brief, body } = formatToolCall(nameWithPhase, input);
      const head = `${color}${bracketed} ⏺ ${tool}${brief ? `(${brief})` : ""}${NC}`;
      if (body) {
        console.log(`${head}\n${indentMultiline(body, "  ⎿ ")}`);
      } else {
        console.log(head);
      }
    },
  };

  return log;
}

/**
 * Extract a human-readable one-liner for a tool call. Mirrors how Claude
 * Code's UI renders tool invocations: `Bash(npm run test)` with stdout
 * indented underneath. Unknown tools fall back to a truncated JSON dump.
 */
function formatToolCall(
  nameWithPhase: string,
  input: unknown,
): { tool: string; brief: string; body: string } {
  // nameWithPhase looks like "[PRE] Bash" or "[POST] Read"
  const match = nameWithPhase.match(/^\[(PRE|POST)\]\s+(.+)$/);
  const tool = match?.[2] ?? nameWithPhase;
  // Phase is conveyed by color (magenta PRE, grey POST), no arrow needed.

  // String input → pre-formatted block (caller uses this for tool OUTPUTS,
  // e.g. multi-line Bash stdout).
  if (typeof input === "string") {
    return { tool, brief: "", body: input };
  }

  if (input && typeof input === "object") {
    const obj = input as Record<string, unknown>;

    // Well-known tools: render like Claude Code.
    if (tool === "Bash" && typeof obj.command === "string") {
      return { tool, brief: truncateInline(obj.command, 160), body: "" };
    }
    if (
      (tool === "Read" ||
        tool === "Write" ||
        tool === "Edit" ||
        tool === "NotebookEdit") &&
      typeof obj.file_path === "string"
    ) {
      return { tool, brief: shortenPath(obj.file_path), body: "" };
    }
    if (tool === "Glob" && typeof obj.pattern === "string") {
      return { tool, brief: obj.pattern, body: "" };
    }
    if (tool === "Grep" && typeof obj.pattern === "string") {
      const suffix =
        typeof obj.path === "string" ? ` in ${shortenPath(obj.path)}` : "";
      return { tool, brief: `${obj.pattern}${suffix}`, body: "" };
    }
    if (
      (tool === "Agent" || tool === "Task") &&
      (typeof obj.description === "string" ||
        typeof obj.subagent_type === "string")
    ) {
      const desc = (obj.description as string) ?? (obj.subagent_type as string);
      return { tool: "Agent", brief: desc, body: "" };
    }
    if (
      tool === "Teammate" &&
      (typeof obj.to === "string" || typeof obj.subject === "string")
    ) {
      const to = (obj.to as string) ?? "?";
      const subject = (obj.subject as string) ?? "";
      return { tool, brief: `→${to} ${subject}`, body: "" };
    }

    // PostToolUse summaries may pre-package the result under `result`.
    if (typeof obj.result === "string") {
      return { tool, brief: "", body: truncate(obj.result, 600) };
    }

    // Fallback: dump the JSON payload, truncated.
    const json = JSON.stringify(obj);
    return { tool, brief: truncateInline(json, 160), body: "" };
  }

  return { tool, brief: "", body: "" };
}

function truncateInline(text: string, max: number): string {
  const oneline = text.replace(/\s+/g, " ").trim();
  return oneline.length > max ? `${oneline.slice(0, max)}…` : oneline;
}

function truncate(text: string, max: number): string {
  const clean = text.replace(/\n+$/, "");
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

function shortenPath(p: string): string {
  const cwd = process.cwd();
  return p.startsWith(cwd) ? p.slice(cwd.length + 1) || "." : p;
}

function indentMultiline(text: string, lead: string): string {
  const cont = " ".repeat(lead.length);
  return text
    .split("\n")
    .map((line, i) => `${i === 0 ? lead : cont}${line}`)
    .join("\n");
}
