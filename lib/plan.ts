import fs from "node:fs";
import path from "node:path";
import {
  BLUE,
  CYAN,
  err,
  GREEN,
  loadConfig,
  log,
  NC,
  ok,
  RED,
  resolveModelAlias,
  warn,
  YELLOW,
} from "./common.ts";

const AGENTS_DIR = path.join(".claude", "agents");

function findTeamLeadModel(): string | undefined {
  if (!fs.existsSync(AGENTS_DIR)) return undefined;
  const files = findMdFiles(AGENTS_DIR);
  for (const file of files) {
    const content = fs.readFileSync(file, "utf-8");
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!fmMatch?.[1]) continue;
    const nameMatch = fmMatch[1].match(/^name:\s*(.+)$/m);
    if (!nameMatch?.[1]?.includes("team-lead")) continue;
    const modelMatch = fmMatch[1].match(/^model:\s*(.+)$/m);
    if (modelMatch?.[1]) return modelMatch[1].trim();
  }
  return undefined;
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

const PROMPT_DECOMPOSITION = `
You are the team-lead of an autonomous development team.
Read the task description below and create a structured execution plan.

## Instructions
1. Read the task description VERY carefully — understand the EXACT deliverables requested.
2. Identify the FINAL deliverables — files, folders, artifacts the user expects at the end.
3. Work BACKWARDS from deliverables to determine what tasks are needed.
4. Minimize intermediate artifacts — every task should directly contribute to a final deliverable.
5. Assign agents to each task: architect, developer, reviewer, qa.
6. Define dependencies between tasks.
7. Write the plan to the file specified below.

## Critical planning rules
- The plan MUST produce EXACTLY the deliverables described in the task.
- Do NOT add intermediate "analysis documents" or "synthesis reports" unless explicitly asked.
- Every task output must be a file or artifact that is either a final deliverable or consumed by a task.
- Prefer FEWER tasks with clear deliverables over many small tasks with intermediate artifacts.
- Copy acceptance criteria and rules VERBATIM from the task description into detailed specs.

## Output format
Write the plan in TWO sections:

### Section 1: Structured tasks for agetn-team run
Each task on one line inside a code block, format:
\`\`\`
- [ ] id:N priority:high|medium|low type:feature|research|refactor agents:agent1,agent2 Description of what to do
\`\`\`
Use \`depends:N,M\` for task dependencies.

### Section 2: Detailed spec per task
For each task id, write a detailed spec block:
\`\`\`
### Task #N — Title
**Agents:** architect, developer
**Depends on:** #M
**Input:** what the agent receives
**Output:** EXACT files/artifacts (full paths)
**Acceptance criteria:**
- criterion 1 (copied verbatim)
**Details:**
Complete instructions for the agent.
\`\`\`
`;

export async function planRoadmap(inputFile = "ROADMAP.md", model?: string) {
  const config = loadConfig();

  if (config.planner === "openspec") {
    await planWithOpenSpec(inputFile);
  } else {
    await planWithBuiltin(inputFile, model);
  }
}

