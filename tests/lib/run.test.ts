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

    const runner = new TaskRunner({ all: true });
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

    Bun.spawn = originalSpawn;
  });
});
