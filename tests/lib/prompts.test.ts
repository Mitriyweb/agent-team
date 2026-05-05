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
import { ExternalReviewAgent, Planner } from "../../lib/common.ts";
import * as prompts from "../../lib/prompts.ts";

const PROJECT_ROOT = import.meta.dir.replace(/\/tests\/lib$/, "");

describe("prompts.ts", () => {
  let tmpDir: string;
  let origCwd: string;

  beforeEach(() => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "agt-prompts-test-")),
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
    mock.restore();
  });

  it("covers promptVault", async () => {
    // Skip
    spyOn(p, "confirm").mockResolvedValue(false);
    expect(await prompts.promptVault("msg")).toBeUndefined();

    // Enter path
    spyOn(p, "confirm").mockResolvedValue(true);
    let validateFn: ((v: string) => string | undefined) | undefined;
    // biome-ignore lint/suspicious/noExplicitAny: mock
    spyOn(p, "text").mockImplementation(((options: any) => {
      validateFn = options.validate;
      return Promise.resolve(tmpDir);
      // biome-ignore lint/suspicious/noExplicitAny: mock
    }) as any);

    expect(await prompts.promptVault("msg")).toBe(tmpDir);
    if (validateFn) {
      expect(validateFn("  ")).toBe("Path is required");
      expect(validateFn("/nonexistent")).toBe("Path does not exist");
      expect(validateFn(tmpDir)).toBeUndefined();
    }

    // Cancel confirm
    const cancel = Symbol("cancel");
    spyOn(p, "confirm").mockResolvedValue(cancel);
    spyOn(p, "isCancel").mockImplementation((v) => v === cancel);
    expect(p.isCancel(await prompts.promptVault("msg"))).toBe(true);
  });

  it("covers promptExternalReview", async () => {
    spyOn(p, "select").mockResolvedValue(ExternalReviewAgent.Codex);
    expect(await prompts.promptExternalReview()).toBe(
      ExternalReviewAgent.Codex,
    );

    spyOn(p, "select").mockResolvedValue("__none__");
    expect(await prompts.promptExternalReview()).toBeUndefined();
  });

  it("covers promptTelegram", async () => {
    spyOn(p, "confirm").mockResolvedValue(false);
    expect(await prompts.promptTelegram()).toBeUndefined();

    spyOn(p, "confirm").mockResolvedValue(true);
    spyOn(p, "group").mockResolvedValue({
      botToken: "123:abc",
      chatId: "456",
    });
    expect(await prompts.promptTelegram()).toEqual({
      botToken: "123:abc",
      chatId: "456",
    });
  });

  it("covers promptInit", async () => {
    fs.mkdirSync("agents", { recursive: true });
    spyOn(p, "group").mockResolvedValue({
      teamName: "frontend",
      planner: Planner.Builtin,
      humanReview: true,
      vaultPath: undefined,
      externalReview: undefined,
      setupCommands: "npm install",
      sound: true,
    });
    spyOn(p, "confirm").mockResolvedValue(false); // Telegram disable

    const result = await prompts.promptInit(".", {});
    expect(result?.teamName).toBe("frontend");
    expect(result?.setupCommands).toEqual(["npm install"]);
  });

  it("covers promptNewTeam", async () => {
    spyOn(p, "group").mockResolvedValue({
      name: "new-team",
      description: "desc",
      roles: "role1,role2",
      humanReview: true,
    });
    const result = await prompts.promptNewTeam({});
    expect(result?.name).toBe("new-team");
  });

  it("covers promptSyncVault", async () => {
    fs.mkdirSync("agents", { recursive: true });
    spyOn(p, "group").mockResolvedValue({
      agentsDir: "agents",
      vaultDir: "vault",
    });
    const result = await prompts.promptSyncVault({});
    expect(result?.vaultDir).toBe("vault");
  });

  it("covers promptImport", async () => {
    spyOn(p, "group").mockResolvedValue({
      source: ".cursor",
    });
    const result = await prompts.promptImport();
    expect(result?.source).toBe(".cursor");

    // Custom path
    spyOn(p, "group").mockResolvedValue({
      source: "__custom__",
      customPath: "/path",
    });
    const result2 = await prompts.promptImport();
    expect(result2?.source).toBe("/path");
  });
});
