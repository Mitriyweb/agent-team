import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { calculateCost, loadEnv } from "../../lib/common.ts";

describe("common.ts", () => {
  describe("calculateCost", () => {
    it("calculates cost for sonnet", () => {
      const cost = calculateCost("claude-3-5-sonnet-20241022", 1000, 1000);
      expect(parseFloat(cost)).toBeCloseTo(0.018);
    });

    it("calculates cost for opus", () => {
      const cost = calculateCost("claude-3-opus-20240229", 1000, 1000);
      expect(parseFloat(cost)).toBeCloseTo(0.09);
    });
  });

  describe("loadEnv", () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "common-test-"));
    });

    afterEach(() => {
      delete process.env.TEST_VAR;
      delete process.env.OTHER_VAR;
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("loads environment variables from file", () => {
      const envFile = path.join(tmpDir, ".env.test");
      fs.writeFileSync(envFile, 'TEST_VAR=hello\n# comment\nOTHER_VAR="world"');

      loadEnv(envFile);

      expect(process.env.TEST_VAR).toBe("hello");
      expect(process.env.OTHER_VAR).toBe("world");
    });
  });
});
