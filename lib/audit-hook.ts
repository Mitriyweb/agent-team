#!/usr/bin/env bun

/**
 * audit-hook.ts — Log Claude Code tool calls to a unified JSONL file
 *
 * Called via: agent-team audit-hook PRE|POST
 * Reads JSON from stdin.
 */

import fs from "node:fs";
import path from "node:path";

const LOG_DIR = ".claude-loop/audit";

export async function runAuditHook(phase: string) {
  fs.mkdirSync(LOG_DIR, { recursive: true });

  const role = process.env.ROLE || "unknown";
  const agent = process.env.AGENT || "unknown";
  const timestamp = new Date().toISOString();

  const input = await new Response(Bun.stdin.stream()).text();

  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(input);
  } catch {
    // Ignore parse errors
  }

  const tool = (parsed.tool as string) || "unknown";
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
    const status = (parsed.status as string) || "success";
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
