import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createTeam,
  initProject,
  reconfigureProject,
  updateProject,
} from "../../lib/team.ts";

let tmpDir: string;
let origCwd: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "team-test-"));
  origCwd = process.cwd();
  process.chdir(tmpDir);
});

afterEach(() => {
  process.chdir(origCwd);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("team.ts", () => {
  describe("initProject", () => {
    it("creates necessary directories and updates .gitignore", async () => {
      // Create source directory with some templates
      const srcDir = path.join(tmpDir, "src");
      fs.mkdirSync(path.join(srcDir, "agents"), { recursive: true });
      fs.mkdirSync(path.join(srcDir, ".agents/workflows"), { recursive: true });
      fs.writeFileSync(path.join(srcDir, "MEMORY.md"), "# Source Memory");

      const projectDir = path.join(tmpDir, "project");
      fs.mkdirSync(projectDir, { recursive: true });
      process.chdir(projectDir);

      await initProject({
        teamName: "dev",
        humanReview: true,
        sourceDir: srcDir,
      });

      expect(fs.existsSync("agents")).toBe(true);
      expect(fs.existsSync("tasks")).toBe(true);
      expect(fs.existsSync(".gitignore")).toBe(true);
      expect(fs.existsSync("agent-team.json")).toBe(true);
      expect(fs.existsSync(".agents/workflows")).toBe(true);

      const config = JSON.parse(fs.readFileSync("agent-team.json", "utf-8"));
      expect(config.team).toBe("dev");
    });
  });

  describe("createTeam", () => {
    it("creates a team directory from template", async () => {
      const projectDir = path.join(tmpDir, "project-create");
      fs.mkdirSync(projectDir, { recursive: true });
      process.chdir(projectDir);

      await createTeam({
        name: "test-team",
        description: "Test team",
        roles: "architect,developer",
        humanReview: true,
      });

      expect(fs.existsSync("agents/test-team")).toBe(true);
      expect(fs.existsSync("agents/test-team/te-architect.md")).toBe(true);
      expect(fs.existsSync("agents/test-team/te-developer.md")).toBe(true);
      expect(fs.existsSync("agents/test-team/te-PROTOCOL.md")).toBe(true);
    });
  });

  describe("updateProject", () => {
    it("refreshes configuration and documentation", async () => {
      const projectDir = path.join(tmpDir, "project-update");
      fs.mkdirSync(projectDir, { recursive: true });
      process.chdir(projectDir);

      fs.writeFileSync(".gitignore", "# Initial gitignore\n");
      fs.mkdirSync("agents/test-team", { recursive: true });
      fs.writeFileSync("agents/test-team/role.md", "Run ./scripts/run.sh here");

      await updateProject({ sourceDir: tmpDir });

      const gitignore = fs.readFileSync(".gitignore", "utf-8");
      expect(gitignore).toContain(".claude-loop/");

      const role = fs.readFileSync("agents/test-team/role.md", "utf-8");
      expect(role).toContain("agent-team run");
    });
  });

  describe("reconfigureProject", () => {
    it("updates skills and workflows", async () => {
      const srcDir = path.join(tmpDir, "src");
      fs.mkdirSync(path.join(srcDir, ".agents/workflows"), { recursive: true });
      fs.writeFileSync(
        path.join(srcDir, ".agents/workflows/test.md"),
        "New workflow",
      );
      fs.mkdirSync(path.join(srcDir, "agents/test-team/skills"), {
        recursive: true,
      });
      fs.writeFileSync(
        path.join(srcDir, "agents/test-team/skills/new.md"),
        "New skill",
      );

      const projectDir = path.join(tmpDir, "project-reconfig");
      fs.mkdirSync(projectDir, { recursive: true });
      process.chdir(projectDir);

      fs.mkdirSync("agents/test-team", { recursive: true });
      fs.writeFileSync(
        "agent-team.json",
        JSON.stringify({ team: "test-team", planner: "builtin" }),
      );

      await reconfigureProject({ sourceDir: srcDir });

      expect(fs.existsSync(".agents/workflows/test.md")).toBe(true);
      expect(fs.existsSync("agents/test-team/skills/new.md")).toBe(true);
    });
  });
});
