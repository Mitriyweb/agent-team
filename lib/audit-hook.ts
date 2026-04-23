#!/usr/bin/env bun

/**
 * audit-hook.ts — Log Claude Code tool calls to a unified JSONL file
 *
 * Called via: agent-team audit-hook PRE|POST
 * Reads JSON from stdin.
 */

import fs from "node:fs";
import path from "node:path";
import { AuditStatus } from "./common.ts";

const LOG_DIR = ".claude-loop/audit";

export async function runAuditHook(phase: string) {
  fs.mkdirSync(LOG_DIR, { recursive: true });

  const timestamp = new Date().toISOString();

  const input = await new Response(Bun.stdin.stream()).text();

  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(input);
  } catch {
    // Ignore parse errors
  }

  // Claude Code hooks pass tool_name (not tool) in stdin JSON
  const tool =
    (parsed.tool_name as string) || (parsed.tool as string) || "unknown";

  // Detect role/agent from Claude Code environment
  // CLAUDE_AGENT_PROFILE is set when running under a profile (team-lead, developer, etc.)
  const role =
    process.env.CLAUDE_AGENT_PROFILE || process.env.ROLE || detectRole(parsed);
  const agent =
    process.env.CLAUDE_AGENT_NAME || process.env.AGENT || detectAgent(parsed);

  const logFile = path.join(LOG_DIR, "audit.jsonl");

  if (phase === "PRE") {
    const entry = JSON.stringify({
      ts: timestamp,
      role,
      agent,
      tool,
      phase: "PRE",
    });
    fs.appendFileSync(logFile, `${entry}\n`);
  } else {
    // Claude Code PostToolUse hooks may include tool_output or error
    const hasError = !!parsed.tool_error;
    const status = hasError
      ? AuditStatus.Error
      : (parsed.status as string) || AuditStatus.Success;
    const durationMs = (parsed.duration_ms as number) || 0;
    const entry = JSON.stringify({
      ts: timestamp,
      role,
      agent,
      tool,
      phase: "POST",
      status,
      duration_ms: durationMs,
    });
    fs.appendFileSync(logFile, `${entry}\n`);
  }
}

/** Try to detect role from hook context (e.g. Agent tool spawns with subagent_type). */
function detectRole(parsed: Record<string, unknown>): string {
  // Check if the tool input contains subagent_type (Agent tool calls)
  const input = parsed.tool_input as Record<string, unknown> | undefined;
  if (input?.subagent_type) return String(input.subagent_type);
  // Fallback: check for profile in the session
  if (process.env.USER_PROFILE) return process.env.USER_PROFILE;
  return "main";
}

/** Try to detect agent name from hook context. */
function detectAgent(parsed: Record<string, unknown>): string {
  const input = parsed.tool_input as Record<string, unknown> | undefined;
  if (input?.name) return String(input.name);
  if (input?.description) return String(input.description);
  return "claude";
}
