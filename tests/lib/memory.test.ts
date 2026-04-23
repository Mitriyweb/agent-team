import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as common from "../../lib/common.ts";
import { archiveOldMemoryTasks, capMemoryForPrompt } from "../../lib/memory.ts";

describe("capMemoryForPrompt", () => {
  it("returns content unchanged when there are no task sections", () => {
    const input = "# Project Memory\n\nSome prose, no tasks.";
    expect(capMemoryForPrompt(input, 5)).toBe(input);
  });

  it("returns content unchanged when task count is within the cap", () => {
    const input = [
      "# Project Memory",
      "",
      "## Task #1: First",
      "- decision",
      "",
      "## Task #2: Second",
      "- decision",
      "",
    ].join("\n");
    expect(capMemoryForPrompt(input, 5)).toBe(input);
  });

  it("keeps header plus last N tasks and adds an archive notice", () => {
    const input = [
      "# Project Memory",
      "Notes.",
      "",
      "## Task #1: a",
      "",
      "## Task #2: b",
      "",
      "## Task #3: c",
      "",
    ].join("\n");
    const out = capMemoryForPrompt(input, 2);
    expect(out).toContain("# Project Memory");
    expect(out).not.toContain("## Task #1:");
    expect(out).toContain("## Task #2:");
    expect(out).toContain("## Task #3:");
    expect(out).toContain("Older task entries archived");
  });
});

describe("archiveOldMemoryTasks", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "agt-mem-archive-")),
    );
    spyOn(common, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("is a no-op when task count is under the threshold", () => {
    const file = path.join(tmpDir, "memory.md");
    const content = "# Project Memory\n\n## Task #1: a\n\n## Task #2: b\n";
    fs.writeFileSync(file, content);
    archiveOldMemoryTasks(file);
    expect(fs.readFileSync(file, "utf-8")).toBe(content);
    expect(fs.existsSync(path.join(tmpDir, "memory.archive.md"))).toBe(false);
  });

  it("moves old tasks to memory.archive.md once threshold is exceeded", () => {
    const file = path.join(tmpDir, "memory.md");
    const tasks: string[] = [];
    for (let i = 1; i <= 120; i++) {
      tasks.push(`## Task #${i}: task ${i}\n- note\n\n`);
    }
    fs.writeFileSync(file, `# Project Memory\n\n${tasks.join("")}`);

    archiveOldMemoryTasks(file);

    const active = fs.readFileSync(file, "utf-8");
    expect(active).toContain("# Project Memory");
    expect(active).toContain("## Task #120:");
    expect(active).not.toContain("## Task #1:");
    expect(active).not.toContain("## Task #50:");

    const archiveFile = path.join(tmpDir, "memory.archive.md");
    expect(fs.existsSync(archiveFile)).toBe(true);
    const archive = fs.readFileSync(archiveFile, "utf-8");
    expect(archive).toContain("## Task #1:");
    expect(archive).toContain("## Task #50:");
    expect(archive).not.toContain("## Task #120:");
  });
});
