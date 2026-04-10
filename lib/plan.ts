import fs from "node:fs";
import path from "node:path";
import * as p from "@clack/prompts";
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

/**
 * List existing OpenSpec changes with their status.
 */
function listOpenSpecChanges(): {
  name: string;
  dir: string;
  hasProposal: boolean;
  hasTasks: boolean;
  hasDesign: boolean;
}[] {
  const changesDir = path.join("openspec", "changes");
  if (!fs.existsSync(changesDir)) return [];

  return fs
    .readdirSync(changesDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name !== "archive")
    .map((e) => {
      const dir = path.join(changesDir, e.name);
      return {
        name: e.name,
        dir,
        hasProposal: fs.existsSync(path.join(dir, "proposal.md")),
        hasTasks: fs.existsSync(path.join(dir, "tasks.md")),
        hasDesign: fs.existsSync(path.join(dir, "design.md")),
      };
    });
}

/**
 * Interactive prompt: select an existing OpenSpec change or create a new one.
 * Returns { changeDir, changeName, isNew, roadmapContent }.
 */
async function selectOrCreateChange(inputFile: string): Promise<{
  changeDir: string;
  changeName: string;
  isNew: boolean;
  roadmapContent: string;
}> {
  const roadmapContent = fs.readFileSync(inputFile, "utf-8");
  const existing = listOpenSpecChanges();

  // If no existing changes, go straight to creation
  if (existing.length === 0) {
    return promptNewChangeName(roadmapContent);
  }

  // Interactive: show existing changes + option to create new
  const options = existing.map((c) => {
    const artifacts: string[] = [];
    if (c.hasProposal) artifacts.push("proposal");
    if (c.hasDesign) artifacts.push("design");
    if (c.hasTasks) artifacts.push("tasks");
    const hint =
      artifacts.length > 0 ? artifacts.join(", ") : "empty — no artifacts";
    return { value: c.name, label: c.name, hint };
  });

  options.push({
    value: "__new__",
    label: "Create new change",
    hint: `from ${inputFile}`,
  });

  const selected = await p.select({
    message: "Select an OpenSpec change or create new",
    options,
  });

  if (p.isCancel(selected)) {
    p.cancel("Planning cancelled.");
    process.exit(0);
  }

  if (selected === "__new__") {
    return promptNewChangeName(roadmapContent);
  }

  // Use existing change
  const change = existing.find((c) => c.name === selected);
  if (!change) return promptNewChangeName(roadmapContent);
  return {
    changeDir: change.dir,
    changeName: change.name,
    isNew: false,
    roadmapContent,
  };
}

async function promptNewChangeName(roadmapContent: string): Promise<{
  changeDir: string;
  changeName: string;
  isNew: boolean;
  roadmapContent: string;
}> {
  const changeName = await p.text({
    message: "Change name (kebab-case, descriptive)",
    placeholder: "add-test-coverage",
    validate: (v) => {
      if (!v?.trim()) return "Name is required";
      if (!/^[a-z0-9][a-z0-9-]*$/.test(v.trim()))
        return "Use kebab-case: lowercase letters, numbers, hyphens";
      const dir = path.join("openspec", "changes", v.trim());
      if (fs.existsSync(dir)) return `Change "${v.trim()}" already exists`;
      return undefined;
    },
  });

  if (p.isCancel(changeName)) {
    p.cancel("Planning cancelled.");
    process.exit(0);
  }

  const name = (changeName as string).trim();
  const changeDir = path.join("openspec", "changes", name);

  return { changeDir, changeName: name, isNew: true, roadmapContent };
}

