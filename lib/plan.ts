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
  warn,
  YELLOW,
} from "./common.ts";

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

export async function planRoadmap(inputFile = "ROADMAP.md") {
  const config = loadConfig();

  if (config.planner === "openspec") {
    await planWithOpenSpec(inputFile);
  } else {
    await planWithBuiltin(inputFile);
  }
}

async function planWithOpenSpec(inputFile: string) {
  if (!fs.existsSync(inputFile)) {
    err(`Input file not found: ${inputFile}`);
  }

  log(`Planning with ${BLUE}OpenSpec${NC} from ${BLUE}${inputFile}${NC}...`);

  const roadmapContent = fs.readFileSync(inputFile, "utf-8");
  const changeName = `roadmap-${Date.now()}`;

  // Create an OpenSpec proposal from the roadmap
  const proposePrompt = `Read this roadmap and create an OpenSpec proposal using the /opsx:propose command pattern.

Roadmap content:
${roadmapContent}

Steps:
1. Run: npx @fission-ai/openspec propose "${changeName}"
2. Write the roadmap content into the generated proposal.md
3. Fill in the design.md with architectural decisions
4. Break down into tasks in tasks.md
5. Output PLAN_READY when done`;

  const proc = Bun.spawn(
    [
      "claude",
      "-p",
      proposePrompt,
      "--max-turns",
      "30",
      "--output-format",
      "json",
      "--allowedTools",
      "Read,Write,Edit,Glob,Grep,Bash",
    ],
    { stderr: "inherit" },
  );

  const response = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    err("OpenSpec planning failed.");
  }

  if (response.includes("PLAN_READY")) {
    ok(`OpenSpec proposal created: openspec/changes/${changeName}/`);
  } else {
    warn(
      "Planning finished but PLAN_READY not confirmed. Check openspec/changes/",
    );
  }
}

async function planWithBuiltin(inputFile: string) {
  if (!fs.existsSync(inputFile)) {
    err(`Input file not found: ${inputFile}`);
  }

  const tasksDir = "tasks";
  const planFile = path.join(tasksDir, "plan.md");
  if (!fs.existsSync(tasksDir)) fs.mkdirSync(tasksDir, { recursive: true });

  const roadmapContent = fs.readFileSync(inputFile, "utf-8");
  const fullPrompt = `${PROMPT_DECOMPOSITION}\n\n## Task description\n\n${roadmapContent}\n\n---\n\nWrite the full plan to: ${planFile}\nAfter writing, output: PLAN_READY`;

  log(`Team-lead analyzing ${BLUE}${inputFile}${NC}...`);
  const startTime = Date.now();

  const proc = Bun.spawn(
    [
      "claude",
      "-p",
      fullPrompt,
      "--max-turns",
      "30",
      "--output-format",
      "json",
      "--allowedTools",
      "Read,Write,Edit,Glob,Grep,Bash",
    ],
    {
      stderr: "inherit",
    },
  );

  const response = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
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
