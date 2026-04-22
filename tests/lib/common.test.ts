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

const PROJECT_ROOT = import.meta.dir.replace(/\/tests\/lib$/, "");

describe("common.ts", () => {
  let tmpDir: string;
  let origCwd: string;

  beforeEach(() => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "agt-common-test-")),
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

  it("covers log functions", () => {
    spyOn(console, "log").mockImplementation(() => {});
    spyOn(console, "warn").mockImplementation(() => {});
    spyOn(console, "error").mockImplementation(() => {});
    spyOn(process, "exit").mockImplementation((() => {
      throw new Error("EXIT_CALLED");
    }) as () => never);

    common.log("hi");
    common.ok("ok");
    common.warn("warn");
    expect(() => common.err("err")).toThrow("EXIT_CALLED");
    common.printHeader();
  });

  it("covers calculateCost", () => {
    expect(common.calculateCost("sonnet", 1000, 1000)).toBe("0.018000");
    expect(common.calculateCost("opus", 1000, 1000)).toBe("0.090000");
    expect(common.calculateCost("claude-3-5-sonnet", 100, 100)).toBe(
      "0.001800",
    );
    expect(common.calculateCost("unknown", 100, 100)).toBe("0.001800");
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
    spyOn(console, "log").mockImplementation(() => {});
    spyOn(console, "error").mockImplementation(() => {});
    spyOn(process, "exit").mockImplementation((() => {
      throw new Error("EXIT_CALLED");
    }) as () => never);

    // anthropic failure
    process.env.PROVIDER = "anthropic";
    delete process.env.ANTHROPIC_API_KEY;
    expect(() => common.configureProvider()).toThrow("EXIT_CALLED");

    // azure-apim failure
    process.env.PROVIDER = "azure-apim";
    delete process.env.AZURE_APIM_ENDPOINT;
    expect(() => common.configureProvider()).toThrow("EXIT_CALLED");

    // azure-apim-oauth failure
    process.env.PROVIDER = "azure-apim-oauth";
    delete process.env.AZURE_APIM_ENDPOINT;
    expect(() => common.configureProvider()).toThrow("EXIT_CALLED");

    // default failure
    process.env.PROVIDER = "invalid";
    expect(() => common.configureProvider()).toThrow("EXIT_CALLED");

    // Success paths
    process.env.PROVIDER = "oauth";
    process.env.ANTHROPIC_BASE_URL = "http://test";
    common.configureProvider();

    process.env.PROVIDER = "litellm";
    process.env.LITELLM_HOST = "http://lite";
    common.configureProvider();

    process.env = origEnv;
  });

  it("covers notifyReview", () => {
    const originalSpawnSync = Bun.spawnSync;
    // @ts-expect-error: mock spawnSync with minimal shape
    Bun.spawnSync = mock(() => ({ success: false }));

    const originalPlatform = process.platform;

    Object.defineProperty(process, "platform", { value: "linux" });
    common.notifyReview();

    Object.defineProperty(process, "platform", { value: "darwin" });
    common.notifyReview();

    Object.defineProperty(process, "platform", { value: "win32" });
    common.notifyReview();

    Object.defineProperty(process, "platform", { value: originalPlatform });
    Bun.spawnSync = originalSpawnSync;
  });

  describe("expandHome", () => {
    it("expands ~ prefix to the home directory", () => {
      expect(common.expandHome("~/vault")).toBe(
        path.join(os.homedir(), "/vault"),
      );
    });

    it("expands bare ~ to the home directory", () => {
      expect(common.expandHome("~")).toBe(os.homedir());
    });

    it("leaves absolute paths unchanged", () => {
      expect(common.expandHome("/tmp/vault")).toBe("/tmp/vault");
    });

    it("leaves relative paths unchanged", () => {
      expect(common.expandHome("./vault")).toBe("./vault");
    });
  });
});