async function planWithOpenSpec(inputFile: string) {
  if (!fs.existsSync(inputFile)) {
    err(`Input file not found: ${inputFile}`);
  }

  // If inputFile is inside an existing openspec change with tasks.md, just convert
  const existingChangeDir = path.dirname(inputFile);
  const existingTasks = path.join(existingChangeDir, "tasks.md");
  if (inputFile.includes("openspec/changes/") && fs.existsSync(existingTasks)) {
    log(
      `Converting existing OpenSpec change: ${BLUE}${existingChangeDir}${NC}`,
    );
    const tasksDir = "tasks";
    if (!fs.existsSync(tasksDir)) fs.mkdirSync(tasksDir, { recursive: true });
    const planFile = path.join(tasksDir, "plan.md");
    const converted = convertOpenSpecTasks(existingTasks, existingChangeDir);
    fs.writeFileSync(planFile, converted);
    ok(`Converted OpenSpec tasks → ${planFile}`);
    showTaskSummary(planFile);
    return;
  }

  const rawModel = findTeamLeadModel() || "sonnet";
  const resolvedModel = resolveModelAlias(rawModel);
  log(
    `Planning with ${BLUE}OpenSpec${NC} from ${BLUE}${inputFile}${NC} (model: ${GREEN}${resolvedModel}${NC})...`,
  );
  const startTime = Date.now();

  const roadmapContent = fs.readFileSync(inputFile, "utf-8");
  const changeName = `roadmap-${Date.now()}`;

  // Step 1: Create OpenSpec change directory
  const newChangeProc = Bun.spawnSync(
    ["npx", "@fission-ai/openspec", "new", "change", changeName],
    { stdio: ["inherit", "inherit", "inherit"] },
  );
  if (!newChangeProc.success) {
    err("Failed to create OpenSpec change. Is @fission-ai/openspec installed?");
  }

  const changeDir = path.join("openspec", "changes", changeName);

  // Step 2: Use Claude to populate the change artifacts
  const proposePrompt = `You are an autonomous planner. Read the task description and create OpenSpec artifacts.

## Task description

${roadmapContent}

## Instructions

Create the following files in ${changeDir}/:

### 1. proposal.md
Write a clear proposal with:
- Summary of what needs to be done
- Motivation and context
- Scope boundaries

### 2. design.md
Write architectural decisions:
- Technical approach
- Key components and their responsibilities
- Dependencies and risks

### 3. tasks.md
Write an implementation checklist using this EXACT format:

## 1. Setup
- [ ] 1.1 First setup task
- [ ] 1.2 Second setup task

## 2. Implementation
- [ ] 2.1 First implementation task
- [ ] 2.2 Second implementation task

## 3. Verification
- [ ] 3.1 Run tests and verify

Rules for tasks.md:
- Group tasks into numbered sections
- Each task is a checkbox: - [ ] N.M Description
- Order tasks by dependency (earlier tasks first)
- Be specific — each task should be actionable by a developer

After writing all files, output: PLAN_READY`;

  const cliArgs = [
    "claude",
    "-p",
    proposePrompt,
    "--max-turns",
    "25",
    "--output-format",
    "json",
    "--model",
    resolvedModel,
    "--allowedTools",
    "Read,Write,Edit,Glob,Grep,Bash",
  ];

  const proc = Bun.spawn(cliArgs, { stderr: "pipe" });

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

  const [response] = await Promise.all([
    new Response(proc.stdout).text(),
    stderrReader,
  ]);
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    const logDir = ".claude-loop/logs";
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    fs.writeFileSync(
      path.join(logDir, "plan-error.log"),
      `# OpenSpec plan failed — exit code: ${exitCode}\n# ${new Date().toISOString()}\n\n## STDERR\n${stderrChunks.join("")}\n\n## STDOUT\n${response}\n`,
    );
    err("OpenSpec planning failed via Claude CLI.");
  }

  ok(`OpenSpec proposal created: ${changeDir}/`);

  // Step 3: Convert OpenSpec tasks.md → our tasks/plan.md format
  const tasksDir = "tasks";
  if (!fs.existsSync(tasksDir)) fs.mkdirSync(tasksDir, { recursive: true });
  const planFile = path.join(tasksDir, "plan.md");

  const openspecTasks = path.join(changeDir, "tasks.md");
  if (fs.existsSync(openspecTasks)) {
    const converted = convertOpenSpecTasks(openspecTasks, changeDir);
    fs.writeFileSync(planFile, converted);
    ok(`Converted OpenSpec tasks → ${planFile}`);
  } else {
    warn(`No tasks.md found in ${changeDir}. Create it manually.`);
  }

  const elapsed = Date.now() - startTime;
  const mins = Math.floor(elapsed / 60000);
  const secs = Math.floor((elapsed % 60000) / 1000);
  ok(`OpenSpec plan created in ${CYAN}${mins}m ${secs}s${NC}`);
  showTaskSummary(planFile);
}

/**
 * Convert OpenSpec tasks.md format to agent-team plan.md format.
 *
 * OpenSpec: `- [ ] 1.1 Description`
 * Agent-team: `- [ ] id:N priority:high type:feature agents:developer Description`
 */
