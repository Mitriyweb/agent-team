import { describe, it, mock } from "bun:test";
import * as git from "../../lib/git.ts";

describe("git.ts", () => {
  it("covers git functions with success and failure", () => {
    const originalSpawnSync = Bun.spawnSync;
    // @ts-expect-error
    Bun.spawnSync = mock((args) => {
      if (args[1] === "branch") return { stdout: Buffer.from("main\n") };
      if (args[1] === "push") return { exitCode: 1 };
      return { exitCode: 0 };
    });

    git.getCurrentBranch();
    git.createBranch("b");
    git.checkout("b");
    git.commitAndPush("b", "m");
    git.createPR("t", "b");

    // Test throw
    // @ts-expect-error
    Bun.spawnSync = mock(() => {
      throw new Error("git fail");
    });
    git.commitAndPush("b", "m");

    Bun.spawnSync = originalSpawnSync;
  });
});
