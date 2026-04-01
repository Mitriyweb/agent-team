import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

let tmpDir: string;
let origCwd: string;
let origEnv: Record<string, string | undefined>;
let origConsole: {
  log: typeof console.log;
  warn: typeof console.warn;
  error: typeof console.error;
};
const origStderrWrite = process.stderr.write.bind(process.stderr);

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "run-test-"));
  origCwd = process.cwd();
  origEnv = { PROVIDER: process.env.PROVIDER };
  origConsole = {
    log: console.log,
    warn: console.warn,
    error: console.error,
  };
  console.log = () => {};
  console.warn = () => {};
  console.error = () => {};
  process.stderr.write = () => true;
  process.chdir(tmpDir);
  process.env.PROVIDER = "oauth";
});

afterEach(() => {
  process.chdir(origCwd);
  process.env.PROVIDER = origEnv.PROVIDER;
  console.log = origConsole.log;
  console.warn = origConsole.warn;
  console.error = origConsole.error;
  process.stderr.write = origStderrWrite;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeRoadmap(content: string, filename = "tasks/plan.md") {
  const dir = path.dirname(path.join(tmpDir, filename));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(tmpDir, filename), content);
}

const ROADMAP_2_TASKS = [
  "# Plan",
  "",
  "```",
  "- [ ] id:001 priority:high type:feature agents:developer Implement login",
  "- [ ] id:002 priority:medium type:test depends:001 agents:qa Write login tests",
  "```",
  "",
  "### Task #001 — Implement login",
  "**Agents:** developer",
  "**Output:** src/login.ts",
  "",
  "### Task #002 — Write login tests",
  "**Agents:** qa",
  "**Depends on:** #001",
].join("\n");

describe("TaskRunner", () => {
  it("creates log/report/session directories on construction", async () => {
    writeRoadmap(ROADMAP_2_TASKS);
    const { TaskRunner } = await import("../../lib/run.ts");
    new TaskRunner({});

    expect(fs.existsSync(path.join(tmpDir, ".claude-loop/logs"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, ".claude-loop/reports"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, ".claude-loop/sessions"))).toBe(
      true,
    );
  });

  it("dry-run marks all tasks as done without spawning claude", async () => {
    writeRoadmap(ROADMAP_2_TASKS);
    const { TaskRunner } = await import("../../lib/run.ts");

    const runner = new TaskRunner({ all: true, dryRun: true });
    await runner.run();

    const content = fs.readFileSync(
      path.join(tmpDir, "tasks/plan.md"),
      "utf-8",
    );
    expect(content).toContain("[x] id:001");
    expect(content).toContain("[x] id:002");
    expect(content).not.toContain("[ ] id:001");
    expect(content).not.toContain("[ ] id:002");
  });

  it("dry-run single task stops after first task", async () => {
    writeRoadmap(ROADMAP_2_TASKS);
    const { TaskRunner } = await import("../../lib/run.ts");

    const runner = new TaskRunner({ dryRun: true });
    await runner.run();

    const content = fs.readFileSync(
      path.join(tmpDir, "tasks/plan.md"),
      "utf-8",
    );
    // Only first task done (dependency blocks second anyway in single mode)
    expect(content).toContain("[x] id:001");
    expect(content).toContain("[ ] id:002");
  });

  it("respects dependency ordering", async () => {
    const roadmap = [
      "```",
      "- [ ] id:001 priority:medium type:feature agents:developer Base setup",
      "- [ ] id:002 priority:high type:feature depends:001 agents:developer Depends on base",
      "```",
    ].join("\n");

    writeRoadmap(roadmap);
    const { TaskRunner } = await import("../../lib/run.ts");

    // Run only one task in dry-run — should pick 001 first despite 002 being high priority
    const runner = new TaskRunner({ dryRun: true });
    await runner.run();

    const content = fs.readFileSync(
      path.join(tmpDir, "tasks/plan.md"),
      "utf-8",
    );
    expect(content).toContain("[x] id:001");
    expect(content).toContain("[ ] id:002");
  });

  it("reports empty roadmap gracefully", async () => {
    writeRoadmap("# Empty plan\n\nNo tasks here.");
    const { TaskRunner } = await import("../../lib/run.ts");

    const runner = new TaskRunner({ dryRun: true });
    // Should not throw
    await runner.run();
  });

  it("saves cost summary to reports directory", async () => {
    const roadmap = [
      "```",
      "- [ ] id:001 priority:high type:feature agents:developer Build it",
      "```",
      "",
      "### Task #001 — Build it",
      "**Agents:** developer",
    ].join("\n");

    writeRoadmap(roadmap);

    const originalSpawn = Bun.spawn;
    // Claude CLI with --output-format json returns a single JSON object.
    // The code checks for TASK_STATUS: SUCCESS in the string AND tries JSON.parse.
    // We embed the marker inside the JSON so both checks pass.
    const responseJson = JSON.stringify({
      result: "TASK_STATUS: SUCCESS",
      model: "claude-sonnet-4-5-20250514",
      usage: { input_tokens: 1000, output_tokens: 500 },
    });
    // @ts-expect-error - mock override
    Bun.spawn = mock((_cmd: string[]) => {
      return {
        stdout: new Response(responseJson).body,
        stderr: null,
        exited: Promise.resolve(0),
        pid: 1,
        kill: () => {},
      };
    });

    try {
      const { TaskRunner } = await import("../../lib/run.ts");
      const runner = new TaskRunner({});
      await runner.run();

      const costFile = path.join(
        tmpDir,
        ".claude-loop/reports/cost-summary.json",
      );
      expect(fs.existsSync(costFile)).toBe(true);

      const costData = JSON.parse(fs.readFileSync(costFile, "utf-8"));
      expect(costData.total_cost).toBeGreaterThan(0);
      expect(costData.tasks["001"]).toBeGreaterThan(0);
    } finally {
      Bun.spawn = originalSpawn;
    }
  });

  it("marks task as failed after exhausting retries", async () => {
    const roadmap = [
      "```",
      "- [ ] id:001 priority:high type:feature agents:developer Failing task",
      "```",
    ].join("\n");

    writeRoadmap(roadmap);

    const originalSpawn = Bun.spawn;
    // @ts-expect-error - mock override
    Bun.spawn = mock((_cmd: string[]) => {
      return {
        stdout: new Response("ERROR: something went wrong").body,
        stderr: null,
        exited: Promise.resolve(1),
        pid: 1,
        kill: () => {},
      };
    });

    try {
      const { TaskRunner } = await import("../../lib/run.ts");
      const runner = new TaskRunner({ retryLimit: 0 });
      await runner.run();

      const content = fs.readFileSync(
        path.join(tmpDir, "tasks/plan.md"),
        "utf-8",
      );
      expect(content).toContain("[!] id:001");
    } finally {
      Bun.spawn = originalSpawn;
    }
  });

  it("uses ROADMAP.md as fallback when tasks/plan.md is missing", async () => {
    const roadmap = [
      "```",
      "- [ ] id:001 priority:high type:chore agents:developer Quick fix",
      "```",
    ].join("\n");

    fs.writeFileSync(path.join(tmpDir, "ROADMAP.md"), roadmap);

    const { TaskRunner } = await import("../../lib/run.ts");
    const runner = new TaskRunner({ dryRun: true });
    await runner.run();

    const content = fs.readFileSync(path.join(tmpDir, "ROADMAP.md"), "utf-8");
    expect(content).toContain("[x] id:001");
  });
});
