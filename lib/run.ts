import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import * as p from "@clack/prompts";
import {
  BLUE,
  CYAN,
  calculateCost,
  configureProvider,
  ExternalReviewAgent,
  type ExternalReviewConfig,
  err,
  GREEN,
  loadConfig,
  log,
  NC,
  notifyReview,
  ok,
  RED,
  resolveModelAlias,
  type TelegramConfig,
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
import { tg } from "./notify.ts";
import {
  archiveOpenSpecChange,
  planRoadmap,
  validateOpenSpecChange,
} from "./plan.ts";
import { runAgent } from "./sdk/agent-runner.ts";
import MEMORY_TEMPLATE from "./templates/memory.md" with { type: "text" };
import { TerminalUI } from "./ui.ts";

const LOOP_DIR = ".claude-loop";
const LOG_DIR = `${LOOP_DIR}/logs`;
const REPORTS_DIR = `${LOOP_DIR}/reports`;
const MEMORY_FILE = `${LOOP_DIR}/memory.md`;

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
  model?: string;
  /** Use CLI subprocess instead of Agent SDK (SDK is default) */
  cli?: boolean;
  /** Stop after completing this task id */
  stopAt?: string;
}

const AGENTS_DIR = path.join(".claude", "agents");

/**
 * Find or interactively select an OpenSpec change with tasks.md.
 * If only one change exists, uses it automatically.
 * If multiple, prompts the user to pick one.
 */
async function selectOpenSpecTasks(): Promise<string | undefined> {
  const changesDir = path.join("openspec", "changes");
  if (!fs.existsSync(changesDir)) return undefined;
  const entries = fs.readdirSync(changesDir, { withFileTypes: true });
  const changes = entries
    .filter((e) => e.isDirectory() && e.name !== "archive")
    .map((e) => {
      const dir = path.join(changesDir, e.name);
      const tasksFile = path.join(dir, "tasks.md");
      const hasTasks = fs.existsSync(tasksFile);
      // Count pending/done tasks
      let pending = 0;
      let done = 0;
      if (hasTasks) {
        const content = fs.readFileSync(tasksFile, "utf-8");
        const lines = content.match(/^- \[[ x~!]\] \d+\.\d+/gm) || [];
        for (const l of lines) {
          if (l.includes("[x]")) done++;
          else pending++;
        }
      }
      return { name: e.name, dir, tasks: tasksFile, hasTasks, pending, done };
    })
    .filter((c) => c.hasTasks);

  if (changes.length === 0) return undefined;

  // Always ask which change to execute
  const options = [
    ...changes.map((c) => ({
      value: c.tasks,
      label: c.name,
      hint: `${c.done}/${c.done + c.pending} done`,
    })),
    {
      value: "__new__" as string,
      label: "Create new change",
      hint: "run planner first",
    },
  ];

  const selected = await p.select({
    message: "Select OpenSpec change to execute",
    options,
  });

  if (p.isCancel(selected)) {
    p.cancel("Run cancelled.");
    process.exit(0);
  }

  if (selected === "__new__") {
    // Run planner to create a new change, then find it
    const inputFile = fs.existsSync("ROADMAP.md") ? "ROADMAP.md" : undefined;
    if (inputFile) {
      await planRoadmap(inputFile);
    } else {
      warn("No ROADMAP.md found. Create one or run: agent-team plan");
      return undefined;
    }
    // After planning, find the newly created change
    return selectOpenSpecTasks();
  }

  return selected as string;
}

/**
 * Build context from an OpenSpec change directory (proposal + design)
 * to provide rich specs per task.
 */
function loadOpenSpecContext(tasksFile: string): string {
  const changeDir = path.dirname(tasksFile);
  let ctx = "";
  const proposalFile = path.join(changeDir, "proposal.md");
  if (fs.existsSync(proposalFile)) {
    ctx += `## Proposal\n\n${fs.readFileSync(proposalFile, "utf-8").trim()}\n\n`;
  }
  const designFile = path.join(changeDir, "design.md");
  if (fs.existsSync(designFile)) {
    ctx += `## Design\n\n${fs.readFileSync(designFile, "utf-8").trim()}\n\n`;
  }
  return ctx;
}

function findMdFiles(dir: string): string[] {
  let results: string[] = [];
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) {
      results = results.concat(findMdFiles(full));
    } else if (item.name.endsWith(".md")) {
      results.push(full);
    }
  }
  return results;
}

