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
import * as common from "../../lib/common.ts";
import { TaskRunner } from "../../lib/run.ts";

describe("run.ts", () => {
  let tmpDir: string;
  let origCwd: string;

  beforeEach(() => {
    origCwd = process.cwd();
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "agt-run-test-")),
    );
    process.chdir(tmpDir);

    spyOn(common, "log").mockImplementation(() => {});
    spyOn(common, "ok").mockImplementation(() => {});
    spyOn(common, "warn").mockImplementation(() => {});
    spyOn(common, "err").mockImplementation((m) => {
      if (
        m &&
        typeof m === "string" &&
        (m.includes("Status: FAILED") ||
          m.includes("review rejected") ||
          m.includes("Budget exceeded"))
      )
        return;
      throw new Error(m);
    });
  });

  afterEach(() => {
    process.chdir(origCwd);
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_e) {}
    mock.restore();
  });

  it(
    "covers TaskRunner",
    async () => {
      const agentsDir = path.join(tmpDir, ".claude", "agents");
      fs.mkdirSync(agentsDir, { recursive: true });
      fs.writeFileSync(
        path.join(agentsDir, "lead.md"),
        "---\nname: team-lead\nmodel: opus\n---\n",
      );

      const loopDir = path.join(tmpDir, ".claude-loop");
      fs.mkdirSync(loopDir, { recursive: true });
      fs.writeFileSync(path.join(loopDir, "memory.md"), "# Memory");

      const tasksDir = path.join(tmpDir, "tasks");
      fs.mkdirSync(tasksDir, { recursive: true });
      const planFile = path.join(tasksDir, "plan.md");
      fs.writeFileSync(
        planFile,
        "```\n- [ ] id:1 priority:high type:feature agents:dev Task\n```\n### Task #1 — Task\nDetails\n",
      );

      const originalSpawn = Bun.spawn;
      // @ts-expect-error
      Bun.spawn = mock(() => ({
        stdout: new Response(
          JSON.stringify({
            result: "TASK_STATUS: SUCCESS",
            usage: { input_tokens: 1, output_tokens: 1 },
          }),
        ).body,
        stderr: new Response("").body,
        exited: Promise.resolve(0),
      }));

      const runner = new TaskRunner({ dryRun: false, all: true });
      await runner.run();
      expect(fs.readFileSync(planFile, "utf-8")).toContain("[x] id:1");

      // Failure case and retry
      fs.writeFileSync(
        planFile,
        "```\n- [ ] id:2 priority:high type:feature agents:dev Task 2\n```",
      );
      // @ts-expect-error
      Bun.spawn = mock(() => ({
        stdout: new Response("TASK_STATUS: FAILED: oops").body,
        stderr: new Response("").body,
        exited: Promise.resolve(0),
      }));
      const runner2 = new TaskRunner({ retryLimit: 0, all: true });
      await runner2.run();
      expect(fs.readFileSync(planFile, "utf-8")).toContain("[!] id:2");

      // Human review needed
      fs.writeFileSync(
        planFile,
        "```\n- [ ] id:3 priority:high type:feature agents:dev Task 3\n```",
      );
      // @ts-expect-error
      Bun.spawn = mock(() => ({
        stdout: new Response("TASK_STATUS: HUMAN_REVIEW_NEEDED").body,
        stderr: new Response("").body,
        exited: Promise.resolve(0),
      }));
      const rlMock = {
        question: mock((_q, cb) => cb("y")),
        close: mock(() => {}),
      };
      spyOn(readline, "createInterface").mockReturnValue(rlMock as any);
      const runner3 = new TaskRunner({ all: true });
      await runner3.run();
      expect(fs.readFileSync(planFile, "utf-8")).toContain("[x] id:3");

      Bun.spawn = originalSpawn;
    },
    { timeout: 10000 },
  );

  it("covers TaskRunner edge cases", async () => {
    // Missing roadmap
    const runner = new TaskRunner({ roadmapFile: "nonexistent.md" });
    await runner.run();

    // Legacy memory migration
    fs.writeFileSync("MEMORY.md", "old memory");
    new TaskRunner({});
    expect(fs.existsSync(".claude-loop/memory.md")).toBe(true);
    expect(fs.readFileSync(".claude-loop/memory.md", "utf-8")).toContain(
      "old memory",
    );

    // Budget exceeded
    const reportsDir = ".claude-loop/reports";
    if (!fs.existsSync(reportsDir))
      fs.mkdirSync(reportsDir, { recursive: true });
    fs.writeFileSync(
      path.join(reportsDir, "cost-summary.json"),
      JSON.stringify({ total_cost: 10 }),
    );
    const runner2 = new TaskRunner({ budget: 5, all: true });
    const tasksDir = "tasks";
    if (!fs.existsSync(tasksDir)) fs.mkdirSync(tasksDir, { recursive: true });
    fs.writeFileSync(
      path.join(tasksDir, "plan.md"),
      "```\n- [ ] id:1 priority:high type:feature agents:dev Task\n```",
    );
    await runner2.run();
  });

  it("covers extractTaskStatus and findLatestOpenSpecChange", async () => {
    const runner = new TaskRunner({});
    // @ts-expect-error
    expect(runner.extractTaskStatus("TASK_STATUS: SUCCESS")).toBe("SUCCESS");
    // @ts-expect-error
    expect(
      runner.extractTaskStatus(
        JSON.stringify({ result: "TASK_STATUS: SUCCESS" }),
      ),
    ).toBe("SUCCESS");
    // @ts-expect-error
    expect(runner.extractTaskStatus("oops")).toBe("MISSING");

    // findLatestOpenSpecChange
    fs.mkdirSync("openspec/changes/c1", { recursive: true });
    fs.writeFileSync("openspec/changes/c1/proposal.md", "p");

    if (fs.existsSync("ROADMAP.md")) fs.unlinkSync("ROADMAP.md");
    const originalSpawn = Bun.spawn;
    // @ts-expect-error
    Bun.spawn = mock(() => ({
      stdout: new Response("PLAN_READY").body,
      exited: Promise.resolve(0),
    }));
    await runner.run();
    Bun.spawn = originalSpawn;
  });
});
