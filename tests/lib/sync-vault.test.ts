import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { syncVault } from "../../lib/sync-vault.ts";

const PROJECT_ROOT = import.meta.dir.replace(/\/tests\/lib$/, "");

describe("sync-vault.ts", () => {
  let tmpDir: string;
  let origCwd: string;

  beforeEach(() => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "agt-vault-test-")),
    );
    origCwd = PROJECT_ROOT;
    process.chdir(tmpDir);
  });

  afterEach(() => {
    process.chdir(origCwd);
    try {
      if (tmpDir && fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    } catch (_e) {}
  });

  it("throws when source directory does not exist", async () => {
    await expect(
      syncVault({
        agentsDir: path.join(tmpDir, "nonexistent"),
        vaultDir: path.join(tmpDir, "vault"),
      }),
    ).rejects.toThrow("Source directory not found");
  });

  it("throws when no .md files are found", async () => {
    const agentsDir = path.join(tmpDir, "agents");
    fs.mkdirSync(agentsDir);
    // Only non-md files — nothing to sync
    fs.writeFileSync(path.join(agentsDir, "README.txt"), "hello");

    await expect(
      syncVault({
        agentsDir,
        vaultDir: path.join(tmpDir, "vault"),
      }),
    ).rejects.toThrow("No .md files found");
  });

  it("syncs agents to vault and generates index", async () => {
    const agentsDir = path.join(tmpDir, "agents");
    const vaultDir = path.join(tmpDir, "vault");
    fs.mkdirSync(agentsDir, { recursive: true });

    // Agent with full frontmatter, team table and skills reference
    fs.writeFileSync(
      path.join(agentsDir, "lead.md"),
      [
        "---",
        "name: team-lead",
        "description: Orchestrates the team",
        "model: claude-sonnet-4-5",
        "tools: Task, Read, Write",
        "---",
        "",
        "## Team",
        "",
        "| Role | Agent |",
        "| --- | --- |",
        "| Developer | `dev-agent` |",
        "",
        "Use `skills/planning.md` for task breakdown.",
      ].join("\n"),
    );

    // Agent without optional fields
    fs.writeFileSync(
      path.join(agentsDir, "dev.md"),
      [
        "---",
        "name: dev-agent",
        "description: Writes code",
        "model: claude-haiku",
        "tools: Bash",
        "---",
        "",
        "Implements features.",
      ].join("\n"),
    );

    // File without frontmatter — should be synced as spec
    fs.writeFileSync(
      path.join(agentsDir, "notes.md"),
      "# Just a note\n\nNo frontmatter here.",
    );

    // Agent missing name field — should be skipped with a warning
    fs.writeFileSync(
      path.join(agentsDir, "nameless.md"),
      "---\ndescription: No name\nmodel: haiku\ntools: Read\n---\n\nBody.",
    );

    // PROTOCOL.md should be ignored
    fs.writeFileSync(
      path.join(agentsDir, "PROTOCOL.md"),
      "---\nname: protocol\ndescription: x\nmodel: x\ntools: x\n---\n\nProtocol.",
    );

    await syncVault({ agentsDir, vaultDir });

    // Index was created
    expect(fs.existsSync(path.join(vaultDir, "index.md"))).toBe(true);
    const index = fs.readFileSync(path.join(vaultDir, "index.md"), "utf-8");
    expect(index).toContain("[[team-lead]]");
    expect(index).toContain("[[dev-agent]]");

    // team-lead note
    const leadNote = fs.readFileSync(
      path.join(vaultDir, "agents", "team-lead.md"),
      "utf-8",
    );
    expect(leadNote).toContain("name: team-lead");
    expect(leadNote).toContain("[[dev-agent]]");
    expect(leadNote).toContain("`skills/planning.md`");

    // dev-agent note
    const devNote = fs.readFileSync(
      path.join(vaultDir, "agents", "dev-agent.md"),
      "utf-8",
    );
    expect(devNote).toContain("name: dev-agent");
    expect(devNote).toContain("_none_"); // no team members
  });

  it("syncs spec files (no agent frontmatter) to vault", async () => {
    const specsDir = path.join(tmpDir, "specs");
    const vaultDir = path.join(tmpDir, "vault");
    fs.mkdirSync(specsDir, { recursive: true });

    // Spec with frontmatter but no model/tools (not an agent)
    fs.writeFileSync(
      path.join(specsDir, "api-design.md"),
      [
        "---",
        "title: API Design Spec",
        "status: draft",
        "author: team",
        "---",
        "",
        "# API Design",
        "",
        "REST endpoints for the service.",
        "",
        "See also [[auth-spec]] and [[data-model]].",
      ].join("\n"),
    );

    // Spec without any frontmatter
    fs.writeFileSync(
      path.join(specsDir, "architecture-overview.md"),
      [
        "# Architecture Overview",
        "",
        "High-level system architecture.",
        "",
        "Related: [[api-design]]",
      ].join("\n"),
    );

    // Nested spec in subdirectory
    const subDir = path.join(specsDir, "auth");
    fs.mkdirSync(subDir, { recursive: true });
    fs.writeFileSync(
      path.join(subDir, "auth-spec.md"),
      [
        "---",
        "title: Auth Specification",
        "---",
        "",
        "# Authentication",
        "",
        "OAuth 2.0 based authentication.",
      ].join("\n"),
    );

    await syncVault({ agentsDir: specsDir, vaultDir });

    // Index was created with specs section
    const index = fs.readFileSync(path.join(vaultDir, "index.md"), "utf-8");
    expect(index).toContain("## Specs");
    expect(index).toContain("[[API Design Spec]]");
    expect(index).toContain("[[Architecture Overview]]");
    expect(index).toContain("[[Auth Specification]]");

    // Spec notes were created under specs/
    const apiNote = fs.readFileSync(
      path.join(vaultDir, "specs", "api-design.md"),
      "utf-8",
    );
    expect(apiNote).toContain("tags: [spec]");
    expect(apiNote).toContain("[[auth-spec]]");
    expect(apiNote).toContain("[[data-model]]");
    expect(apiNote).toContain("status: draft");

    // No-frontmatter spec derives title from filename
    const archNote = fs.readFileSync(
      path.join(vaultDir, "specs", "architecture-overview.md"),
      "utf-8",
    );
    expect(archNote).toContain("Architecture Overview");
    expect(archNote).toContain("[[api-design]]");

    // Nested spec
    expect(
      fs.existsSync(path.join(vaultDir, "specs", "auth", "auth-spec.md")),
    ).toBe(true);
  });

  it("syncs mixed agents and specs together", async () => {
    const sourceDir = path.join(tmpDir, "source");
    const vaultDir = path.join(tmpDir, "vault");
    fs.mkdirSync(sourceDir, { recursive: true });

    // Agent
    fs.writeFileSync(
      path.join(sourceDir, "lead.md"),
      "---\nname: team-lead\ndescription: Lead\nmodel: opus\ntools: Read, Write\n---\n\nLeads the team.",
    );

    // Spec
    fs.writeFileSync(
      path.join(sourceDir, "spec.md"),
      "---\ntitle: Feature Spec\n---\n\n# Feature\n\nDescription of the feature.",
    );

    await syncVault({ agentsDir: sourceDir, vaultDir });

    const index = fs.readFileSync(path.join(vaultDir, "index.md"), "utf-8");
    expect(index).toContain("## Agents");
    expect(index).toContain("## Specs");
    expect(index).toContain("[[team-lead]]");
    expect(index).toContain("[[Feature Spec]]");

    // Agent goes to agents/
    expect(fs.existsSync(path.join(vaultDir, "agents", "team-lead.md"))).toBe(
      true,
    );

    // Spec goes to specs/
    expect(fs.existsSync(path.join(vaultDir, "specs", "spec.md"))).toBe(true);
  });

  it("handles nested agent subdirectories", async () => {
    const agentsDir = path.join(tmpDir, "agents");
    const subDir = path.join(agentsDir, "sub-team");
    fs.mkdirSync(subDir, { recursive: true });

    fs.writeFileSync(
      path.join(subDir, "worker.md"),
      "---\nname: worker\ndescription: Does work\nmodel: haiku\ntools: Bash\n---\n\nBody.",
    );

    const vaultDir = path.join(tmpDir, "vault");
    await syncVault({ agentsDir, vaultDir });

    // File should end up under agents/sub-team/
    expect(
      fs.existsSync(path.join(vaultDir, "agents", "sub-team", "worker.md")),
    ).toBe(true);
  });

  it("skips skills subdirectory", async () => {
    const agentsDir = path.join(tmpDir, "agents");
    const skillsDir = path.join(agentsDir, "skills");
    fs.mkdirSync(skillsDir, { recursive: true });

    // A valid agent at root level
    fs.writeFileSync(
      path.join(agentsDir, "root-agent.md"),
      "---\nname: root-agent\ndescription: Root\nmodel: haiku\ntools: Read\n---\n\nBody.",
    );

    // An .md inside skills/ — should NOT be picked up
    fs.writeFileSync(
      path.join(skillsDir, "skill.md"),
      "---\nname: skill-file\ndescription: Skill\nmodel: haiku\ntools: Read\n---\n\nSkill body.",
    );

    const vaultDir = path.join(tmpDir, "vault");
    await syncVault({ agentsDir, vaultDir });

    const index = fs.readFileSync(path.join(vaultDir, "index.md"), "utf-8");
    expect(index).toContain("[[root-agent]]");
    expect(index).not.toContain("[[skill-file]]");
  });
});