export class TaskRunner {
  private options: RunOptions;
  private roadmap: string;
  private ui: TerminalUI;
  private currentTaskNum = 0;
  private totalTasks = 0;
  private cumulativeCost = 0;
  private teamLeadModel: string | undefined;
  /** Telegram config loaded from agent-team.json */
  private telegramConfig: TelegramConfig | undefined;
  /** When true, tasks are in OpenSpec native format (- [ ] 1.1 Desc) */
  private openspecMode = false;
  /** Extra context from openspec proposal/design */
  private openspecContext = "";

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

    // Migrate legacy MEMORY.md to .claude-loop/memory.md
    this.migrateMemory();

    this.loadCumulativeCost();
    this.resolveTeamLeadModel();
  }

  private migrateMemory() {
    const legacy = "MEMORY.md";
    if (fs.existsSync(legacy)) {
      const content = fs.readFileSync(legacy, "utf-8").trim();
      if (fs.existsSync(MEMORY_FILE)) {
        // Merge: append legacy content if it has real entries
        if (content && content !== "# Project Memory") {
          const existing = fs.readFileSync(MEMORY_FILE, "utf-8");
          if (!existing.includes(content.replace("# Project Memory\n", ""))) {
            fs.appendFileSync(
              MEMORY_FILE,
              `\n${content.replace("# Project Memory\n", "")}`,
            );
          }
        }
      } else {
        fs.copyFileSync(legacy, MEMORY_FILE);
      }
      fs.unlinkSync(legacy);
      log(`Migrated MEMORY.md → ${MEMORY_FILE}`);
    }
    // Ensure memory file exists with structured template
    if (!fs.existsSync(MEMORY_FILE)) {
      fs.writeFileSync(MEMORY_FILE, MEMORY_TEMPLATE as string);
    }
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

  private resolveTeamLeadModel() {
    if (this.options.model) {
      this.teamLeadModel = resolveModelAlias(this.options.model);
      return;
    }
    // Find team-lead agent in .claude/agents/ and read model from frontmatter
    const files = fs.existsSync(AGENTS_DIR) ? findMdFiles(AGENTS_DIR) : [];
    for (const file of files) {
      const content = fs.readFileSync(file, "utf-8");
      const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
      if (!fmMatch?.[1]) continue;
      const nameMatch = fmMatch[1].match(/^name:\s*(.+)$/m);
      if (!nameMatch?.[1]?.includes("team-lead")) continue;
      const modelMatch = fmMatch[1].match(/^model:\s*(.+)$/m);
      if (modelMatch?.[1]) {
        this.teamLeadModel = resolveModelAlias(modelMatch[1].trim());
        log(
          `Team-lead model: ${GREEN}${this.teamLeadModel}${NC} (from ${path.basename(file)})`,
        );
        return;
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

    if (this.openspecMode) {
      // OpenSpec native format: - [ ] 1.1 Description  or  - [x] 1.1 Description
      for (const line of content.split("\n")) {
        const match = line.match(/^- \[([x !~])\] (\d+\.\d+)\s+(.+)/);
        if (!match) continue;
        const status = match[1];
        if (statusFilter === "." || status === statusFilter) {
          tasks.push(line);
        }
      }
    } else {
      // Legacy plan.md format: code block with id:N
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

    const needle = this.openspecMode
      ? `[${from}] ${taskId} `
      : `[${from}] id:${taskId} `;

    const newLines = lines.map((line) => {
      if (!done && line.includes(needle)) {
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
    if (this.openspecMode) {
      // OpenSpec format: - [ ] 1.1 Description → id = "1.1"
      const match = line.match(/^- \[.\] (\d+\.\d+)/);
      if (match?.[1]) return match[1];
    } else {
      const match = line.match(/id:(\d+)/);
      if (match?.[1]) return match[1];
    }
    return "";
  }

  private getTaskSpec(taskId: string): string {
    if (!fs.existsSync(this.roadmap)) return "";
    const content = fs.readFileSync(this.roadmap, "utf-8");

    if (this.openspecMode) {
      // For openspec, spec = section header + task line + proposal/design context
      const lines = content.split("\n");
      let currentSection = "";
      let taskLine = "";

      for (const line of lines) {
        const sectionMatch = line.match(/^##\s+\d+\.\s+(.+)/);
        if (sectionMatch?.[1]) {
          currentSection = sectionMatch[1].trim();
        }
        if (line.includes(`] ${taskId} `)) {
          taskLine = line.replace(/^- \[.\] \d+\.\d+\s+/, "").trim();
          break;
        }
      }

      let spec = `**Section:** ${currentSection}\n**Task:** ${taskLine}\n\n`;
      if (this.openspecContext) {
        spec += this.openspecContext;
      }
      return spec;
    }

    // Legacy plan.md format
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

  /**
   * Recover stuck [~] tasks from a previous crashed/killed run.
   * Checks logs to determine if a task actually completed or truly stalled.
   */
  private recoverStuckTasks() {
    if (!fs.existsSync(this.roadmap)) return;
    const stuckTasks = this.getRoadmapTasks("~");
    if (stuckTasks.length === 0) return;

    log(
      `Found ${stuckTasks.length} stuck task(s) from previous run — checking...`,
    );

    for (const line of stuckTasks) {
      const tid = this.getTaskId(line);
      const hasLog = this.taskHasLog(tid);
      const hasReport = fs.existsSync(path.join(REPORTS_DIR, `task-${tid}.md`));

      if (hasLog || hasReport) {
        // Evidence of completion found — mark done
        this.markStatus(tid, "~", "x");
        ok(`Task #${tid} — log found, marking completed`);
      } else {
        // No evidence — reset to pending
        this.markStatus(tid, "~", " ");
        warn(`Task #${tid} — no log found, resetting to pending`);
      }
    }
  }

  /** Check if a task has a log file in .claude-loop/logs/ */
  private taskHasLog(taskId: string): boolean {
    if (!fs.existsSync(LOG_DIR)) return false;
    const files = fs.readdirSync(LOG_DIR);
    // Normalize: openspec ids like "1.1" → match "task-1.1-" in filename
    return files.some(
      (f) => f.startsWith(`task-${taskId}-`) && f.endsWith(".log"),
    );
  }

  private pickNextTask(): string | null {
    const pendingTasks = this.getRoadmapTasks(" ");
    if (pendingTasks.length === 0) return null;

    if (this.openspecMode) {
      // OpenSpec: sequential execution, return first pending
      return pendingTasks[0] ?? null;
    }

    // Legacy plan.md: priority + dependency ordering
    const doneTasks = this.getRoadmapTasks("x");
    const failedTasks = this.getRoadmapTasks("!");
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
    if (this.options.cli) log(`Execution mode: ${GREEN}CLI${NC}`);

    // Detect openspec mode (interactive selection if multiple changes)
    const config = loadConfig();
    this.telegramConfig = config.telegram;

    if (config.planner === "openspec" && !this.options.roadmapFile) {
      const openspecTasks = await selectOpenSpecTasks();
      if (openspecTasks) {
        this.roadmap = openspecTasks;
        this.openspecMode = true;
        this.openspecContext = loadOpenSpecContext(openspecTasks);
        const changeName = path.dirname(openspecTasks).split("/").pop();
        log(`OpenSpec change: ${BLUE}${changeName}${NC}`);
      }
    }

    // Recover any stuck [~] tasks from previous crashed runs
    this.recoverStuckTasks();

    let allTasks = this.getRoadmapTasks();

    // Auto-plan if --plan flag set or no structured tasks found
    if (allTasks.length === 0 || this.options.planFirst) {
      if (fs.existsSync("ROADMAP.md")) {
        log("No structured tasks found. Running planner on ROADMAP.md...");
        await planRoadmap("ROADMAP.md");
      }
      // After planning, re-detect openspec
      if (config.planner === "openspec") {
        const openspecTasks = await selectOpenSpecTasks();
        if (openspecTasks) {
          this.roadmap = openspecTasks;
          this.openspecMode = true;
          this.openspecContext = loadOpenSpecContext(openspecTasks);
        }
      } else if (fs.existsSync("tasks/plan.md")) {
        this.roadmap = "tasks/plan.md";
      }
      allTasks = this.getRoadmapTasks();
    }

    this.totalTasks = allTasks.length;

    if (this.totalTasks === 0) {
      ok("Roadmap is empty! Add tasks to start.");
      return;
    }

    // Initialize counter to already-completed tasks so progress resumes correctly
    const doneTasks = this.getRoadmapTasks("x");
    const failedTasks = this.getRoadmapTasks("!");
    this.currentTaskNum = doneTasks.length + failedTasks.length;

    TerminalUI.printDashboard({
      done: doneTasks.length,
      failed: failedTasks.length,
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
      const success = this.options.cli
        ? await this.runTask(next)
        : await this.runTaskSdk(next);

      if (this.options.stopAt && tid === this.options.stopAt) {
        log(`Reached stop-at task ${BLUE}#${tid}${NC} — stopping.`);
        break;
      }

      if (!success && this.options.all !== true) break;
      if (!this.options.all) break;
    }

    this.ui.stopProgressBar();

    // OpenSpec post-run: validate and archive if all tasks are done
    if (this.openspecMode) {
      const changeName = path.dirname(this.roadmap).split("/").pop() || "";
      const pending = this.getRoadmapTasks(" ");
      const failed = this.getRoadmapTasks("!");

      if (pending.length === 0 && failed.length === 0 && changeName) {
        log(`All tasks done — validating change ${BLUE}${changeName}${NC}...`);
        if (validateOpenSpecChange(changeName)) {
          ok("OpenSpec validation passed. Archiving...");
          if (archiveOpenSpecChange(changeName)) {
            ok(
              `Change ${BLUE}${changeName}${NC} archived to openspec/changes/archive/`,
            );
          } else {
            warn(
              "OpenSpec archive failed — archive manually with: openspec archive " +
                changeName,
            );
          }
        } else {
          warn(
            "OpenSpec validation failed — skipping archive. Fix issues and run: openspec archive " +
              changeName,
          );
        }
      }
    }

    log("Loop finished.");
  }

  private getTaskAgents(line: string): string[] {
    const match = line.match(/agents:([\w,-]+)/);
    return match?.[1] ? match[1].split(",") : [];
  }

  private async runTask(taskLine: string): Promise<boolean> {
    const taskId = this.getTaskId(taskLine);
    const agents = this.getTaskAgents(taskLine);
    const desc = taskLine
      .replace(/^- \[.\] id:\d+\s+/, "")
      .replace(/priority:\w+\s+/, "")
      .replace(/type:\w+\s+/, "")
      .replace(/depends:[\d,]+\s+/, "")
      .replace(/agents:[a-z,-]+\s+/, "")
      .trim();

    const agentsLabel = agents.length > 0 ? agents.join(", ") : "team-lead";
    const modelLabel = this.teamLeadModel || "default";

    log(
      `Task ${BLUE}#${taskId}${NC} → ${CYAN}${agentsLabel}${NC} (model: ${GREEN}${modelLabel}${NC}) — ${desc}`,
    );
    tg.started(agentsLabel, `#${taskId} ${desc}`, this.telegramConfig);

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
        const cliArgs = [
          "claude",
          "-p",
          prompt,
          "--max-turns",
          "30",
          "--output-format",
          "json",
          "--allowedTools",
          "Read,Write,Edit,Bash,Glob,Grep,Task,Teammate",
        ];
        if (this.teamLeadModel) {
          cliArgs.push("--model", this.teamLeadModel);
        }
        const proc = Bun.spawn(cliArgs, {
          stderr: "pipe",
        });

        // Tee stderr: show in terminal + collect for logging
        const stderrChunks: string[] = [];
        const stderrReader = proc.stderr
          ? (async () => {
              const reader = proc.stderr?.getReader();
              const decoder = new TextDecoder();
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const text = decoder.decode(value);
                stderrChunks.push(text);
                process.stderr.write(text);
              }
            })()
          : Promise.resolve();

        const [stdoutBuffer] = await Promise.all([
          new Response(proc.stdout).text(),
          stderrReader,
        ]);
        const stderrBuffer = stderrChunks.join("");
        const exitCode = await proc.exited;
        clearInterval(timer);
        this.ui.stopProgressBar();

        // Save task log
        this.saveTaskLog(taskId, exitCode, stdoutBuffer, stderrBuffer);
        this.trackCost(taskId, stdoutBuffer);

        // Extract TASK_STATUS from result (may be in JSON .result or raw stdout)
        const taskStatus = this.extractTaskStatus(stdoutBuffer);

        if (exitCode === 0 && taskStatus === "HUMAN_REVIEW_NEEDED") {
          const approved = await this.promptHumanReview(taskId, desc);
          if (approved) {
            ok(`Task #${taskId} review approved — continuing.`);
            this.markStatus(taskId, "~", "x");
            this.runLibrarian(taskId);
            this.runExternalReview(taskId, desc);
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
          warn(`Task #${taskId} review rejected.`);
          this.markStatus(taskId, "~", "!", "human review rejected");
          if (this.options.branch && originalBranch) checkout(originalBranch);
          return false;
        }

        if (
          exitCode === 0 &&
          (taskStatus === "SUCCESS" || taskStatus === "MISSING")
        ) {
          if (taskStatus === "MISSING") {
            warn(
              `Task #${taskId} — no TASK_STATUS line found, treating exit 0 as success.`,
            );
          }
          ok(`Task #${taskId} completed.`);
          tg.done(
            agentsLabel,
            `#${taskId} ${desc}`,
            undefined,
            this.telegramConfig,
          );
          this.markStatus(taskId, "~", "x");
          this.runLibrarian(taskId);

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

        if (exitCode === 0 && taskStatus.startsWith("FAILED")) {
          warn(`Task #${taskId} agent reported failure: ${taskStatus}`);
        } else {
          warn(
            `Task #${taskId} failed attempt ${attempt} (exit code: ${exitCode}).`,
          );
        }
      } catch (e) {
        clearInterval(timer);
        this.ui.stopProgressBar();
        warn(`Error in task #${taskId}: ${e}`);
      }
      attempt++;
    }

    tg.failed(
      agentsLabel,
      `#${taskId} ${desc}`,
      "max retries exceeded",
      this.telegramConfig,
    );
    this.markStatus(taskId, "~", "!");
    if (this.options.branch && originalBranch) checkout(originalBranch);
    return false;
  }

  /**
   * Run a task via Agent SDK instead of CLI subprocess.
   */
  private async runTaskSdk(taskLine: string): Promise<boolean> {
    const taskId = this.getTaskId(taskLine);
    const agents = this.getTaskAgents(taskLine);
    const desc = taskLine
      .replace(/^- \[.\] id:\d+\s+/, "")
      .replace(/priority:\w+\s+/, "")
      .replace(/type:\w+\s+/, "")
      .replace(/depends:[\d,]+\s+/, "")
      .replace(/agents:[a-z,-]+\s+/, "")
      .trim();

    const agentsLabel = agents.length > 0 ? agents.join(", ") : "team-lead";
    const modelLabel = this.teamLeadModel || "default";

    log(
      `Task ${BLUE}#${taskId}${NC} [SDK] → ${CYAN}${agentsLabel}${NC} (model: ${GREEN}${modelLabel}${NC}) — ${desc}`,
    );
    tg.started(agentsLabel, `#${taskId} ${desc}`, this.telegramConfig);

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
    const team = this.options.team || "software development";

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
        const result = await runAgent({
          team,
          role: agents[0] || "team-lead",
          prompt,
          maxTurns: 30,
          model: this.teamLeadModel,
          allowedTools: [
            "Read",
            "Write",
            "Edit",
            "Bash",
            "Glob",
            "Grep",
            "Agent",
          ],
        });

        clearInterval(timer);
        this.ui.stopProgressBar();

        // Save log
        const ts = new Date().toISOString().replace(/[:.]/g, "-");
        const logFile = path.join(LOG_DIR, `task-${taskId}-${ts}.log`);
        const logContent = [
          `# Task #${taskId} — SDK mode`,
          `# ${new Date().toISOString()}`,
          "",
          "## RESULT",
          result.output,
          "",
          `## TURNS: ${result.turns}`,
          `## COST: $${result.cost?.toFixed(4) ?? "?"}`,
          result.timedOut ? "## TIMED OUT" : "",
        ].join("\n");
        fs.writeFileSync(logFile, logContent);

        // Track cost
        if (result.cost) {
          this.saveCost(taskId, result.cost);
          log(
            `Task cost: ${YELLOW}$${result.cost.toFixed(4)}${NC} (Total: ${YELLOW}$${this.cumulativeCost.toFixed(4)}${NC})`,
          );
        }

        const taskStatus = this.extractTaskStatus(result.output);

        if (taskStatus === "HUMAN_REVIEW_NEEDED") {
          const approved = await this.promptHumanReview(taskId, desc);
          if (approved) {
            ok(`Task #${taskId} review approved — continuing.`);
            this.markStatus(taskId, "~", "x");
            this.runLibrarian(taskId);
            this.runExternalReview(taskId, desc);
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
          warn(`Task #${taskId} review rejected.`);
          this.markStatus(taskId, "~", "!", "human review rejected");
          if (this.options.branch && originalBranch) checkout(originalBranch);
          return false;
        }

        if (
          !result.timedOut &&
          (taskStatus === "SUCCESS" || taskStatus === "MISSING")
        ) {
          if (taskStatus === "MISSING") {
            warn(
              `Task #${taskId} — no TASK_STATUS line found, treating as success.`,
            );
          }
          ok(`Task #${taskId} completed.`);
          tg.done(
            agentsLabel,
            `#${taskId} ${desc}`,
            undefined,
            this.telegramConfig,
          );
          this.markStatus(taskId, "~", "x");
          this.runLibrarian(taskId);

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

        if (taskStatus.startsWith("FAILED")) {
          warn(`Task #${taskId} agent reported failure: ${taskStatus}`);
        } else {
          warn(
            `Task #${taskId} failed attempt ${attempt} (timedOut: ${result.timedOut}).`,
          );
        }
      } catch (e) {
        clearInterval(timer);
        this.ui.stopProgressBar();
        warn(`Error in task #${taskId}: ${e}`);
      }
      attempt++;
    }

    tg.failed(
      agentsLabel,
      `#${taskId} ${desc}`,
      "max retries exceeded",
      this.telegramConfig,
    );
    this.markStatus(taskId, "~", "!");
    if (this.options.branch && originalBranch) checkout(originalBranch);
    return false;
  }

  /**
   * Extract TASK_STATUS from stdout. Checks both raw text and JSON .result field.
   * Returns: "SUCCESS", "HUMAN_REVIEW_NEEDED", "FAILED: <reason>", or "MISSING".
   */
  private extractTaskStatus(stdout: string): string {
    // Search in raw stdout first
    const rawMatch = stdout.match(
      /TASK_STATUS:\s*(SUCCESS|HUMAN_REVIEW_NEEDED|FAILED[^\n]*)/,
    );
    if (rawMatch?.[1]) return rawMatch[1].trim();

    // Search inside JSON .result field
    try {
      const parsed = JSON.parse(stdout);
      const result =
        typeof parsed.result === "string"
          ? parsed.result
          : JSON.stringify(parsed.result || "");
      const jsonMatch = result.match(
        /TASK_STATUS:\s*(SUCCESS|HUMAN_REVIEW_NEEDED|FAILED[^\n]*)/,
      );
      if (jsonMatch?.[1]) return jsonMatch[1].trim();
    } catch {}

    return "MISSING";
  }

  private saveTaskLog(
    taskId: string,
    exitCode: number,
    stdout: string,
    stderr: string,
  ) {
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const logFile = path.join(LOG_DIR, `task-${taskId}-${ts}.log`);
    const header = `# Task #${taskId} — exit code: ${exitCode}\n# ${new Date().toISOString()}\n\n`;
    let body = "";
    if (stderr.trim()) {
      body += `## STDERR\n${stderr}\n\n`;
    }
    try {
      const parsed = JSON.parse(stdout);
      // Session info
      if (parsed.session_id) {
        body += `## SESSION\n${parsed.session_id}\n\n`;
      }
      if (parsed.model) {
        body += `## MODEL\n${parsed.model}\n\n`;
      }
      // Full result — includes reasoning and teammate interactions
      if (parsed.result) {
        body += `## RESULT\n${typeof parsed.result === "string" ? parsed.result : JSON.stringify(parsed.result, null, 2)}\n\n`;
      }
      // Conversation messages — if available, shows full agent interaction
      if (parsed.messages && Array.isArray(parsed.messages)) {
        body += `## CONVERSATION (${parsed.messages.length} messages)\n\n`;
        for (const msg of parsed.messages) {
          const role = msg.role || "unknown";
          const content =
            typeof msg.content === "string"
              ? msg.content
              : JSON.stringify(msg.content, null, 2);
          body += `### [${role}]\n${content}\n\n`;
        }
      }
      // Num turns and stop reason
      if (parsed.num_turns) {
        body += `## TURNS: ${parsed.num_turns}\n`;
      }
      if (parsed.stop_reason) {
        body += `## STOP REASON: ${parsed.stop_reason}\n`;
      }
      // Cost
      if (parsed.usage) {
        body += `\n## USAGE\n${JSON.stringify(parsed.usage, null, 2)}\n`;
      }
      if (parsed.total_cost_usd) {
        body += `\n## COST: $${parsed.total_cost_usd}\n`;
      }
    } catch {
      body += `## STDOUT\n${stdout}\n`;
    }
    fs.writeFileSync(logFile, header + body);
  }

  private trackCost(taskId: string, stdoutBuffer: string) {
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
  }

  private async promptHumanReview(
    taskId: string,
    desc: string,
  ): Promise<boolean> {
    notifyReview();
    tg.review("team-lead", `#${taskId} ${desc}`, this.telegramConfig);

    console.log("");
    console.log(
      `  ${RED}╔══════════════════════════════════════════════════════════════╗${NC}`,
    );
    console.log(
      `  ${RED}║${NC}  ${YELLOW}HUMAN REVIEW NEEDED${NC}                                       ${RED}║${NC}`,
    );
    console.log(
      `  ${RED}║${NC}  Task ${BLUE}#${taskId}${NC}: ${desc.slice(0, 44).padEnd(44)} ${RED}║${NC}`,
    );
    console.log(
      `  ${RED}╚══════════════════════════════════════════════════════════════╝${NC}`,
    );
    console.log(
      `  Check reports in ${BLUE}.claude-loop/reports/task-${taskId}.md${NC}`,
    );
    console.log("");

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    return new Promise((resolve) => {
      rl.question(
        `  ${GREEN}Approve and continue?${NC} (y/n): `,
        (answer: string) => {
          rl.close();
          resolve(answer.trim().toLowerCase() === "y");
        },
      );
    });
  }

  private runLibrarian(taskId: string) {
    const librarianAgent = path.join(AGENTS_DIR, "librarian.md");
    if (!fs.existsSync(librarianAgent)) return;

    // Find report: prefer team-lead's report, fall back to runner's log
    const reportFile = path.join(REPORTS_DIR, `task-${taskId}.md`);
    let reportSource = "";
    if (fs.existsSync(reportFile)) {
      reportSource = reportFile;
    } else {
      // Find latest log for this task
      const logFiles = fs.existsSync(LOG_DIR)
        ? fs
            .readdirSync(LOG_DIR)
            .filter(
              (f) => f.startsWith(`task-${taskId}-`) && f.endsWith(".log"),
            )
            .sort()
            .reverse()
        : [];
      if (logFiles.length > 0)
        reportSource = path.join(LOG_DIR, logFiles[0] as string);
    }
    if (!reportSource) return;

    try {
      log(`Running librarian on task #${taskId} report...`);
      const instructions = fs.readFileSync(librarianAgent, "utf-8");
      const report = fs.readFileSync(reportSource, "utf-8");
      const prompt = `${instructions}\n\n---\n\n## Task Report\n\n${report}`;
      const proc = Bun.spawnSync(
        [
          "claude",
          "-p",
          prompt,
          "--model",
          "sonnet",
          "--max-turns",
          "10",
          "--allowedTools",
          "Read,Write,Edit,Glob,Grep",
        ],
        { stderr: "pipe" },
      );
      if (proc.exitCode === 0) {
        let output = "";
        try {
          const parsed = JSON.parse(new TextDecoder().decode(proc.stdout));
          output =
            typeof parsed.result === "string"
              ? parsed.result
              : new TextDecoder().decode(proc.stdout);
        } catch {
          output = new TextDecoder().decode(proc.stdout);
        }
        const summary = output.trim().split("\n").slice(-3).join("\n");
        if (summary) log(`Librarian: ${summary}`);
      } else {
        warn(`Librarian failed (exit ${proc.exitCode})`);
      }
    } catch (e) {
      warn(`Librarian error: ${e}`);
    }
  }

  /**
   * Run external CLI agent for review (codex, devin, aider, claude).
   * Invoked after task completion when externalReview is configured.
   */
  private runExternalReview(taskId: string, desc: string) {
    const config = loadConfig();
    const reviewConfig = config.externalReview;
    if (!reviewConfig) return;

    const cmd = this.resolveExternalCommand(reviewConfig);
    if (!cmd) {
      warn(`External review agent "${reviewConfig.agent}" not found in PATH.`);
      return;
    }

    log(
      `Running external review via ${CYAN}${reviewConfig.agent}${NC} for task #${taskId}...`,
    );

    // Build review prompt
    const reportFile = path.join(REPORTS_DIR, `task-${taskId}.md`);
    const reportExists = fs.existsSync(reportFile);
    const reviewPrompt = [
      `Review the changes for task #${taskId}: ${desc}.`,
      "Focus on: correctness, security, edge cases, and code quality.",
      reportExists ? `Task report: ${reportFile}` : "",
      "Output a concise review with findings.",
    ]
      .filter(Boolean)
      .join("\n");

    try {
      const args = this.buildExternalArgs(reviewConfig, reviewPrompt);
      const proc = Bun.spawnSync(args, {
        stdio: ["inherit", "pipe", "pipe"],
        timeout: 300_000, // 5 min
      });

      const stdout = new TextDecoder().decode(proc.stdout).trim();
      const stderr = new TextDecoder().decode(proc.stderr).trim();

      // Save review output
      const reviewFile = path.join(
        REPORTS_DIR,
        `task-${taskId}-external-review.md`,
      );
      const content = [
        `# External Review — Task #${taskId}`,
        `**Agent:** ${reviewConfig.agent}`,
        `**Date:** ${new Date().toISOString()}`,
        "",
        stdout || "(no output)",
        stderr ? `\n## Stderr\n${stderr}` : "",
      ].join("\n");
      fs.writeFileSync(reviewFile, content);

      if (proc.success) {
        ok(`External review saved: ${BLUE}${reviewFile}${NC}`);
      } else {
        warn(
          `External review exited with code ${proc.exitCode} — output saved to ${reviewFile}`,
        );
      }
    } catch (e) {
      warn(`External review error: ${e}`);
    }
  }

  private resolveExternalCommand(config: ExternalReviewConfig): string | null {
    if (config.command) return config.command;
    // Enum values are the CLI command names
    const cmd = config.agent as string;
    if (!cmd) return null;
    const which = Bun.spawnSync(["which", cmd], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    return which.success ? cmd : null;
  }

  private buildExternalArgs(
    config: ExternalReviewConfig,
    prompt: string,
  ): string[] {
    const cmd = config.command || config.agent;
    switch (config.agent) {
      case ExternalReviewAgent.Codex:
        return [cmd, "-q", prompt];
      case ExternalReviewAgent.Claude:
        return [
          cmd,
          "-p",
          prompt,
          "--max-turns",
          "10",
          "--output-format",
          "text",
        ];
      case ExternalReviewAgent.Devin:
        return [cmd, "run", prompt];
      case ExternalReviewAgent.Aider:
        return [cmd, "--message", prompt, "--yes"];
      case ExternalReviewAgent.Gemini:
        return [cmd, "-p", prompt];
      default:
        return [cmd, prompt];
    }
  }

  private buildPrompt(taskId: string, desc: string, spec: string): string {
    const team = this.options.team || "software development";
    const REPORTS_DIR_VAL = REPORTS_DIR;

    // Inject shared memory so each task sees what previous tasks learned
    let memorySection = "";
    if (fs.existsSync(MEMORY_FILE)) {
      const memory = fs.readFileSync(MEMORY_FILE, "utf-8").trim();
      if (memory && memory !== "# Project Memory") {
        memorySection = `\n## Shared memory (from previous tasks)\n\n${memory}\n`;
      }
    }

    // Inject Obsidian vault context if configured
    let vaultSection = "";
    const vaultLink = ".claude/vault";
    if (fs.existsSync(vaultLink)) {
      let vaultTarget = vaultLink;
      try {
        const resolved = fs.realpathSync(vaultLink);
        if (resolved && resolved !== path.resolve(vaultLink)) {
          vaultTarget = `${vaultLink} -> ${resolved}`;
        }
      } catch {
        // Fall back to the link path if realpath fails
      }
      vaultSection = `
## Knowledge Base (Obsidian Vault)

An Obsidian vault is connected at \`${vaultTarget}\` as an optional RAG source.
Consult it ONLY when the task requires domain/business context that is clearly
missing from the repository. Use Grep to locate relevant files by keyword first,
then Read only the specific file(s) you need. Do not scan or pre-load the vault.
`;
    }

    return `
You are the ${team} team-lead orchestrating an autonomous agent team.
You NEVER write code, tests, or content yourself — you delegate to teammates via the Teammate tool.

TASK #${taskId}: ${desc}

## Detailed specification
${spec}
${memorySection}${vaultSection}
## Instructions

1. Read the specification and PROTOCOL.md to understand the workflow and available teammates.
2. Explore the codebase to understand the current state.
3. Delegate work to teammates following the communication graph in PROTOCOL.md.
4. After the task, append findings to \`.claude-loop/memory.md\`:
   \`\`\`
   ## Task #${taskId}: ${desc}
   - [key decisions]
   - [files changed and why]
   - [gotchas discovered]
   \`\`\`
5. Write a report to ${REPORTS_DIR_VAL}/task-${taskId}.md (what was done, who did what, results).
6. On your VERY LAST LINE, output exactly one of:
   - TASK_STATUS: SUCCESS
   - TASK_STATUS: HUMAN_REVIEW_NEEDED
   - TASK_STATUS: FAILED: <reason>
   This line is MANDATORY — the runner uses it to determine task outcome.
    `.trim();
  }
}
