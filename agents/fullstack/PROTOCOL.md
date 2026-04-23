# Fullstack Agent Communication Protocol

All fullstack agents must use this protocol for inter-agent messaging.

## Execution Flow

```text
ROADMAP.md -> agent-team plan (creates task list)
                         |
task list -> agent-team run (executes tasks one by one)
                         |
       fs-team-lead -> fs-agents (per task spec)
```

Task sources (detected automatically by `agent-team run`):

- **OpenSpec mode**: `openspec/changes/<name>/tasks.md`
  (format: `- [ ] 1.1 Description`)
- **Built-in planner**: `tasks/plan.md`
  (format: `- [ ] id:N priority:high ...`)

1. **Planning**: `agent-team plan` decomposes ROADMAP.md into a task list
2. **Execution**: `agent-team run` picks tasks by priority and dependencies
3. **Coordination**: team-lead routes to the right developer(s)
   and coordinates via protocol below

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
| `DESIGN_ISSUE` | Visual or accessibility mismatch (fe-reviewer) |
| `API_ISSUE` | API contract mismatch (be-dev <-> fe-dev) |
| `BUG_REPORT` | QA found a bug |
| `BUG_FIX` | Developer fixed a bug |
| `DONE` | Task complete, passing result upstream |
| `HUMAN_REVIEW` | Need human input or approval |
| `BLOCKED` | Cannot continue, need help from team-lead |

## Communication Graph

```text
fs-team-lead ---+---> fs-architect <---> fe-dev <---> fs-reviewer
                |                          ^              |
                |                          | fixes        | approved
                |                          v              v
                |                       fs-qa <-------> fs-aqa
                |                          ^
                |                          | fixes
                +---> fs-architect <---> be-dev
                                           ^
                                           |
                                        fe-dev (API contract sync)
```

- `fs-team-lead` coordinates all agents, **never writes code**
- `fs-team-lead` **routes tasks** to fe-dev, be-dev, or both
  based on what needs to change (see Routing Rules below)
- `fs-architect` designs UI + API together, writes .claude-loop/reports/task-{id}-spec.md
- `fe-dev` implements UI components, consumes APIs
- `be-dev` implements APIs, services, DB migrations
- `fe-dev` and `be-dev` sync on API contracts when both are
  involved in a task
- `fs-reviewer` reviews both frontend and backend code
- `fs-qa` and `fs-aqa` run after reviewer approves

## Task Routing Rules

The team-lead MUST classify each task before spawning agents.

### Scope Detection

Analyze the task description, changed files, and spec to determine scope:

| Signal | Scope |
|--------|-------|
| UI components, CSS, views, templates, design tokens | **frontend** |
| API endpoints, controllers, services, DB, migrations | **backend** |
| Feature spanning UI + API (e.g. "add user settings page") | **fullstack** |
| Tests for UI components | **frontend** |
| Tests for API/services | **backend** |
| Config, CI, docs | **infra** (route to whichever dev is closer) |

### Routing Matrix

| Scope | Agents Spawned | Coordination |
|-------|---------------|--------------|
| **frontend** | fs-architect -> fe-dev -> fs-reviewer -> fs-qa | Standard frontend flow |
| **backend** | fs-architect -> be-dev -> fs-reviewer -> fs-qa | Standard backend flow |
| **fullstack** | fs-architect -> be-dev + fe-dev (parallel or sequential) -> fs-reviewer -> fs-qa | Architect defines API contract first. be-dev implements API, fe-dev consumes it. Reviewer checks both. |

### Fullstack Coordination

When a task requires both frontend and backend changes:

1. **Architect** defines the API contract in .claude-loop/reports/task-{id}-spec.md
   (endpoints, request/response shapes, error codes)
2. **be-dev** implements the API first (or in parallel if
   contract is stable)
3. **fe-dev** implements UI that consumes the API
4. If API changes during implementation, be-dev sends
   `API_ISSUE` to fe-dev with the updated contract
