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
import readline from "node:readline";
import * as team from "../../lib/team.ts";

describe("team.ts", () => {
  let tmpDir: string;
  let origCwd: string;

  beforeEach(() => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "agt-team-test-")),
    );
    origCwd = process.cwd();
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

  it("covers team creation and initialization", async () => {
    process.chdir(tmpDir);
    const originalSpawnSync = Bun.spawnSync;
    // @ts-expect-error
    Bun.spawnSync = mock(() => ({ success: true }));

    // Create team
    await team.createTeam({
      name: "test-team",
      description: "desc",
      roles: "lead,dev",
      humanReview: false,
    });
    expect(fs.existsSync(".claude/agents/te-PROTOCOL.md")).toBe(true);
    expect(fs.existsSync(".claude/agents/te-lead.md")).toBe(true);
    expect(fs.existsSync(".claude/agents/te-dev.md")).toBe(true);

    // Init project with OpenSpec
    await team.initProject({
      teamName: "test-team",
      planner: "openspec",
      humanReview: false,
    });
    expect(fs.readFileSync("agent-team.json", "utf-8")).toContain("openspec");

    // Init with existing team and confirmation
    fs.writeFileSync("agent-team.json", JSON.stringify({ team: "old-team" }));

    // Mock readline for confirmation
    const rlMock = {
      question: mock((_q, cb) => cb("y")),
      close: mock(() => {}),
    };
    spyOn(readline, "createInterface").mockReturnValue(rlMock as any);

    // Create dummy source agents
    fs.mkdirSync("agents/test-team", { recursive: true });
    fs.writeFileSync("agents/test-team/agent.md", "# Agent\n## Instructions\n");
    fs.writeFileSync("agents/test-team/settings.json", "{}");

    await team.initProject({ teamName: "test-team" });

    // Validate team
    team.validateTeam("test-team");

    Bun.spawnSync = originalSpawnSync;
  });

  it("covers update and reconfigure with more branches", async () => {
    process.chdir(tmpDir);
    fs.mkdirSync(".claude/agents", { recursive: true });
    fs.writeFileSync("agent-team.json", JSON.stringify({ team: "test" }));
    fs.mkdirSync("agents/test/skills", { recursive: true });
    fs.mkdirSync("agents/test/scripts", { recursive: true });
    fs.writeFileSync("agents/test/settings.json", "{}");
    fs.writeFileSync("agents/test/skills/s.md", "skill");
    fs.writeFileSync("agents/test/scripts/s.sh", "script");

    // Create an agent file with legacy references to test replacement
    fs.writeFileSync(
      ".claude/agents/test.md",
      "# Test\n## Instructions\nRun ./scripts/run.sh and plan.sh\n",
    );

    await team.updateProject({ sourceDir: "." });
    expect(fs.readFileSync(".claude/agents/test.md", "utf-8")).toContain(
      "agent-team run",
    );

    await team.reconfigureProject({ sourceDir: "." });
    expect(fs.existsSync(".claude/agents/skills/s.md")).toBe(true);
    expect(fs.existsSync(".claude/agents/scripts/s.sh")).toBe(true);

    // Test embedded extraction with a known team
    fs.writeFileSync("agent-team.json", JSON.stringify({ team: "frontend" }));
    await team.updateProject({});
    await team.reconfigureProject({});
    expect(fs.existsSync(".claude/agents/PROTOCOL.md")).toBe(true);
  });

  it("handles various edge cases and migration", async () => {
    process.chdir(tmpDir);
    // Migration with existing content
    fs.mkdirSync(".claude-loop", { recursive: true });
    fs.writeFileSync(
      ".claude-loop/memory.md",
      "# Project Memory\nExisting decision",
    );
    fs.writeFileSync("MEMORY.md", "# Project Memory\nNew decision");
    await team.initProject({});
    expect(fs.readFileSync(".claude-loop/memory.md", "utf-8")).toContain(
      "New decision",
    );

    // Confirmation rejection
    fs.writeFileSync("agent-team.json", JSON.stringify({ team: "old" }));
    fs.mkdirSync(".claude/agents", { recursive: true });
    const rlMock = {
      question: mock((_q, cb) => cb("n")),
      close: mock(() => {}),
    };
    spyOn(readline, "createInterface").mockReturnValue(rlMock as any);
    await team.initProject({ teamName: "new" });
    // Should not have deleted .claude/agents if cancelled
    expect(fs.existsSync(".claude/agents")).toBe(true);

    // Validation failures
    fs.rmSync(".claude/agents", { recursive: true, force: true });
    fs.mkdirSync(".claude/agents", { recursive: true });
    try {
      team.validateTeam("t");
    } catch (_e) {}

    fs.writeFileSync(".claude/agents/agent.md", "no header");
    try {
      team.validateTeam("t");
    } catch (_e) {}
  });

  it("covers helper functions", () => {
    // @ts-expect-error
    expect(team.listSourceTeams(tmpDir)).toEqual([]);
    fs.mkdirSync(path.join(tmpDir, "agents/t1"), { recursive: true });
    // @ts-expect-error
    expect(team.listSourceTeams(tmpDir)).toContain("t1");
  });
});
