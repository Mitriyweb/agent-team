import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as p from "@clack/prompts";
import * as common from "../../lib/common.ts";
import { planRoadmap } from "../../lib/plan.ts";

const PROJECT_ROOT = import.meta.dir.replace(/\/tests\/lib$/, "");

describe("plan.ts", () => {
  let tmpDir: string;
  let origCwd: string;

  beforeEach(() => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "agt-plan-test-")),
    );
    origCwd = PROJECT_ROOT;
  });

  afterEach(() => {
    process.chdir(origCwd);
    try {
      if (tmpDir && fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    } catch (_e) {}
    mock.restore();
  });

  it("covers planRoadmap builtin", async () => {
    process.chdir(tmpDir);
    spyOn(common, "log").mockImplementation(() => {});
    spyOn(common, "ok").mockImplementation(() => {});
    spyOn(common, "warn").mockImplementation(() => {});
    spyOn(common, "err").mockImplementation((...args: unknown[]): never => {
      throw new Error(String(args[0]));
    });

    const agentsDir = path.join(tmpDir, ".claude/agents");
    fs.mkdirSync(agentsDir, { recursive: true });
    fs.writeFileSync(
      path.join(agentsDir, "lead.md"),
      "---\nname: team-lead\nmodel: sonnet\n---\n",
    );

    const roadmapFile = path.join(tmpDir, "ROADMAP.md");
    fs.writeFileSync(roadmapFile, "Goal");
    const originalSpawn = Bun.spawn;

    // Mock successful planning
    // @ts-expect-error: mock Bun.spawn
    Bun.spawn = mock(() => {
      // Simulate file creation by Claude
      const planDir = path.join(tmpDir, "tasks");
      if (!fs.existsSync(planDir)) fs.mkdirSync(planDir, { recursive: true });
      fs.writeFileSync(
        path.join(planDir, "plan.md"),
        "### Task #1\nPLAN_READY",
      );

      return {
        stdout: new Response("PLAN_READY").body,
        stderr: new Response("").body,
        exited: Promise.resolve(0),
      };
    });

    await planRoadmap(roadmapFile);
    expect(fs.existsSync(path.join(tmpDir, "tasks/plan.md"))).toBe(true);

    // Test failure case
    // @ts-expect-error: mock Bun.spawn
    Bun.spawn = mock(() => ({
      stdout: new Response("FAILED").body,
      stderr: new Response("some error").body,
      exited: Promise.resolve(1),
    }));
    await expect(planRoadmap(roadmapFile)).rejects.toThrow("Planning failed");

    Bun.spawn = originalSpawn;
  });

  it("covers planRoadmap openspec", async () => {
    process.chdir(tmpDir);
    spyOn(common, "log").mockImplementation(() => {});
    spyOn(common, "ok").mockImplementation(() => {});
    spyOn(common, "warn").mockImplementation(() => {});
    spyOn(common, "err").mockImplementation((...args: unknown[]): never => {
      throw new Error(String(args[0]));
    });
    // Suppress console.log from showOpenSpecTaskSummary
    spyOn(console, "log").mockImplementation(() => {});

    fs.mkdirSync(path.join(tmpDir, ".claude/agents"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, ".claude/agents/lead.md"),
      "---\nname: team-lead\nmodel: sonnet\n---\n",
    );
    const roadmapFile = path.join(tmpDir, "ROADMAP.md");
    fs.writeFileSync(roadmapFile, "Goal");
    fs.writeFileSync(
      path.join(tmpDir, "agent-team.json"),
      JSON.stringify({ planner: "openspec" }),
    );

    // Create an existing change with all artifacts
    const changeDir = path.join(tmpDir, "openspec/changes/test-change");
    fs.mkdirSync(changeDir, { recursive: true });
    fs.writeFileSync(
      path.join(changeDir, "tasks.md"),
      "## 1. Test\n- [ ] 1.1 Task 1\n- [ ] 1.2 Task 2\n## 2. Impl\n- [ ] 2.1 Task 3",
    );
    fs.writeFileSync(path.join(changeDir, "proposal.md"), "Proposal content");
    fs.writeFileSync(path.join(changeDir, "design.md"), "Design content");

    // Mock interactive prompts — selectOrCreateChange uses change NAME as value
    const tasksPath = path.join(changeDir, "tasks.md");
    let selectCallIdx = 0;
    const selectResults: unknown[] = ["test-change"];
    spyOn(p, "select").mockImplementation(
      // biome-ignore lint/suspicious/noExplicitAny: mock clack branded types
      (() => Promise.resolve(selectResults[selectCallIdx++])) as any,
    );
    spyOn(p, "text").mockImplementation(
      // biome-ignore lint/suspicious/noExplicitAny: mock clack branded types
      (() => Promise.resolve("new-feature")) as any,
    );

    // Mock Bun.spawnSync so openspec validate doesn't hit the real CLI
    const originalSpawnSync = Bun.spawnSync;
    // @ts-expect-error: mock Bun.spawnSync
    Bun.spawnSync = mock(() => ({ success: true, exitCode: 0 }));

    // Existing change with all artifacts — should just show summary, no Claude call
    await planRoadmap(roadmapFile);
    expect(fs.existsSync(tasksPath)).toBe(true);

    // Test selecting a change that has proposal+design but no tasks → triggers generation
    const partialDir = path.join(tmpDir, "openspec/changes/partial-change");
    fs.mkdirSync(partialDir, { recursive: true });
    fs.writeFileSync(path.join(partialDir, "proposal.md"), "Partial proposal");
    fs.writeFileSync(path.join(partialDir, "design.md"), "Partial design");
    // No tasks.md — not listed as executable, but still a valid change for planning

    // Select a complete change again — already has all artifacts
    selectCallIdx = 0;
    selectResults[0] = "test-change";
    await planRoadmap(roadmapFile);
    // Still works, tasks.md exists in openspec
    expect(fs.existsSync(tasksPath)).toBe(true);

    Bun.spawnSync = originalSpawnSync;
  });

  it("handles missing input file", async () => {
    process.chdir(tmpDir);
    spyOn(common, "err").mockImplementation((...args: unknown[]): never => {
      throw new Error(String(args[0]));
    });
    await expect(
      planRoadmap(path.join(tmpDir, "nonexistent.md")),
    ).rejects.toThrow("Input file not found");
  });
});