5. **fs-reviewer** reviews both sides in a single pass
6. **fs-qa** tests the integrated flow end-to-end

## Project Rules Discovery (MANDATORY)

Every agent MUST discover and read the target project's
configuration before starting work. Do NOT assume any specific
files, tools, or frameworks exist.

### Discovery procedure

```bash
# 1. Find project documentation and coding rules
ls -la *.md CLAUDE.md .claude/ .github/ docs/ 2>/dev/null

# 2. Detect package manager and available scripts
ls package.json pyproject.toml Cargo.toml go.mod Makefile 2>/dev/null

# 3. Detect lint configuration
ls .eslintrc* .prettierrc* biome.json tslint.json 2>/dev/null
ls .pylintrc .flake8 .golangci.yml .rubocop.yml 2>/dev/null

# 4. Detect test configuration
ls jest.config* vitest.config* playwright.config* 2>/dev/null
ls pytest.ini setup.cfg tox.ini 2>/dev/null

# 5. Detect framework-specific tools
ls vite.config* next.config* nuxt.config* 2>/dev/null
ls tsconfig.json .env* docker-compose* 2>/dev/null
```

The discovered rules are the **source of truth** for code quality
standards. Agents must follow them, not invent their own.

## Quality Gates -- Definition of Done (MANDATORY)

A task is NOT done until ALL three gates pass. No agent may report
`DONE` or `verdict: PASS` while any gate is red.

| Gate | Command (detect from project) | Criteria |
|------|-------------------------------|----------|
| **Tests** | detected test command | All tests pass, coverage thresholds met |
| **Lint** | detected lint command | Zero errors |
| **Build** | detected build command | Compiles without errors |

### Enforcement rules

- **Developer** (fe-dev/be-dev): Must run lint and fix errors
  BEFORE requesting architect review.
- **Reviewer**: Must run lint as part of review. Lint errors are
  **Critical** findings.
- **QA**: Must run all three gates. Any gate failure =
  `verdict: FAIL`. Iterate with developer until all gates pass.
- **Team Lead**: Must independently verify all three gates before
  accepting a task as DONE.

### Gate failure flow

```text
Gate fails -> QA/Reviewer reports failure to developer
           -> Developer fixes and re-submits
           -> QA/Reviewer re-runs gates
           -> Repeat until all gates pass
```

## Handoff Summary

Every agent MUST end its final message with a structured handoff:

```markdown
## Handoff Summary

**Status**: [DONE | BLOCKED | NEEDS_REVIEW]
**Changes**: <bullet list of files changed and why>
**Decisions**: <key technical decisions made>
**Next Agent**: [agent-name] -- <what they need to do>
**Blockers**: <none | description>
```

Agents must NOT assume prior context -- re-derive state from
the Handoff Summary.

## Memory Management

All agents MUST use `.claude-loop/memory.md` to persist and share
knowledge across tasks.

- **Read**: At the start of every task, read `.claude-loop/memory.md`
- **Write**: Before finishing, append findings: design decisions,
  API contracts, gotchas, patterns established
- **Format**: Use `## Task #N: Title` sections

### Librarian Agent

The `librarian` agent runs automatically after each completed task.
It reads the task report and updates `memory.md` with extracted
decisions, errors, patterns, and gotchas.
Agent-specific gotchas are synced to `skills/*/references/gotchas.md`.

## External Review (optional)

When configured (`agent-team.json` -> `externalReview`), an external
CLI agent runs automatically after each completed task. It reviews
changes independently and saves findings to
`.claude-loop/reports/task-{id}-external-review.md`.

## Reports and Logs

- Task reports: `.claude-loop/reports/task-{id}.md`
- External reviews: `.claude-loop/reports/task-{id}-external-review.md`
- Task logs: `.claude-loop/logs/`
- Audit trail: `.claude-loop/audit/audit.jsonl`
