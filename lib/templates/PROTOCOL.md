# Agent Communication Protocol

All agents must use this protocol for inter-agent messaging.

## Execution Flow

```text
ROADMAP.md → agent-team plan (creates task list)
                         ↓
task list → agent-team run (executes tasks one by one)
                         ↓
       {{TEAM_PREFIX}}team-lead → {{TEAM_PREFIX}}agents (per task spec)
```

Task sources (detected automatically by `agent-team run`):

- **OpenSpec mode**: `openspec/changes/<name>/tasks.md` (format: `- [ ] 1.1 Description`)
- **Built-in planner**: `tasks/plan.md` (format: `- [ ] id:N priority:high ...`)

1. **Planning**: `agent-team plan` decomposes ROADMAP.md into a task list
2. **Execution**: `agent-team run` picks tasks by priority and dependencies
3. **Coordination**: team-lead spawns agents per task spec, coordinates via protocol below

## Message Format

Use the Teammate tool to communicate with other agents:

```javascript
Teammate({
  operation: "write",
  target_agent_id: "<agent-name>",
  message: JSON.stringify({
    from: "<my-name>",
    type: "<type>",
    subject: "<subject>",
    body: "<text>",
    files: ["<changed-files>"],       // optional
    requires_response: true | false
  })
})
```

## Message Types

| Type | When to use |
|------|-------------|
| `QUESTION` | Need clarification before continuing |
| `ANSWER` | Response to a `QUESTION` |
| `REVIEW_REQUEST` | Asking architect or reviewer to check work |
| `REVIEW_FEEDBACK` | Review result with findings |
| `BUG_REPORT` | QA found a bug, reporting to developer |
| `BUG_FIX` | Developer fixed a bug, notifying QA to re-run |
| `HUMAN_REVIEW` | Need human input or approval before proceeding |
| `DONE` | Task complete, passing result upstream |
| `BLOCKED` | Cannot continue, need help from team-lead |

## Project Rules Discovery (MANDATORY)

Every agent MUST discover and read the target project's configuration before starting work.
Do NOT assume any specific files, tools, or frameworks exist.

### Discovery procedure

```bash
# 1. Find project documentation and coding rules
ls -la *.md CLAUDE.md .claude/ .github/ docs/ 2>/dev/null
# Read any files that describe coding standards, guidelines, or contribution rules

# 2. Detect package manager and available scripts
ls package.json pyproject.toml Cargo.toml go.mod Makefile Gemfile 2>/dev/null
# Read the detected manifest to find lint, test, build, format commands

# 3. Detect lint configuration
ls .eslintrc* .prettierrc* biome.json tslint.json .pylintrc .flake8 2>/dev/null
# Read whichever exist to understand the project's lint rules

# 4. Detect test configuration
ls jest.config* vitest.config* .mocharc* pytest.ini setup.cfg 2>/dev/null
# Read whichever exist to understand coverage thresholds and test patterns
```

The discovered rules are the **source of truth** for code quality standards.
Agents must follow them, not invent their own.

## Quality Gates — Definition of Done (MANDATORY)

A task is NOT done until ALL three gates pass.
No agent may report `DONE` or `verdict: PASS` while any gate is red.

| Gate | Command (detect from project) | Criteria |
|------|-------------------------------|----------|
| **Tests** | detected test command | All tests pass, coverage thresholds met |
| **Lint** | detected lint command | Zero errors |
| **Build** | detected build command | Compiles without errors |

### Enforcement rules

- **Developer**: Must run lint and fix errors BEFORE requesting review.
- **Reviewer**: Must run lint as part of review. Lint errors are **Critical**.
- **QA**: Must run all three gates. Any failure = `verdict: FAIL`.
- **Team Lead**: Must independently verify all three gates before accepting DONE.

### Gate failure flow

```text
Gate fails → QA/Reviewer reports failure to developer
         → Developer fixes and re-submits
         → QA/Reviewer re-runs gates
         → Repeat until all gates pass
```

## Handoff Summary

Every agent MUST end its final message with a structured handoff block:

```markdown
## Handoff Summary

**Status**: [DONE | BLOCKED | NEEDS_REVIEW]
**Changes**: <bullet list of files changed and why>
**Decisions**: <key technical decisions made>
**Next Agent**: [agent-name] — <what they need to do>
**Blockers**: <none | description>
```

Agents must NOT assume prior context — re-derive state from the Handoff Summary.

## Memory Management

All agents MUST use `.claude-loop/memory.md` to persist and share knowledge across tasks.

- **Read**: At the start of every task, read `.claude-loop/memory.md` for context
- **Write**: Before finishing, append findings: decisions, gotchas, patterns
- **Format**: Use `## Task #N: Title` sections

### Librarian Agent

The `librarian` agent runs automatically after each completed task.
It reads the task report and updates `memory.md` with extracted decisions, errors, patterns, and gotchas.
Agent-specific gotchas are synced to the relevant `skills/*/references/gotchas.md`.

## Reports and Logs

- Task reports: `.claude-loop/reports/task-{id}.md`
- Task logs: `.claude-loop/logs/`
- Audit trail: `.claude-loop/audit/audit.jsonl`
