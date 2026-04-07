import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const PROJECT_ROOT = import.meta.dir.replace(/\/tests\/lib$/, "");

describe("bundle-agents.ts", () => {
  let tmpDir: string;
  let origCwd: string;

  beforeEach(() => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "agt-bundle-test-")),
    );
    origCwd = PROJECT_ROOT;
  });

  afterEach(() => {
    process.chdir(origCwd);
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_e) {}
  });

  it("successfully bundles agents into embedded-agents.ts", () => {
    // Create a mock repo structure
    const agentsDir = path.join(tmpDir, "agents");
    const libDir = path.join(tmpDir, "lib");
    fs.mkdirSync(path.join(agentsDir, "team1"), { recursive: true });
    fs.mkdirSync(libDir, { recursive: true });

    fs.writeFileSync(path.join(agentsDir, "team1/agent.md"), "content");
    fs.writeFileSync(path.join(agentsDir, "team1/script.sh"), "echo hi");

    // Copy the script to tmpDir to run it
    const scriptContent = fs
      .readFileSync("lib/bundle-agents.ts", "utf-8")
      .replace(
        'path.join(import.meta.dir, "..", "agents")',
        'path.join(process.cwd(), "agents")',
      )
      .replace(
        'path.join(import.meta.dir, "embedded-agents.ts")',
        'path.join(process.cwd(), "lib", "embedded-agents.ts")',
      );

    const scriptPath = path.join(tmpDir, "lib/bundle-agents.ts");
    fs.writeFileSync(scriptPath, scriptContent);

    process.chdir(tmpDir);
    const proc = spawnSync("bun", ["lib/bundle-agents.ts"]);
    expect(proc.status).toBe(0);

    const output = fs.readFileSync("lib/embedded-agents.ts", "utf-8");
    expect(output).toContain("team1");
    expect(output).toContain("agent.md");
    expect(output).toContain("script.sh");
    expect(output).toContain("isBinary: true");
  });
});
