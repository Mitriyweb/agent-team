import fs from "node:fs";
import { describe, expect, it, vi } from "vitest";
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
    it("loads environment variables from file", () => {
      const envContent = 'TEST_VAR=hello\n# comment\nOTHER_VAR="world"';
      vi.spyOn(fs, "existsSync").mockReturnValue(true);
      vi.spyOn(fs, "readFileSync").mockReturnValue(envContent);

      loadEnv(".env.test");

      expect(process.env.TEST_VAR).toBe("hello");
      expect(process.env.OTHER_VAR).toBe("world");
    });
  });
});
