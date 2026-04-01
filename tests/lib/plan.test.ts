import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { planRoadmap } from "../../lib/plan.ts";

let tmpDir: string;
let origCwd: string;
let origConsole: {
  log: typeof console.log;
  warn: typeof console.warn;
  error: typeof console.error;
};

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "plan-test-"));
  origCwd = process.cwd();
  origConsole = {
    log: console.log,
    warn: console.warn,
    error: console.error,
  };
  console.log = () => {};
  console.warn = () => {};
  console.error = () => {};
  process.chdir(tmpDir);
});

afterEach(() => {
  process.chdir(origCwd);
  console.log = origConsole.log;
  console.warn = origConsole.warn;
  console.error = origConsole.error;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("planRoadmap", () => {
  it("creates tasks/plan.md and parses task summary", async () => {
    const planContent = [
      "```",
      "- [ ] id:1 priority:high type:feature agents:architect,developer Build auth API",
      "- [ ] id:2 priority:medium type:test depends:1 agents:qa Write auth tests",
      "```",
      "",
      "### Task #1 — Build auth API",
      "**Agents:** architect, developer",
      "**Output:** src/auth.ts",
      "",
      "### Task #2 — Write auth tests",
      "**Agents:** qa",
      "**Depends on:** #1",
    ].join("\n");

    fs.writeFileSync(path.join(tmpDir, "ROADMAP.md"), "Build an auth system");

    const originalSpawn = Bun.spawn;
    // @ts-expect-error - mock override
    Bun.spawn = mock((_cmd: string[]) => {
      fs.mkdirSync(path.join(tmpDir, "tasks"), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, "tasks/plan.md"), planContent);
      const body = "PLAN_READY";
      return {
        stdout: new Response(body).body,
        stderr: null,
        exited: Promise.resolve(0),
        pid: 1,
        kill: () => {},
      };
    });

    try {
      await planRoadmap("ROADMAP.md");

      const planPath = path.join(tmpDir, "tasks/plan.md");
      expect(fs.existsSync(planPath)).toBe(true);

      const content = fs.readFileSync(planPath, "utf-8");
      expect(content).toContain("id:1");
      expect(content).toContain("id:2");
      expect(content).toContain("priority:high");
      expect(content).toContain("depends:1");
    } finally {
      Bun.spawn = originalSpawn;
    }
  });

  it("exits when input file is missing", () => {
    const originalExit = process.exit;
    let exitCode: number | undefined;
    process.exit = ((code: number) => {
      exitCode = code;
      throw new Error("exit");
    }) as typeof process.exit;

    try {
      // planRoadmap is async but err() throws synchronously via process.exit mock
      planRoadmap("nonexistent.md").catch(() => {});
    } catch (_e) {
      // expected
    } finally {
      process.exit = originalExit;
    }

    expect(exitCode).toBe(1);
  });
});
