import fs from "node:fs";
import {
  AuditStatus,
  BLUE,
  CYAN,
  GREEN,
  log,
  NC,
  ok,
  RED,
  warn,
  YELLOW,
} from "./common.ts";

const LOG_FILE = ".claude-loop/audit/audit.jsonl";

interface AuditEntry {
  ts: string;
  role: string;
  agent: string;
  tool: string;
  phase: "PRE" | "POST";
  status?: string;
  duration_ms?: number;
}

interface AggregatedStats {
  calls: number;
  success: number;
  errors: number;
  totalDuration: number;
}

export function auditReport() {
  if (!fs.existsSync(LOG_FILE)) {
    warn(`No audit log found at ${LOG_FILE}`);
    return;
  }

  const lines = fs
    .readFileSync(LOG_FILE, "utf-8")
    .split("\n")
    .filter((l) => l.trim());

  const stats = new Map<string, AggregatedStats>();

  for (const line of lines) {
    let entry: AuditEntry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }

    if (entry.phase !== "POST") continue;

    const key = `${entry.agent}\t${entry.tool}`;
    const existing = stats.get(key) || {
      calls: 0,
      success: 0,
      errors: 0,
      totalDuration: 0,
    };

    existing.calls++;
    if (entry.status === AuditStatus.Success) {
      existing.success++;
    } else {
      existing.errors++;
    }
    existing.totalDuration += entry.duration_ms || 0;
    stats.set(key, existing);
  }

  if (stats.size === 0) {
    ok("Audit log is empty (no POST entries).");
    return;
  }

  console.log("");
  log("Audit Report (Tool Call Counts and Error Rates per Agent)");
  console.log("");
  console.log(
    `  ${CYAN}| Agent            | Tool       | Calls | Success | Errors | Error Rate | Avg Duration |${NC}`,
  );
  console.log(
    `  ${CYAN}|------------------|------------|-------|---------|--------|------------|--------------|${NC}`,
  );

  const sorted = [...stats.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  for (const [key, s] of sorted) {
    const [agent, tool] = key.split("\t");
    const errRate = ((s.errors / s.calls) * 100).toFixed(1);
    const avgDuration = Math.round(s.totalDuration / s.calls);

    const errColor = s.errors > 0 ? RED : GREEN;

    console.log(
      `  | ${BLUE}${(agent ?? "").padEnd(16)}${NC} | ${(tool ?? "").padEnd(10)} | ${s.calls.toString().padEnd(5)} | ${GREEN}${s.success.toString().padEnd(7)}${NC} | ${errColor}${s.errors.toString().padEnd(6)}${NC} | ${errColor}${errRate.padStart(5)}%${NC}     | ${YELLOW}${avgDuration.toString().padStart(5)}ms${NC}       |`,
    );
  }

  console.log("");
}
