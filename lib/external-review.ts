import fs from "node:fs";
import path from "node:path";
import {
  BLUE,
  CYAN,
  ExternalReviewAgent,
  type ExternalReviewConfig,
  loadConfig,
  log,
  NC,
  ok,
  warn,
} from "./common.ts";

export interface ReviewRequest {
  /** Human-readable subject shown in logs, e.g. "task #1.1" or "plan add-test-coverage". */
  subject: string;
  /** The review prompt sent to the external agent. */
  prompt: string;
  /** Destination file for the review output, relative or absolute. */
  outputFile: string;
}

export interface ReviewResult {
  /** True if the external agent exited 0. */
  ok: boolean;
  /** Absolute path to the review output file. */
  file: string;
}

/**
 * Run the configured external CLI agent (codex, devin, aider, claude, gemini)
 * on an arbitrary prompt. Returns null if no external review is configured or
 * the agent binary is not on PATH.
 */
export function runExternalReview(req: ReviewRequest): ReviewResult | null {
  const config = loadConfig();
  const reviewConfig = config.externalReview;
  if (!reviewConfig) return null;

  const cmd = resolveExternalCommand(reviewConfig);
  if (!cmd) {
    warn(`External review agent "${reviewConfig.agent}" not found in PATH.`);
    return null;
  }

  log(
    `Running external review via ${CYAN}${reviewConfig.agent}${NC} for ${req.subject}...`,
  );

  try {
    const args = buildExternalArgs(reviewConfig, req.prompt);
    // stdin: "ignore" — never let the external CLI block waiting for input
    // when agent-team runs in batch/CI mode. stdout/stderr: "pipe" for logging.
    const proc = Bun.spawnSync(args, {
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 300_000, // 5 min
    });

    const stdout = new TextDecoder().decode(proc.stdout).trim();
    const stderr = new TextDecoder().decode(proc.stderr).trim();

    const outputDir = path.dirname(req.outputFile);
    if (outputDir && !fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const content = [
      `# External Review — ${req.subject}`,
      `**Agent:** ${reviewConfig.agent}`,
      `**Date:** ${new Date().toISOString()}`,
      "",
      stdout || "(no output)",
      stderr ? `\n## Stderr\n${stderr}` : "",
    ].join("\n");
    fs.writeFileSync(req.outputFile, content);

    if (proc.success) {
      ok(`External review saved: ${BLUE}${req.outputFile}${NC}`);
      return { ok: true, file: req.outputFile };
    }
    warn(
      `External review exited with code ${proc.exitCode} — output saved to ${req.outputFile}`,
    );
    return { ok: false, file: req.outputFile };
  } catch (e) {
    warn(`External review error: ${e}`);
    return null;
  }
}

function resolveExternalCommand(config: ExternalReviewConfig): string | null {
  if (config.command) return config.command;
  const cmd = config.agent as string;
  if (!cmd) return null;
  const which = Bun.spawnSync(["which", cmd], {
    stdio: ["pipe", "pipe", "pipe"],
  });
  return which.success ? cmd : null;
}

function buildExternalArgs(
  config: ExternalReviewConfig,
  prompt: string,
): string[] {
  const cmd = config.command || config.agent;
  switch (config.agent) {
    case ExternalReviewAgent.Codex:
      return [cmd, "-q", prompt];
    case ExternalReviewAgent.Claude:
      return [
        cmd,
        "-p",
        prompt,
        "--max-turns",
        "10",
        "--output-format",
        "text",
      ];
    case ExternalReviewAgent.Devin:
      return [cmd, "run", prompt];
    case ExternalReviewAgent.Aider:
      return [cmd, "--message", prompt, "--yes"];
    case ExternalReviewAgent.Gemini:
      return [cmd, "-p", prompt];
    default:
      return [cmd, prompt];
  }
}
