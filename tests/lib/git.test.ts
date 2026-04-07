import { afterEach, describe, expect, it, mock } from "bun:test";
import * as git from "../../lib/git.ts";

describe("git.ts", () => {
  const originalSpawnSync = Bun.spawnSync;

  afterEach(() => {
    Bun.spawnSync = originalSpawnSync;
    mock.restore();
  });

  it("covers git functions with success and failure", () => {
    // 1. getCurrentBranch
    // @ts-expect-error
    Bun.spawnSync = mock((args) => {
      if (args[0] === "git" && args[1] === "branch") {
        return { stdout: Buffer.from("main\n"), success: true };
      }
      return { stdout: Buffer.from(""), success: true };
    });
    expect(git.getCurrentBranch()).toBe("main");

    // 2. createBranch and checkout
    // @ts-expect-error
    Bun.spawnSync = mock(() => ({ success: true, exitCode: 0 }));
    git.createBranch("test");
    git.checkout("main");

    // 3. commitAndPush success
    // @ts-expect-error
    Bun.spawnSync = mock(() => ({ success: true, exitCode: 0 }));
    expect(git.commitAndPush("test", "msg")).toBe(true);

    // 4. commitAndPush partial failure (no changes)
    // @ts-expect-error
    Bun.spawnSync = mock((args) => {
      if (args[1] === "commit") return { success: false, exitCode: 1 };
      return { success: true, exitCode: 0 };
    });
    expect(git.commitAndPush("test", "msg")).toBe(true);

    // 5. commitAndPush full failure (push fails)
    // @ts-expect-error
    Bun.spawnSync = mock((args) => {
      if (args[1] === "push") return { success: false, exitCode: 1 };
      return { success: true, exitCode: 0 };
    });
    expect(git.commitAndPush("test", "msg")).toBe(false);

    // 6. PR creation success
    // @ts-expect-error
    Bun.spawnSync = mock(() => ({ success: true, exitCode: 0 }));
    expect(git.createPR("t", "b")).toBe(true);

    // 7. PR creation failure
    // @ts-expect-error
    Bun.spawnSync = mock(() => ({ success: false, exitCode: 1 }));
    expect(git.createPR("t", "b")).toBe(false);

    // 8. commitAndPush exception
    Bun.spawnSync = mock(() => {
      throw new Error("git fail");
    });
    expect(git.commitAndPush("test", "msg")).toBe(false);
  });
});
