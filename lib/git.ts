import { BLUE, log, NC, warn } from "./common.ts";

export function getCurrentBranch(): string {
  const { stdout } = Bun.spawnSync(["git", "branch", "--show-current"]);
  return stdout.toString().trim();
}

export function createBranch(branchName: string) {
  log(`Creating branch ${BLUE}${branchName}${NC}...`);
  Bun.spawnSync(["git", "checkout", "-b", branchName]);
}

export function checkout(branchName: string) {
  Bun.spawnSync(["git", "checkout", branchName]);
}

export function commitAndPush(branchName: string, message: string): boolean {
  try {
    Bun.spawnSync(["git", "add", "."]);
    const commit = Bun.spawnSync(["git", "commit", "-m", message]);
    if (commit.exitCode !== 0) {
      log("No changes to commit.");
    }

    log(`Pushing branch ${BLUE}${branchName}${NC}...`);
    const push = Bun.spawnSync(["git", "push", "-u", "origin", branchName]);
    if (push.exitCode !== 0) {
      warn("Failed to push branch (git push failed).");
      return false;
    }
    return true;
  } catch (e) {
    warn(`Git error: ${e}`);
    return false;
  }
}

export function createPR(title: string, body: string): boolean {
  log("Creating Pull Request via gh CLI...");
  const pr = Bun.spawnSync([
    "gh",
    "pr",
    "create",
    "--title",
    title,
    "--body",
    body,
  ]);
  if (pr.exitCode !== 0) {
    warn("Failed to create PR (gh pr create failed).");
    return false;
  }
  return true;
}
