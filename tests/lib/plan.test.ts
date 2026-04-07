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

    const originalSpawn = Bun.spawn;
    const originalSpawnSync = Bun.spawnSync;

    // @ts-expect-error: mock Bun.spawnSync
    Bun.spawnSync = mock(() => ({ success: true }));
    // @ts-expect-error: mock Bun.spawn
    Bun.spawn = mock(() => ({
      stdout: new Response("PLAN_READY").body,
      stderr: new Response("").body,
      exited: Promise.resolve(0),
    }));

    spyOn(Date, "now").mockReturnValue(12345);
    const changeDir = path.join(tmpDir, "openspec/changes/roadmap-12345");
    fs.mkdirSync(changeDir, { recursive: true });
    fs.writeFileSync(
      path.join(changeDir, "tasks.md"),
      "## 1. Test\n- [ ] 1.1 Task 1\n- [ ] 1.2 Task 2\n## 2. Implementation\n- [ ] 2.1 Task 3",
    );
    fs.writeFileSync(path.join(changeDir, "proposal.md"), "Proposal content");
    fs.writeFileSync(path.join(changeDir, "design.md"), "Design content");

    await planRoadmap(roadmapFile);
    expect(fs.existsSync(path.join(tmpDir, "tasks/plan.md"))).toBe(true);

    // Test existing openspec change logic (already has tasks.md)
    const existingChangePath = path.join(changeDir, "ROADMAP.md");
    fs.writeFileSync(existingChangePath, "Goal");
    await planRoadmap(existingChangePath);

    // Test OpenSpec failure case
    // @ts-expect-error: mock Bun.spawnSync
    Bun.spawnSync = mock(() => ({ success: false }));
    await expect(planRoadmap(roadmapFile)).rejects.toThrow(
      "Failed to create OpenSpec change",
    );

    Bun.spawn = originalSpawn;
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
