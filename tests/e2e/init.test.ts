import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CLI_PATH = path.resolve(__dirname, "../../bin/init.ts");

describe("Init Flow", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-team-init-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should initialize a project with a team", () => {
    const proc = spawnSync(
      "bun",
      [CLI_PATH, "init", "--team", "software development", "--no-human-review"],
      {
        cwd: tmpDir,
      },
    );

    expect(proc.status).toBe(0);

    // Check for expected files
    expect(fs.existsSync(path.join(tmpDir, "docs/ARCHITECTURE.md"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, "SKILL.md"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, ".claude/settings.json"))).toBe(
      true,
    );
    expect(fs.existsSync(path.join(tmpDir, "agent-team.json"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, "ROADMAP.md"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, ".claude-loop/memory.md"))).toBe(
      true,
    );

    // Verify content of docs/ARCHITECTURE.md
    const archContent = fs.readFileSync(
      path.join(tmpDir, "docs/ARCHITECTURE.md"),
      "utf-8",
    );
    expect(archContent).toContain("# agent-team Architecture");

    // Verify content of SKILL.md
    const skillContent = fs.readFileSync(
      path.join(tmpDir, "SKILL.md"),
      "utf-8",
    );
    expect(skillContent).toContain("# agent-team Skill");

    // Verify CLAUDE.md exists and contains team info
    expect(fs.existsSync(path.join(tmpDir, "CLAUDE.md"))).toBe(true);
    const claudeMdContent = fs.readFileSync(
      path.join(tmpDir, "CLAUDE.md"),
      "utf-8",
    );
    expect(claudeMdContent).toContain("# Agent Team: software development");
  });

  it("should not overwrite existing ARCHITECTURE.md and SKILL.md", () => {
    // Pre-create files
    const docsDir = path.join(tmpDir, "docs");
    fs.mkdirSync(docsDir, { recursive: true });

    const archPath = path.join(docsDir, "ARCHITECTURE.md");
    const skillPath = path.join(tmpDir, "SKILL.md");

    fs.writeFileSync(archPath, "PRE-EXISTING ARCH");
    fs.writeFileSync(skillPath, "PRE-EXISTING SKILL");

    // Run init
    spawnSync(
      "bun",
      [CLI_PATH, "init", "--team", "software development", "--no-human-review"],
      {
        cwd: tmpDir,
      },
    );

    const archContent = fs.readFileSync(archPath, "utf-8");
    const skillContent = fs.readFileSync(skillPath, "utf-8");

    expect(archContent).toBe("PRE-EXISTING ARCH");
    expect(skillContent).toBe("PRE-EXISTING SKILL");
  });
});
