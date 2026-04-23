import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as common from "../../lib/common.ts";
import { runExternalReview } from "../../lib/external-review.ts";

describe("runExternalReview", () => {
  let tmpDir: string;
  let origCwd: string;

  beforeEach(() => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "agt-ext-review-")),
    );
    origCwd = process.cwd();
    process.chdir(tmpDir);

    spyOn(common, "log").mockImplementation(() => {});
    spyOn(common, "ok").mockImplementation(() => {});
    spyOn(common, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    process.chdir(origCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns null when no externalReview in config", () => {
    fs.writeFileSync(
      "agent-team.json",
      JSON.stringify({ planner: common.Planner.Builtin }),
    );
    const result = runExternalReview({
      subject: "task #1",
      prompt: "review this",
      outputFile: path.join(tmpDir, "out.md"),
    });
    expect(result).toBeNull();
  });

  it("returns null when agent binary not on PATH", () => {
    fs.writeFileSync(
      "agent-team.json",
      JSON.stringify({
        planner: common.Planner.Builtin,
        externalReview: { agent: "nonexistent-cli-binary-12345" },
      }),
    );
    const result = runExternalReview({
      subject: "task #1",
      prompt: "review this",
      outputFile: path.join(tmpDir, "out.md"),
    });
    expect(result).toBeNull();
  });

  it("writes the review output file when the agent succeeds", () => {
    fs.writeFileSync(
      "agent-team.json",
      JSON.stringify({
        planner: common.Planner.Builtin,
        externalReview: {
          agent: common.ExternalReviewAgent.Codex,
          command: "/bin/echo",
        },
      }),
    );

    const outputFile = path.join(tmpDir, "nested", "out.md");
    const result = runExternalReview({
      subject: "task #1",
      prompt: "review this",
      outputFile,
    });

    expect(result).not.toBeNull();
    expect(result?.ok).toBe(true);
    expect(fs.existsSync(outputFile)).toBe(true);

    const content = fs.readFileSync(outputFile, "utf-8");
    expect(content).toContain("# External Review — task #1");
    expect(content).toContain("**Agent:** codex");
  });
});
