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
import { TaskRunner } from "../../lib/run.ts";

const PROJECT_ROOT = import.meta.dir.replace(/\/tests\/lib$/, "");

describe("run.ts", () => {
  const rootDir = PROJECT_ROOT;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "agt-run-test-")),
    );
  });

  afterEach(() => {
    process.chdir(rootDir);
    delete process.env.NEW_KEY;
    try {
      if (tmpDir && fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    } catch (_e) {}
    mock.restore();
  });

  it("covers TaskRunner", async () => {
    process.chdir(tmpDir);
    spyOn(common, "log").mockImplementation(() => {});
    spyOn(common, "ok").mockImplementation(() => {});
    spyOn(common, "warn").mockImplementation(() => {});
    spyOn(common, "err").mockImplementation((m) => {
      throw new Error(m as string);
    });

    const agentsDir = path.join(tmpDir, ".claude", "agents");
    fs.mkdirSync(agentsDir, { recursive: true });
    fs.writeFileSync(path.join(agentsDir, "lead.md"), "---\nname: lead\n---\n");

    const tasksDir = path.join(tmpDir, "tasks");
    fs.mkdirSync(tasksDir, { recursive: true });
    const planFile = path.join(tasksDir, "plan.md");
    fs.writeFileSync(
      planFile,
      "```\n- [ ] id:1 priority:high agents:dev T\n```\n### Task #1 — T\nDetails",
    );

    const originalSpawn = Bun.spawn;
    // @ts-expect-error
    Bun.spawn = mock(() => ({
      stdout: new Response(JSON.stringify({ result: "TASK_STATUS: SUCCESS" }))
        .body,
      stderr: new Response("").body,
      exited: Promise.resolve(0),
    }));

    const runner = new TaskRunner({ all: true, cli: true });
    await runner.run();
    expect(fs.readFileSync(planFile, "utf-8")).toContain("[x] id:1");

    // extractTaskStatus variations
    // biome-ignore lint/suspicious/noExplicitAny: private
    const r = runner as any;
    expect(r.extractTaskStatus("Random")).toBe("MISSING");
    expect(
      r.extractTaskStatus(
        JSON.stringify({ result: { text: "TASK_STATUS: SUCCESS" } }),
      ),
    ).toBe("SUCCESS");
    expect(r.extractTaskStatus("TASK_STATUS: HUMAN_REVIEW_NEEDED")).toBe(
      "HUMAN_REVIEW_NEEDED",
    );
    expect(r.extractTaskStatus('{"result":"TASK_STATUS: SUCCESS"}')).toBe(
      "SUCCESS",
    );

    Bun.spawn = originalSpawn;
  });

  it("covers executeSetupCommands", async () => {
    process.chdir(tmpDir);
    spyOn(common, "log").mockImplementation(() => {});
    spyOn(common, "ok").mockImplementation(() => {});
    const originalSpawnSync = Bun.spawnSync;

    const runner = new TaskRunner({ all: true });
    // @ts-expect-error
    Bun.spawnSync = mock(() => ({
      success: true,
      stdout: Buffer.from(
        "out\n---AGENT-TEAM-ENV-uuid---\nNEW_KEY=NEW_VALUE\n",
      ),
    }));

    // Mock crypto.randomUUID to match our delimiter
    // @ts-expect-error
    spyOn(crypto, "randomUUID").mockReturnValue("uuid");

    // @ts-expect-error
    await runner.executeSetupCommands(["echo 1"]);
    expect(process.env.NEW_KEY).toBe("NEW_VALUE");

    Bun.spawnSync = originalSpawnSync;
  });

  it("covers recoverStuckTasks", () => {
    process.chdir(tmpDir);
    spyOn(common, "log").mockImplementation(() => {});
    spyOn(common, "ok").mockImplementation(() => {});
    spyOn(common, "warn").mockImplementation(() => {});

    // Legacy format requires a code block
    fs.writeFileSync(
      "ROADMAP.md",
      "```\n- [~] id:1 priority:high agents:dev T\n```",
    );
    const runner = new TaskRunner({ all: true });
    // @ts-expect-error
    runner.recoverStuckTasks();
    // No logs, should reset to [ ]
    expect(fs.readFileSync("ROADMAP.md", "utf-8")).toContain("[ ] id:1");

    // With log
    fs.writeFileSync(
      "ROADMAP.md",
      "```\n- [~] id:1 priority:high agents:dev T\n```",
    );
    fs.mkdirSync(".claude-loop/logs", { recursive: true });
    fs.writeFileSync(".claude-loop/logs/task-1-ts.log", "done");
    // @ts-expect-error
    runner.recoverStuckTasks();
    expect(fs.readFileSync("ROADMAP.md", "utf-8")).toContain("[x] id:1");
  });
});