async function planWithOpenSpec(inputFile: string) {
  if (!fs.existsSync(inputFile)) {
    err(`Input file not found: ${inputFile}`);
  }

  // Interactive: select existing change or create new
  const { changeDir, changeName, isNew, roadmapContent } =
    await selectOrCreateChange(inputFile);

  // Determine which artifacts need generation
  const hasProposal = fs.existsSync(path.join(changeDir, "proposal.md"));
  const hasDesign = fs.existsSync(path.join(changeDir, "design.md"));
  const hasTasks = fs.existsSync(path.join(changeDir, "tasks.md"));

  // If existing change already has all artifacts, just show summary
  if (!isNew && hasProposal && hasDesign && hasTasks) {
    ok(`Change ${BLUE}${changeName}${NC} is ready (proposal + design + tasks)`);
    showOpenSpecTaskSummary(path.join(changeDir, "tasks.md"));
    return;
  }

  // Create change directory if new
  if (isNew) {
    const newChangeProc = Bun.spawnSync(
      ["npx", "@fission-ai/openspec", "new", "change", changeName],
      { stdio: ["inherit", "inherit", "inherit"] },
    );
    if (!newChangeProc.success) {
      err(
        "Failed to create OpenSpec change. Is @fission-ai/openspec installed?",
      );
    }
  }

  // Build prompt — only generate missing artifacts
  const missingArtifacts: string[] = [];
  if (!hasProposal)
    missingArtifacts.push(
      "### proposal.md\nWrite a clear proposal with:\n- Summary of what needs to be done\n- Goals and non-goals\n- Motivation and context\n- Scope boundaries",
    );
  if (!hasDesign)
    missingArtifacts.push(
      "### design.md\nWrite architectural decisions:\n- Technical approach\n- Key components and their responsibilities\n- Dependencies and risks",
    );
  if (!hasTasks)
    missingArtifacts.push(
      "### tasks.md\nWrite a DETAILED implementation checklist using this EXACT format:\n\n## 1. Section Name\n- [ ] 1.1 Detailed task description with specific files/components\n- [ ] 1.2 Another task\n\n## 2. Next Section\n- [ ] 2.1 Task\n\nRules for tasks.md:\n- Group tasks into numbered sections\n- Each task is a checkbox: - [ ] N.M Description\n- Order tasks by dependency (earlier tasks first)\n- Be VERY specific — include file paths, function names, exact changes needed\n- Each task should be independently executable by a developer agent",
    );

  if (missingArtifacts.length === 0) {
    ok(`Change ${BLUE}${changeName}${NC} already has all artifacts.`);
    showOpenSpecTaskSummary(path.join(changeDir, "tasks.md"));
    return;
  }

  // Include existing artifacts as context
  let existingContext = "";
  if (hasProposal) {
    const proposal = fs.readFileSync(
      path.join(changeDir, "proposal.md"),
      "utf-8",
    );
    existingContext += `\n## Existing proposal\n\n${proposal}\n`;
  }
  if (hasDesign) {
    const design = fs.readFileSync(path.join(changeDir, "design.md"), "utf-8");
    existingContext += `\n## Existing design\n\n${design}\n`;
  }

  const rawModel = findTeamLeadModel() || "sonnet";
  const resolvedModel = resolveModelAlias(rawModel);
  log(
    `Planning ${BLUE}${changeName}${NC} (model: ${GREEN}${resolvedModel}${NC}, generating: ${missingArtifacts.length} artifact(s))...`,
  );
  const startTime = Date.now();

  const proposePrompt = `You are an autonomous planner. Read the task description and create OpenSpec artifacts.

## Task description

${roadmapContent}
${existingContext}

## Instructions

Create the following files in ${changeDir}/:

${missingArtifacts.join("\n\n")}

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

  const elapsed = Date.now() - startTime;
  const mins = Math.floor(elapsed / 60000);
  const secs = Math.floor((elapsed % 60000) / 1000);
  ok(
    `Created change ${BLUE}${changeName}${NC} in ${CYAN}${mins}m ${secs}s${NC}`,
  );

  const tasksFile = path.join(changeDir, "tasks.md");
  if (fs.existsSync(tasksFile)) {
    showOpenSpecTaskSummary(tasksFile);
  } else {
    warn(`No tasks.md in ${changeDir}. Create it manually or re-run plan.`);
  }
}

/**
 * Show task summary from an OpenSpec tasks.md file (native format).
 */
function showOpenSpecTaskSummary(tasksFile: string) {
  if (!fs.existsSync(tasksFile)) return;
  const content = fs.readFileSync(tasksFile, "utf-8");
  const taskLines = content.match(/^- \[[ x]\] \d+\.\d+\s+.*/gm) || [];

  console.log("");
  console.log(`  ${CYAN}Tasks:${NC}  ${taskLines.length}`);
  console.log(`  ${CYAN}Source:${NC} ${tasksFile}`);
  console.log("");

  for (const line of taskLines) {
    const idMatch = line.match(/(\d+\.\d+)/);
    const isChecked = line.includes("[x]");
    const desc = line.replace(/^- \[[ x]\] \d+\.\d+\s+/, "").trim();
    const id = idMatch ? idMatch[1] : "?";
    const status = isChecked ? `${GREEN}✓${NC}` : `${BLUE}○${NC}`;
    console.log(`  ${status} ${BLUE}${id}${NC} ${desc}`);
  }
  console.log("");
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
