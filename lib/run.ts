import fs from "node:fs";
import path from "node:path";
import {
  BLUE,
  calculateCost,
  configureProvider,
  err,
  log,
  NC,
  ok,
  warn,
  YELLOW,
} from "./common.ts";
import {
  checkout,
  commitAndPush,
  createBranch,
  createPR,
  getCurrentBranch,
} from "./git.ts";
import { TerminalUI } from "./ui.ts";

const LOG_DIR = ".claude-loop/logs";
const REPORTS_DIR = ".claude-loop/reports";
const SESSIONS_DIR = ".claude-loop/sessions";

export interface RunOptions {
  roadmapFile?: string;
  all?: boolean;
  dryRun?: boolean;
  resumeId?: string;
  budget?: number;
  retryLimit?: number;
  approvePlan?: boolean;
  team?: string;
  branch?: boolean;
  planFirst?: boolean;
}

export class TaskRunner {
  private options: RunOptions;
  private roadmap: string;
  private ui: TerminalUI;
  private currentTaskNum = 0;
  private totalTasks = 0;
  private cumulativeCost = 0;

  constructor(options: RunOptions) {
    this.options = options;
    this.ui = new TerminalUI();

    if (options.roadmapFile) {
      this.roadmap = options.roadmapFile;
    } else if (fs.existsSync("tasks/plan.md")) {
      this.roadmap = "tasks/plan.md";
    } else {
      this.roadmap = "ROADMAP.md";
    }

    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
    if (!fs.existsSync(REPORTS_DIR))
      fs.mkdirSync(REPORTS_DIR, { recursive: true });
    if (!fs.existsSync(SESSIONS_DIR))
      fs.mkdirSync(SESSIONS_DIR, { recursive: true });

    this.loadCumulativeCost();
  }