function convertOpenSpecTasks(tasksFile: string, changeDir: string): string {
  const content = fs.readFileSync(tasksFile, "utf-8");
  const lines = content.split("\n");

  let header = "# Execution Plan (from OpenSpec)\n\n";
  header += `> Source: ${changeDir}\n\n`;

  // Read proposal for context if available
  const proposalFile = path.join(changeDir, "proposal.md");
  if (fs.existsSync(proposalFile)) {
    const proposal = fs.readFileSync(proposalFile, "utf-8").trim();
    header += `## Proposal\n\n${proposal}\n\n`;
  }

  // Read design for context if available
  const designFile = path.join(changeDir, "design.md");
  if (fs.existsSync(designFile)) {
    const design = fs.readFileSync(designFile, "utf-8").trim();
    header += `## Design\n\n${design}\n\n`;
  }

  header += "## Section 1: Structured tasks for agent-team run\n\n```\n";

  const taskLines: string[] = [];
  const specBlocks: string[] = [];
  let taskId = 0;
  let currentSection = "";
  let prevTaskId = 0;

  for (const line of lines) {
    // Track section headers
    const sectionMatch = line.match(/^##\s+\d+\.\s+(.+)/);
    if (sectionMatch?.[1]) {
      currentSection = sectionMatch[1].trim();
      continue;
    }

    // Parse task checkboxes: - [ ] 1.1 Description or - [ ] Description
    const taskMatch = line.match(/^-\s+\[[ x]\]\s+(?:\d+\.\d+\s+)?(.+)/);
    if (taskMatch?.[1]) {
      taskId++;
      const desc = taskMatch[1].trim();
      const isChecked = line.includes("[x]");

      // Assign priority based on section position
      const priority = taskId <= 2 ? "high" : taskId <= 5 ? "high" : "medium";
      // Default agents — team-lead will delegate
      const agents = "developer";
      const depends =
        prevTaskId > 0 && taskId > 1 ? ` depends:${prevTaskId}` : "";
      const status = isChecked ? "x" : " ";

      taskLines.push(
        `- [${status}] id:${taskId} priority:${priority} type:feature agents:${agents}${depends} ${desc}`,
      );

      specBlocks.push(
        `### Task #${taskId} — ${desc}\n` +
          `**Agents:** ${agents}\n` +
          (depends ? `**Depends on:** #${prevTaskId}\n` : "") +
          `**Section:** ${currentSection || "General"}\n` +
          "**Output:** As specified in task description\n" +
          `**Details:**\n${desc}\n`,
      );

      prevTaskId = taskId;
    }
  }

  let result = header;
  result += taskLines.join("\n");
  result += "\n```\n\n---\n\n## Section 2: Detailed spec per task\n\n";
  result += specBlocks.join("\n---\n\n");

  return result;
}

async function planWithBuiltin(inputFile: string, model?: string) {
  if (!fs.existsSync(inputFile)) {
    err(`Input file not found: ${inputFile}`);
  }

  const tasksDir = "tasks";
  const planFile = path.join(tasksDir, "plan.md");
  if (!fs.existsSync(tasksDir)) fs.mkdirSync(tasksDir, { recursive: true });

  const roadmapContent = fs.readFileSync(inputFile, "utf-8");
  const fullPrompt = `${PROMPT_DECOMPOSITION}\n\n## Task description\n\n${roadmapContent}\n\n---\n\nWrite the full plan to: ${planFile}\nAfter writing, output: PLAN_READY`;

  const rawModel = model || findTeamLeadModel() || "sonnet";
  const resolvedModel = resolveModelAlias(rawModel);
  log(
    `Team-lead analyzing ${BLUE}${inputFile}${NC} (model: ${GREEN}${resolvedModel}${NC})...`,
  );
  const startTime = Date.now();

  const cliArgs = [
    "claude",
    "-p",
    fullPrompt,
    "--max-turns",
    "25",
    "--output-format",
    "json",
    "--model",
    resolvedModel,
    "--allowedTools",
    "Read,Write,Edit,Glob,Grep,Bash",
  ];

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

  const [response] = await Promise.all([
    new Response(proc.stdout).text(),
    stderrReader,
  ]);
  const stderrText = stderrChunks.join("");
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    // Save log for debugging
    const logDir = ".claude-loop/logs";
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    const logFile = path.join(logDir, "plan-error.log");
    fs.writeFileSync(
      logFile,
      `# Plan failed — exit code: ${exitCode}\n# ${new Date().toISOString()}\n\n## STDERR\n${stderrText}\n\n## STDOUT\n${response}\n`,
    );
    warn(`Error log saved to ${logFile}`);
    err("Planning failed via Claude CLI.");
  }

  const elapsed = Date.now() - startTime;
  const mins = Math.floor(elapsed / 60000);
  const secs = Math.floor((elapsed % 60000) / 1000);

  if (response.includes("PLAN_READY")) {
    ok(`Plan created in ${CYAN}${mins}m ${secs}s${NC}: ${planFile}`);
    showTaskSummary(planFile);
  } else {
    warn(
      "Team-lead finished but PLAN_READY not confirmed. Check tasks/plan.md",
    );
  }
}

function showTaskSummary(planFile: string) {
  if (!fs.existsSync(planFile)) return;
  const content = fs.readFileSync(planFile, "utf-8");
  const taskLines = content.match(/^- \[ \] id:\d+.*/gm) || [];

  console.log("");
  console.log(`  ${CYAN}Tasks:${NC} ${taskLines.length}`);
  console.log(`  ${CYAN}File:${NC}  ${planFile}`);
  console.log("");

  for (const line of taskLines) {
    const idMatch = line.match(/id:(\d+)/);
    const priMatch = line.match(/priority:(\w+)/);
    const desc = line
      .replace(/^- \[ \] id:\d+\s+priority:\w+\s+/, "")
      .replace(/type:\w+\s+/, "")
      .replace(/depends:[\d,]+\s+/, "")
      .replace(/agents:[a-z,-]+\s+/, "")
      .trim();

    const id = idMatch ? idMatch[1] : "?";
    const pri = priMatch ? priMatch[1] : "medium";

    let priColor = NC;
    if (pri === "high") priColor = RED;
    else if (pri === "medium") priColor = YELLOW;
    else if (pri === "low") priColor = GREEN;

    console.log(`  ${BLUE}#${id}${NC} ${priColor}[${pri}]${NC} ${desc}`);
  }
  console.log("");
}
