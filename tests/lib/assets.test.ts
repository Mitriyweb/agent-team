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
import { extractReviewSound } from "../../lib/assets.ts";

describe("assets.ts", () => {
  let tmpDir: string;
  let origHome: string | undefined;

  beforeEach(() => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "agt-assets-test-")),
    );
    origHome = process.env.HOME;
    process.env.HOME = tmpDir;
    // Also mock os.homedir()
    spyOn(os, "homedir").mockReturnValue(tmpDir);
  });

  afterEach(() => {
    process.env.HOME = origHome;
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_e) {}
    mock.restore();
  });

  it("extracts review sound", () => {
    const destDir = path.join(tmpDir, ".agent-team/assets");
    if (fs.existsSync(destDir))
      fs.rmSync(destDir, { recursive: true, force: true });

    extractReviewSound();
    expect(fs.existsSync(path.join(destDir, "review.m4a"))).toBe(true);

    // Run again to cover "already exists" case
    extractReviewSound();
  });
});