  private loadCumulativeCost() {
    const costFile = path.join(REPORTS_DIR, "cost-summary.json");
    if (fs.existsSync(costFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(costFile, "utf-8"));
        this.cumulativeCost = data.total_cost || 0;
      } catch (_e) {
        this.cumulativeCost = 0;
      }
    }
  }

  private saveCost(taskId: string, cost: number) {
    this.cumulativeCost += cost;
    const costFile = path.join(REPORTS_DIR, "cost-summary.json");
    let data: { total_cost: number; tasks: Record<string, number> } = {
      total_cost: this.cumulativeCost,
      tasks: {},
    };
    if (fs.existsSync(costFile)) {
      try {
        data = JSON.parse(fs.readFileSync(costFile, "utf-8"));
        data.total_cost = this.cumulativeCost;
      } catch (_e) {}
    }
    data.tasks[taskId] = cost;
    fs.writeFileSync(costFile, JSON.stringify(data, null, 2));
  }

  private getRoadmapTasks(statusFilter = "."): string[] {
    if (!fs.existsSync(this.roadmap)) return [];
    const content = fs.readFileSync(this.roadmap, "utf-8");
    const tasks: string[] = [];
    let inBlock = false;

    for (const line of content.split("\n")) {
      if (line.trim().startsWith("```")) {
        inBlock = !inBlock;
        continue;
      }
      if (inBlock) {
        const regex = new RegExp(`^- \\[${statusFilter}\\] id:(\\d+)`);
        if (regex.test(line)) {
          tasks.push(line);
        }
      }
    }
    return tasks;
  }

  private markStatus(
    taskId: string,
    from: string,
    to: string,
    failureReason?: string,
  ) {
    const content = fs.readFileSync(this.roadmap, "utf-8");
    const lines = content.split("\n");
    let done = false;

    const newLines = lines.map((line) => {
      if (!done && line.includes(`[${from}] id:${taskId} `)) {
        done = true;
        let newLine = line.replace(`[${from}]`, `[${to}]`);
        if (to === "!" && failureReason) {
          newLine += ` [FAILED: ${failureReason}]`;
        }
        return newLine;
      }
      return line;
    });

    fs.writeFileSync(this.roadmap, newLines.join("\n"));
  }

  private getTaskId(line: string): string {
    const match = line.match(/id:(\d+)/);
    if (match?.[1]) return match[1];
    return "";
  }

  private getTaskSpec(taskId: string): string {
    if (!fs.existsSync(this.roadmap)) return "";
    const content = fs.readFileSync(this.roadmap, "utf-8");
    const lines = content.split("\n");
    let inBlock = false;
    let spec = "";

    for (const line of lines) {
      if (line.startsWith(`### Task #${taskId} `)) {
        inBlock = true;
        spec = line;
        continue;
      }
      if (inBlock) {
        if (line.startsWith("### Task #")) break;
        spec += `\n${line}`;
      }
    }
    return spec;
  }

  private pickNextTask(): string | null {
    const doneTasks = this.getRoadmapTasks("x");
    const failedTasks = this.getRoadmapTasks("!");
    const pendingTasks = this.getRoadmapTasks(" ");

    if (pendingTasks.length === 0) return null;

    const doneIds = doneTasks.map((t) => this.getTaskId(t));
    const failedIds = failedTasks.map((t) => this.getTaskId(t));

    for (const priority of ["high", "medium", "low"]) {
      for (const line of pendingTasks) {
        if (!line.includes(`priority:${priority}`)) continue;

        const depsMatch = line.match(/depends:([\d,]+)/);
        if (depsMatch?.[1]) {
          const deps = depsMatch[1].split(",");
          const allMet = deps.every((d: string) => doneIds.includes(d));
          const anyFailed = deps.some((d: string) => failedIds.includes(d));

          if (anyFailed) continue;
          if (allMet) return line;
        } else {
          return line;
        }
      }
    }
    return null;
  }

  async run() {
    configureProvider();

    if (this.options.dryRun) warn(`${YELLOW}[DRY RUN MODE]${NC}`);

    const allTasks = this.getRoadmapTasks();
    this.totalTasks = allTasks.length;

    if (this.totalTasks === 0) {
      ok("Roadmap is empty! Add tasks to start.");
      return;
    }

    TerminalUI.printDashboard({
      done: this.getRoadmapTasks("x").length,
      failed: this.getRoadmapTasks("!").length,
      pending: this.getRoadmapTasks(" ").length,
      running: this.getRoadmapTasks("~").length,
      total: this.totalTasks,
    });

    let foundResume = !this.options.resumeId;

    while (true) {
      const next = this.pickNextTask();
      if (!next) break;

      const tid = this.getTaskId(next);

      if (!foundResume) {
        if (tid === this.options.resumeId) {
          foundResume = true;
          log(`Resuming from task ${BLUE}#${tid}${NC}`);
        } else {
          log(
            `Skipping task ${BLUE}#${tid}${NC} (resume target is #${this.options.resumeId})`,
          );
          this.markStatus(tid, " ", "x");
          continue;
        }
      }

      this.currentTaskNum++;
      const success = await this.runTask(next);

      if (!success && this.options.all !== true) break;
      if (!this.options.all) break;
    }

    this.ui.stopProgressBar();
    log("Loop finished.");
  }

  private async runTask(taskLine: string): Promise<boolean> {
    const taskId = this.getTaskId(taskLine);
    const desc = taskLine
      .replace(/^- \[.\] id:\d+\s+/, "")
      .replace(/priority:\w+\s+/, "")
      .replace(/type:\w+\s+/, "")
      .replace(/depends:[\d,]+\s+/, "")
      .replace(/agents:[a-z,-]+\s+/, "")
      .trim();

    if (this.options.budget && this.cumulativeCost >= this.options.budget) {
      err(
        `Budget exceeded: $${this.cumulativeCost.toFixed(4)} >= $${this.options.budget}`,
      );
    }

    if (this.options.dryRun) {
      warn(`[DRY RUN] Task #${taskId}: ${desc}`);
      this.markStatus(taskId, " ", "x");
      return true;
    }

    let originalBranch = "";
    const branchName = `task/${taskId}`;
    if (this.options.branch) {
      originalBranch = getCurrentBranch();
      createBranch(branchName);
    }

    this.markStatus(taskId, " ", "~");
    const spec = this.getTaskSpec(taskId);
    const prompt = this.buildPrompt(taskId, desc, spec);

    let attempt = 0;
    const retryLimit = this.options.retryLimit || 0;

    while (attempt <= retryLimit) {
      if (attempt > 0) {
        const backoff = 10 * 2 ** (attempt - 1);
        warn(
          `Retrying task #${taskId} in ${backoff}s (attempt ${attempt}/${retryLimit})...`,
        );
        await new Promise((r) => setTimeout(r, backoff * 1000));
      }

      const timer = setInterval(() => {
        const counts = {
          done: this.getRoadmapTasks("x").length,
          failed: this.getRoadmapTasks("!").length,
        };
        this.ui.showProgressBar(
          taskId,
          desc,
          this.currentTaskNum,
          this.totalTasks,
          counts,
        );
      }, 1000);

      try {
        const proc = Bun.spawn([
          "claude",
          "-p",
          prompt,
          "--max-turns",
          "30",
          "--output-format",
          "json",
          "--allowedTools",
          "Read,Write,Edit,Bash,Glob,Grep,Task,Teammate",
        ]);

        const stdoutBuffer = await new Response(proc.stdout).text();
        const exitCode = await proc.exited;
        clearInterval(timer);
        this.ui.stopProgressBar();

        if (exitCode === 0 && stdoutBuffer.includes("TASK_STATUS: SUCCESS")) {
          // Track cost
          try {
            const resp = JSON.parse(stdoutBuffer);
            if (resp.usage) {
              const cost = parseFloat(
                calculateCost(
                  resp.model || "",
                  resp.usage.input_tokens,
                  resp.usage.output_tokens,
                ),
              );
              this.saveCost(taskId, cost);
              log(
                `Task cost: ${YELLOW}$${cost.toFixed(4)}${NC} (Total: ${YELLOW}$${this.cumulativeCost.toFixed(4)}${NC})`,
              );
            }
          } catch (_e: unknown) {}

          ok(`Task #${taskId} completed.`);
          this.markStatus(taskId, "~", "x");

          if (this.options.branch) {
            commitAndPush(branchName, `feat: #${taskId} - ${desc}`);
            createPR(
              `feat: #${taskId} - ${desc}`,
              `Automated PR for task #${taskId}`,
            );
            checkout(originalBranch);
          }
          return true;
        }
        warn(`Task #${taskId} failed attempt ${attempt}.`);
      } catch (e) {
        clearInterval(timer);
        this.ui.stopProgressBar();
        warn(`Error in task #${taskId}: ${e}`);
      }
      attempt++;
    }

    this.markStatus(taskId, "~", "!");
    if (this.options.branch && originalBranch) checkout(originalBranch);
    return false;
  }

  private buildPrompt(taskId: string, desc: string, spec: string): string {
    const team = this.options.team || "software development";
    const REPORTS_DIR_VAL = REPORTS_DIR;
    return `
You are the ${team}-lead autonomous agent lead executing a task from the project roadmap.

TASK #${taskId}: ${desc}

## Detailed specification
${spec}

Instructions:
1. Read the specification carefully.
2. Explore the codebase to understand the state.
3. Coordinate as necessary per PROTOCOL.md.
4. Update MEMORY.md with important shared knowledge.
5. Produce the EXACT deliverables.
6. Write a report to ${REPORTS_DIR_VAL}/task-${taskId}.md.

On your VERY LAST LINE of output, write:
TASK_STATUS: SUCCESS
    `.trim();
  }
}
