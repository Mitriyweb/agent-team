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
import { importConfig } from "../../lib/import.ts";

describe("import.ts", () => {
  let origCwd: string;

  beforeEach(() => {
    origCwd = process.cwd();
    spyOn(common, "log").mockImplementation(() => {});
    spyOn(common, "ok").mockImplementation(() => {});
    spyOn(common, "warn").mockImplementation(() => {});
    spyOn(common, "err").mockImplementation((m) => {
      throw new Error(String(m));
    });
  });

  afterEach(() => {
    process.chdir(origCwd);
    mock.restore();
  });

  it("imports from various tools", async () => {
    const tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "agt-import-test-")),
    );
    process.chdir(tmpDir);

    try {
      // Windsurf
      const wsDir = ".windsurf";
      fs.mkdirSync(path.join(wsDir, "rules"), { recursive: true });
      fs.writeFileSync(
        path.join(wsDir, "rules", "rule1.md"),
        "---\ntrigger: always_on\ndescription: test\n---\nBody 1",
      );
      fs.writeFileSync(
        path.join(wsDir, "rules", "rule2.md"),
        '---\ntrigger: glob\nglob: "*.ts"\n---\nBody 2',
      );
      fs.writeFileSync(".windsurfrules", "Legacy rules");

      await importConfig(wsDir);
      expect(fs.existsSync(".claude/rules/rule2.md")).toBe(true);
      expect(fs.readFileSync("CLAUDE.md", "utf-8")).toContain("Body 1");
      expect(fs.readFileSync("CLAUDE.md", "utf-8")).toContain("Legacy rules");

      // Cursor
      const cursorDir = ".cursor";
      fs.mkdirSync(path.join(cursorDir, "rules"), { recursive: true });
      fs.writeFileSync(
        path.join(cursorDir, "rules", "crule1.mdc"),
        "---\nalwaysApply: true\n---\nCursor body",
      );
      fs.writeFileSync(".cursorrules", "Cursor legacy");
      await importConfig(cursorDir);
      expect(fs.readFileSync("CLAUDE.md", "utf-8")).toContain("Cursor body");
      expect(fs.readFileSync("CLAUDE.md", "utf-8")).toContain("Cursor legacy");

      // GitHub Copilot
      const githubDir = ".github";
      fs.mkdirSync(path.join(githubDir, "copilot"), { recursive: true });
      fs.writeFileSync(
        path.join(githubDir, "copilot-instructions.md"),
        "Copilot instructions",
      );
      fs.writeFileSync(
        path.join(githubDir, "copilot", "AGENT.md"),
        "Copilot agent",
      );
      await importConfig(githubDir);
      expect(fs.readFileSync("CLAUDE.md", "utf-8")).toContain(
        "Copilot instructions",
      );
      expect(fs.readFileSync("CLAUDE.md", "utf-8")).toContain("Copilot agent");

      // Claude
      const otherProject = "other-project";
      fs.mkdirSync(path.join(otherProject, ".claude", "rules"), {
        recursive: true,
      });
      fs.writeFileSync(path.join(otherProject, "CLAUDE.md"), "Other CLAUDE.md");
      fs.writeFileSync(
        path.join(otherProject, ".claude/rules/other-rule.md"),
        "Other rule body",
      );
      await importConfig(path.join(otherProject, ".claude"));
      expect(fs.readFileSync("CLAUDE.md", "utf-8")).toContain(
        "Other CLAUDE.md",
      );
      expect(fs.readFileSync("CLAUDE.md", "utf-8")).toContain(
        "Other rule body",
      );
    } finally {
      process.chdir(origCwd);
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("handles project root detection", async () => {
    const tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "agt-root-test-")),
    );
    process.chdir(tmpDir);
    try {
      fs.mkdirSync(".windsurf/rules", { recursive: true });
      fs.writeFileSync(".windsurf/rules/r.md", "body");
      await importConfig(".");

      fs.mkdirSync("p2", { recursive: true });
      fs.writeFileSync("p2/.windsurfrules", "legacy");
      await importConfig("p2");

      fs.mkdirSync("p3/.cursor/rules", { recursive: true });
      await importConfig("p3");

      fs.mkdirSync("p4/.github", { recursive: true });
      await importConfig("p4");
    } finally {
      process.chdir(origCwd);
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("handles triggers and frontmatter variations", async () => {
    const tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "agt-fm-test-")),
    );
    process.chdir(tmpDir);
    try {
      const wsDir = ".windsurf";
      fs.mkdirSync(path.join(wsDir, "rules"), { recursive: true });
      fs.writeFileSync(
        path.join(wsDir, "rules", "manual.md"),
        "---\ntrigger: manual\n---\nManual",
      );
      fs.writeFileSync(
        path.join(wsDir, "rules", "model.md"),
        "---\ntrigger: model_decision\n---\nModel",
      );
      fs.writeFileSync(
        path.join(wsDir, "rules", "default.md"),
        "---\ntrigger: unknown\n---\nDefault",
      );

      await importConfig(wsDir);
      expect(fs.existsSync(".claude/rules/manual.md")).toBe(true);

      const wsDir2 = "fm-v/.windsurf";
      fs.mkdirSync(path.join(wsDir2, "rules"), { recursive: true });
      fs.writeFileSync(
        path.join(wsDir2, "rules", "bool.md"),
        '---\ntest: true\nfalse: false\nquoted: "value"\n---\nBody',
      );
      await importConfig("fm-v");

      fs.writeFileSync(path.join(wsDir2, "rules", "nofm.md"), "Just body");
      await importConfig("fm-v");
    } finally {
      process.chdir(origCwd);
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("handles errors and edge cases", async () => {
    const tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "agt-err-test-")),
    );
    process.chdir(tmpDir);
    try {
      // Source not found
      try {
        await importConfig("nonexistent");
      } catch (_e) {}

      // Cannot detect source
      fs.mkdirSync("unknown-tool");
      try {
        await importConfig("unknown-tool");
      } catch (_e) {}
    } finally {
      process.chdir(origCwd);
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
