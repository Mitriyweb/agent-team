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

describe("plan.ts", () => {
  let tmpDir: string;
  let origCwd: string;

  beforeEach(() => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "agt-plan-test-")),
    );
    origCwd = process.cwd();
    process.chdir(tmpDir);
    spyOn(common, "log").mockImplementation(() => {});
    spyOn(common, "ok").mockImplementation(() => {});
    spyOn(common, "warn").mockImplementation(() => {});
    spyOn(common, "err").mockImplementation((m) => {
      throw new Error(m);
    });
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
    fs.mkdirSync(path.join(tmpDir, ".claude/agents"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, ".claude/agents/lead.md"),
      "---\nname: team-lead\nmodel: sonnet\n---\n",
    );

    fs.writeFileSync(path.join(tmpDir, "ROADMAP.md"), "Goal");
    const originalSpawn = Bun.spawn;
    // @ts-expect-error
    Bun.spawn = mock(() => ({
      stdout: new Response("PLAN_READY").body,
      stderr: new Response("").body,
      exited: Promise.resolve(0),
    }));

    await planRoadmap(path.join(tmpDir, "ROADMAP.md"));

    // Test failure case
    // @ts-expect-error
    Bun.spawn = mock(() => ({
      stdout: new Response("FAILED").body,
      stderr: new Response("some error").body,
      exited: Promise.resolve(1),
    }));
    try {
      await planRoadmap(path.join(tmpDir, "ROADMAP.md"));
    } catch (_e) {}

    Bun.spawn = originalSpawn;
  });

  it("covers planRoadmap openspec", async () => {
    fs.mkdirSync(path.join(tmpDir, ".claude/agents"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, ".claude/agents/lead.md"),
      "---\nname: team-lead\nmodel: sonnet\n---\n",
    );
    fs.writeFileSync(path.join(tmpDir, "ROADMAP.md"), "Goal");
    fs.writeFileSync(
      path.join(tmpDir, "agent-team.json"),
      JSON.stringify({ planner: "openspec" }),
    );

    const originalSpawn = Bun.spawn;
    const originalSpawnSync = Bun.spawnSync;

    // @ts-expect-error
    Bun.spawnSync = mock(() => ({ success: true }));
    // @ts-expect-error
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

    await planRoadmap(path.join(tmpDir, "ROADMAP.md"));
    expect(fs.existsSync(path.join(tmpDir, "tasks/plan.md"))).toBe(true);

    // Test existing openspec change logic
    const existingInput = path.join(changeDir, "ROADMAP.md");
    fs.writeFileSync(existingInput, "Goal");
    await planRoadmap(existingInput);

    Bun.spawn = originalSpawn;
    Bun.spawnSync = originalSpawnSync;
  });

  it("handles missing input file", async () => {
    try {
      await planRoadmap("nonexistent.md");
    } catch (_e) {}
  });
});
