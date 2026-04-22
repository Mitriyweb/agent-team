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
import * as p from "@clack/prompts";
import * as common from "../../lib/common.ts";
import { TaskRunner } from "../../lib/run.ts";
import * as team from "../../lib/team.ts";

const PROJECT_ROOT = import.meta.dir.replace(/\/tests\/lib$/, "");

describe("Obsidian Vault Integration", () => {
  let tmpDir: string;
  let vaultDir: string;
  let origCwd: string;

  beforeEach(() => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "agt-obsidian-test-")),
    );
    vaultDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "agt-vault-")),
    );
    origCwd = process.cwd();
    process.chdir(tmpDir);

    spyOn(common, "log").mockImplementation(() => {});
    spyOn(common, "ok").mockImplementation(() => {});
    spyOn(common, "warn").mockImplementation(() => {});
    spyOn(common, "err").mockImplementation((m) => {
      throw new Error(m as string);
    });
  });

  afterEach(() => {
    process.chdir(origCwd);
    try {
      if (tmpDir && fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
      if (vaultDir && fs.existsSync(vaultDir)) {
        fs.rmSync(vaultDir, { recursive: true, force: true });
      }
    } catch (_e) {}
    mock.restore();
  });

  it("should create a symlink to the Obsidian vault", () => {
    team.manageVaultSymlink(vaultDir);
    const vaultLink = path.join(".claude", "vault");
    expect(fs.existsSync(vaultLink)).toBe(true);
    expect(fs.lstatSync(vaultLink).isSymbolicLink()).toBe(true);
    expect(fs.readlinkSync(vaultLink)).toBe(vaultDir);
  });

  it("should expand ~ in the vault path before creating the symlink", () => {
    const home = os.homedir();
    const relativeFromHome = path.relative(home, vaultDir);
    if (relativeFromHome.startsWith("..")) {
      // vaultDir not under home → emulate by creating inside home
      const fakeVaultName = `agt-vault-home-${Date.now()}`;
      const fakeVault = path.join(home, fakeVaultName);
      fs.mkdirSync(fakeVault, { recursive: true });
      try {
        team.manageVaultSymlink(`~/${fakeVaultName}`);
        const vaultLink = path.join(".claude", "vault");
        expect(fs.readlinkSync(vaultLink)).toBe(fakeVault);
      } finally {
        fs.rmSync(fakeVault, { recursive: true, force: true });
      }
      return;
    }
    team.manageVaultSymlink(`~/${relativeFromHome}`);
    expect(fs.readlinkSync(path.join(".claude", "vault"))).toBe(vaultDir);
  });

  it("should render the resolved symlink target in the agent prompt", () => {
    team.manageVaultSymlink(vaultDir);

    const agentsDir = path.join(".claude", "agents");
    fs.mkdirSync(agentsDir, { recursive: true });
    fs.writeFileSync(
      path.join(agentsDir, "sw-team-lead.md"),
      "---\nname: sw-team-lead\nmodel: sonnet\n---\n",
    );
    const roadmapFile = "ROADMAP.md";
    fs.writeFileSync(
      roadmapFile,
      "```\n- [ ] id:1 priority:high agents:sw-developer Test task\n```\n### Task #1 — Test task\nSpec",
    );

    const runner = new TaskRunner({ roadmapFile });
    // biome-ignore lint/suspicious/noExplicitAny: private
    const prompt = (runner as any).buildPrompt("1", "Test task", "Spec");

    expect(prompt).toContain(`.claude/vault -> ${vaultDir}`);
  });

  it("should remove the symlink if vaultPath is undefined", () => {
    team.manageVaultSymlink(vaultDir);
    expect(fs.existsSync(path.join(".claude", "vault"))).toBe(true);

    team.manageVaultSymlink(undefined);
    expect(fs.existsSync(path.join(".claude", "vault"))).toBe(false);
  });

  it("should update .gitignore with .claude/vault during init", async () => {
    await team.initProject({
      teamName: "software development",
      vaultPath: vaultDir,
      sourceDir: PROJECT_ROOT,
    });

    const gitignore = fs.readFileSync(".gitignore", "utf-8");
    expect(gitignore).toContain(".claude/vault");

    const config = JSON.parse(fs.readFileSync("agent-team.json", "utf-8"));
    expect(config.vaultPath).toBe(vaultDir);

    expect(fs.existsSync(path.join(".claude", "vault"))).toBe(true);
  });

  it("should allow reconfiguring the vault path", async () => {
    // Initial setup
    fs.writeFileSync(
      "agent-team.json",
      JSON.stringify({ team: "software development", planner: "builtin" }),
    );

    // Mock prompts for reconfigure
    const newVaultDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "agt-new-vault-"),
    );

    spyOn(p, "group").mockResolvedValue({
      vaultPath: newVaultDir,
      // biome-ignore lint/suspicious/noExplicitAny: mock
    } as any);
    spyOn(p, "confirm").mockResolvedValue(false);

    await team.reconfigureProject({ sourceDir: PROJECT_ROOT });

    const config = JSON.parse(fs.readFileSync("agent-team.json", "utf-8"));
    expect(config.vaultPath).toBe(newVaultDir);
    expect(fs.readlinkSync(path.join(".claude", "vault"))).toBe(newVaultDir);

    fs.rmSync(newVaultDir, { recursive: true, force: true });
  });

  it("should inject vault context into the agent prompt", async () => {
    team.manageVaultSymlink(vaultDir);

    const agentsDir = path.join(".claude", "agents");
    fs.mkdirSync(agentsDir, { recursive: true });
    fs.writeFileSync(
      path.join(agentsDir, "sw-team-lead.md"),
      "---\nname: sw-team-lead\nmodel: sonnet\n---\n",
    );

    const roadmapFile = "ROADMAP.md";
    fs.writeFileSync(
      roadmapFile,
      "```\n- [ ] id:1 priority:high agents:sw-developer Test task\n```\n### Task #1 — Test task\nSpec",
    );

    const runner = new TaskRunner({ roadmapFile });
    // biome-ignore lint/suspicious/noExplicitAny: private
    const prompt = (runner as any).buildPrompt("1", "Test task", "Spec");

    expect(prompt).toContain("## Knowledge Base (Obsidian Vault)");
    expect(prompt).toContain("An Obsidian vault is connected at");
    expect(prompt).toContain(".claude/vault");
  });
});
