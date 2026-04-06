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

describe("common.ts", () => {
  let tmpDir: string;
  let origCwd: string;

  beforeEach(() => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "agt-common-test-")),
    );
    origCwd = process.cwd();
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

  it("covers log functions", () => {
    const logSpy = spyOn(console, "log").mockImplementation(() => {});
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
    const errSpy = spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = spyOn(process, "exit").mockImplementation(
      // biome-ignore lint/suspicious/noExplicitAny: mock implementation
      (() => {}) as any,
    );

    common.log("hi");
    common.ok("ok");
    common.warn("warn");
    try {
      common.err("err");
    } catch (_e) {}
    common.printHeader();

    expect(logSpy).toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    expect(errSpy).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("covers calculateCost", () => {
    expect(common.calculateCost("sonnet", 1000, 1000)).toBe("0.018000");
    expect(common.calculateCost("opus", 1000, 1000)).toBe("0.090000");
    expect(common.calculateCost("claude-3-5-sonnet", 100, 100)).toBe(
      "0.001800",
    );
  });

  it("covers resolveModelAlias", () => {
    expect(common.resolveModelAlias("claude-opus")).toBe("opus");
    expect(common.resolveModelAlias("claude-sonnet")).toBe("sonnet");
    expect(common.resolveModelAlias("claude-haiku")).toBe("haiku");
    expect(common.resolveModelAlias("other")).toBe("other");
  });

  it("covers loadEnv", () => {
    fs.writeFileSync(
      ".env",
      'KEY=VALUE\n# Comment\nQUOTED="val"\nSPACED =  trimmed \nCOMMENTED=val # comment',
    );
    common.loadEnv();
    expect(process.env.KEY).toBe("VALUE");
    expect(process.env.QUOTED).toBe("val");
    expect(process.env.SPACED).toBe("trimmed");
    expect(process.env.COMMENTED).toBe("val");
  });

  it("covers loadConfig and saveConfig", () => {
    const config = common.loadConfig();
    expect(config.planner).toBe("builtin");

    common.saveConfig({ planner: "openspec", team: "test" });
    const config2 = common.loadConfig();
    expect(config2.planner).toBe("openspec");
    expect(config2.team).toBe("test");

    // Corrupt config
    fs.writeFileSync("agent-team.json", "{invalid");
    expect(common.loadConfig().planner).toBe("builtin");
  });

  it("covers configureProvider", () => {
    const origEnv = { ...process.env };
    spyOn(process, "exit").mockImplementation(
      // biome-ignore lint/suspicious/noExplicitAny: mock implementation
      (() => {}) as any,
    );
    spyOn(console, "error").mockImplementation(() => {});

    // oauth
    process.env.PROVIDER = "oauth";
    process.env.ANTHROPIC_BASE_URL = "http://test";
    common.configureProvider();

    delete process.env.ANTHROPIC_BASE_URL;
    common.configureProvider();

    // anthropic
    process.env.PROVIDER = "anthropic";
    process.env.ANTHROPIC_API_KEY = "key";
    common.configureProvider();

    delete process.env.ANTHROPIC_API_KEY;
    common.configureProvider(); // should error

    // azure-apim
    process.env.PROVIDER = "azure-apim";
    process.env.AZURE_APIM_ENDPOINT = "http://azure";
    process.env.AZURE_APIM_KEY = "azure-key";
    common.configureProvider();

    // azure-apim-oauth
    process.env.PROVIDER = "azure-apim-oauth";
    common.configureProvider();

    // litellm
    process.env.PROVIDER = "litellm";
    process.env.LITELLM_HOST = "http://lite";
    common.configureProvider();

    // unknown
    process.env.PROVIDER = "unknown";
    common.configureProvider(); // should error

    process.env = origEnv;
  });

  it("covers notifyReview", () => {
    const originalSpawnSync = Bun.spawnSync;
    // @ts-expect-error
    Bun.spawnSync = mock(() => ({ success: false }));

    // Platform variations
    const originalPlatform = process.platform;

    // Mocking process.platform is tricky, but let's try
    Object.defineProperty(process, "platform", { value: "linux" });
    common.notifyReview();

    Object.defineProperty(process, "platform", { value: "darwin" });
    common.notifyReview();

    Object.defineProperty(process, "platform", { value: "win32" });
    common.notifyReview();

    // Test with existing sound file
    const fakeHome = path.join(tmpDir, "home");
    fs.mkdirSync(fakeHome, { recursive: true });
    process.env.HOME = fakeHome;
    const soundDir = path.join(fakeHome, ".agent-team/assets");
    fs.mkdirSync(soundDir, { recursive: true });
    fs.writeFileSync(path.join(soundDir, "review.m4a"), "fake sound");

    Object.defineProperty(process, "platform", { value: "linux" });
    // @ts-expect-error
    Bun.spawnSync = mock((args) => {
      if (args[0] === "paplay") return { success: true };
      return { success: false };
    });
    common.notifyReview();

    // @ts-expect-error
    Bun.spawnSync = mock((args) => {
      if (args[0] === "aplay") return { success: true };
      return { success: false };
    });
    common.notifyReview();

    Object.defineProperty(process, "platform", { value: "darwin" });
    // @ts-expect-error
    Bun.spawnSync = mock((args) => {
      if (args[0] === "afplay") return { success: true };
      return { success: false };
    });
    common.notifyReview();

    Object.defineProperty(process, "platform", { value: originalPlatform });
    Bun.spawnSync = originalSpawnSync;
  });
});
