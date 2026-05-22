import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const PROJECT_ROOT = path.resolve(__dirname, "../..");
const DIST_PATH = path.join(PROJECT_ROOT, "dist/agent-team");

describe("Compiled Build", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-team-build-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should build successfully", () => {
    // We expect the build to be already performed or we perform it here
    // Performing it here ensures we test the latest code
    const buildProc = spawnSync("bun", ["run", "build"], { cwd: PROJECT_ROOT });
    expect(buildProc.status).toBe(0);
    expect(fs.existsSync(DIST_PATH)).toBe(true);
  });

  it("should run the compiled binary and list agents", () => {
    const proc = spawnSync(DIST_PATH, ["agents"]);
    expect(proc.status).toBe(0);
    const stdout = proc.stdout.toString();
    expect(stdout).toContain("Registered Agents:");
    expect(stdout).toContain("sw-team-lead");
  });

  it("should run the compiled binary and initialize a project", () => {
    const proc = spawnSync(DIST_PATH, ["init", "--team", "software development", "--no-human-review"], {
      cwd: tmpDir,
    });

    expect(proc.status).toBe(0);

    // Check for expected files - this verifies templates were bundled correctly
    expect(fs.existsSync(path.join(tmpDir, "docs/ARCHITECTURE.md"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, "SKILL.md"))).toBe(true);

    const archContent = fs.readFileSync(path.join(tmpDir, "docs/ARCHITECTURE.md"), "utf-8");
    expect(archContent).toContain("# agent-team Architecture");

    const skillContent = fs.readFileSync(path.join(tmpDir, "SKILL.md"), "utf-8");
    expect(skillContent).toContain("# agent-team Skill");

    // Also verify CLAUDE.md and team agents were extracted
    expect(fs.existsSync(path.join(tmpDir, "CLAUDE.md"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, ".claude/agents/sw-PROTOCOL.md"))).toBe(true);
  });
});
