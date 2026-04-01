import { beforeEach, describe, expect, it, vi } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { createTeam, initProject } from "../../lib/team.ts";

vi.mock("node:fs", () => ({
  default: {
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn(),
    readdirSync: vi.fn(),
    copyFileSync: vi.fn(),
    statSync: vi.fn(),
  },
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(),
  readdirSync: vi.fn(),
  copyFileSync: vi.fn(),
  statSync: vi.fn(),
}));

vi.mock("../../lib/common.ts", () => ({
  log: vi.fn(),
  ok: vi.fn(),
  warn: vi.fn(),
  err: vi.fn(),
  BLUE: "",
  NC: "",
  GREEN: "",
  YELLOW: "",
  RED: "",
  configureProvider: vi.fn(),
  calculateCost: vi.fn(),
}));

vi.mock("node:path", () => ({
  default: {
    join: vi.fn((...args: string[]) => args.join("/")),
  },
  join: vi.fn((...args: string[]) => args.join("/")),
}));

describe("team.ts", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("initProject", () => {
    it("creates necessary directories and copies templates", async () => {
      const mockMkdirSync = vi.spyOn(fs, "mkdirSync");
      const mockWriteFileSync = vi.spyOn(fs, "writeFileSync");
      vi.spyOn(fs, "existsSync").mockReturnValue(false);
      vi.spyOn(fs, "readdirSync").mockReturnValue([]);
      vi.spyOn(fs, "readFileSync").mockReturnValue("");

      // Mock path.join to return predictable strings
      vi.spyOn(path, "join").mockImplementation((...args: string[]) =>
        args.join("/"),
      );

      await initProject({
        teamName: "dev",
        humanReview: true,
        sourceDir: "/src",
      });

      expect(mockMkdirSync).toHaveBeenCalledWith(".agents/workflows", {
        recursive: true,
      });
      expect(mockMkdirSync).toHaveBeenCalledWith("tasks", { recursive: true });
      expect(mockWriteFileSync).toHaveBeenCalled();
    });
  });

  describe("createTeam", () => {
    it("creates a team directory from template", async () => {
      const mockMkdirSync = vi.spyOn(fs, "mkdirSync");
      const mockWriteFileSync = vi.spyOn(fs, "writeFileSync");

      await createTeam({
        name: "test-team",
        description: "Test team",
        roles: "architect,developer",
        humanReview: true,
      });

      expect(mockMkdirSync).toHaveBeenCalledWith("agents/test-team", {
        recursive: true,
      });
      expect(mockWriteFileSync).toHaveBeenCalled();
    });
  });
});
