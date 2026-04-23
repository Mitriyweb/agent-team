# AI Agent Team

Autonomous development team powered by AI.
Drop this into any project and let the agents work through your roadmap.

**Software Development**

```text
team-lead ──► architect ◄──► developer ◄──► reviewer
                                 ▲               │ approved
                                 └── qa ◄──► aqa ◄┘
```

**Frontend**

```text
team-lead ──► fe-architect ◄──► fe-dev ◄──► fe-reviewer
                                   ▲               │ approved
                                   └── fe-qa ◄──► fe-aqa ◄┘
```

**Fullstack**

```text
team-lead ──┬──► architect ◄──► fe-dev ◄──► reviewer
            │                     ▲             │ approved
            │                     │ API sync    ▼
            └──► architect ◄──► be-dev      qa ◄──► aqa
```

**Localization**

```text
team-lead ──► tech-writer ◄──► localizer(s) ◄──► qa
                  ▲                               │
                  └────── seo-specialist ◄─────────┘
```

## Installation

### Option 1: One-line install (Recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/Mitriyweb/agent-team/main/install.sh | bash
```

Detects your platform, downloads the binary, and installs to `~/.local/bin/`.

### Option 2: npx (no install)

```bash
npx @mitriyweb/agent-team init
```

### Option 3: Clone from source

```bash
git clone https://github.com/Mitriyweb/agent-team.git
cd agent-team && bun install && bun run build
ln -sf $(pwd)/dist/agent-team ~/.local/bin/agent-team
```

> Make sure `~/.local/bin` is in your `PATH`.

## Quickstart

```bash
# Interactive setup (recommended)
agent-team init

# Non-interactive (flags skip prompts)
agent-team init --team "software development"
agent-team init --team frontend --no-human-review
agent-team init --team fullstack
agent-team init --team "software development" --planner openspec

# Import rules (interactive if no path given)
agent-team import
agent-team import .windsurf
```

This will:

- Deploy agent definitions to `.claude/agents/` (flat layout)
- Deploy the **librarian** agent for automated memory curation
- Generate `CLAUDE.md` with team context (managed block)
- Create `.claude-loop/memory.md` with structured knowledge base template
- Create `ROADMAP.md` (builtin planner) or init OpenSpec
- Configure `.claude/settings.json` with team profiles
- Save project config to `agent-team.json`

Then run:

```bash
agent-team run --all          # execute all tasks via Agent SDK (default)
agent-team run                # execute one task (highest priority)
agent-team run --dry-run      # preview without running
agent-team run --cli          # use CLI subprocess instead of SDK
agent-team run --all --stop-at 1.3  # execute tasks and stop after task 1.3
```

## CLI Commands

```text
Setup:
  agent-team init                                      Interactive setup
  agent-team init --team NAME [--planner P]             Non-interactive
                 [--telegram-token T --telegram-chat C]
  agent-team update                                    Update project configs
  agent-team reconfigure                               Update skills & workflows
  agent-team import [path]                             Import rules (interactive if no path)

Execution:
  agent-team run [--all] [--plan] [--dry-run]          Execute tasks (SDK mode)
                 [--team NAME] [--model MODEL]
                 [--budget N] [--resume ID] [--stop-at ID]
                 [--branch] [--cli]                    Use CLI subprocess instead of SDK
  agent-team plan [FILE] [--model MODEL]               Decompose roadmap into tasks

Teams:
  agent-team new-team                                  Interactive team creation
  agent-team new-team --name N --description D --roles R1,R2
  agent-team validate NAME                             Validate team structure

Export:
  agent-team sync-vault [--agents DIR] [--vault DIR]   Sync agents to Obsidian vault

Monitoring:
  agent-team audit                                     Show audit report

  agent-team -v, --version                             Show version
  agent-team -h, --help                                Show this help
```

All setup commands (`init`, `new-team`, `import`) are interactive by default.
Pass CLI flags to skip prompts for scripting and CI.

## Planning

### Built-in planner (default)

Driven by `ROADMAP.md` in the project root.

1. Create a `ROADMAP.md` with your requirements
2. Run `agent-team plan` — team-lead decomposes it into `tasks/plan.md`
3. Run `agent-team run --all` — executes tasks by priority and dependencies

Task format:

```markdown
- [ ] id:1 priority:high type:feature agents:architect,developer Implement login API
- [ ] id:2 priority:high type:feature agents:developer,qa depends:1 Write login tests
```

### OpenSpec planner

[OpenSpec](https://github.com/Fission-AI/OpenSpec) separates planning from execution with structured specs.

```bash
agent-team init --team "software development" --planner openspec
agent-team plan          # Interactive: select existing change or create new
agent-team run --all     # Interactive: select which change to execute
```

**Planning flow:**

1. `agent-team plan` prompts to select an existing OpenSpec change or create a new one
2. New changes prompt for a descriptive kebab-case name (e.g., `add-test-coverage`)
3. Each missing artifact is generated using `openspec instructions <artifact>` for enriched prompts.
   Falls back to a generic prompt if your OpenSpec version lacks `instructions` (only in experimental builds).
4. After generation, `openspec validate --strict` validates the complete change
5. Artifacts stay in `openspec/changes/NAME/` (no intermediate `tasks/plan.md`)

**Execution flow:**

1. `agent-team run` prompts to select which OpenSpec change to execute (or create new)
2. Tasks are read directly from `openspec/changes/NAME/tasks.md`
3. Proposal and design are injected as context into each task's spec
4. Task status is tracked in-place (`[x]`, `[~]`, `[!]`) within `tasks.md`
5. When all tasks complete, `openspec validate` + `openspec archive` run automatically

**Change lifecycle:**

```text
plan → validate → run → validate → archive
```

- **Validation** runs automatically after planning and after all tasks complete
- **Archiving** moves the completed change to `openspec/changes/archive/` and updates main specs
- If validation fails, archiving is skipped with instructions for manual resolution

**Change structure:**

```text
openspec/changes/add-test-coverage/
├── .openspec.yaml    # Metadata
├── proposal.md       # What and why
├── design.md         # Technical approach
└── tasks.md          # Actionable checklist (source of truth for execution)
```

Requires the `openspec` CLI on your `PATH`. Install via either:

- `brew install openspec` (recommended — includes experimental `instructions` command for enriched prompts)
- `npm i -g @fission-ai/openspec` (falls back to generic prompts on stable builds)

`agent-team` auto-detects whichever binary is available (`openspec` on `PATH` first, then `npx --no-install @fission-ai/openspec`).

## Project Structure After Init

```text
your-project/
├── CLAUDE.md                    # Project instructions (with agent-team managed block)
├── .claude-loop/
│   ├── memory.md                # Structured knowledge base (curated by librarian)
│   ├── logs/                    # Task execution logs (task-{id}-{ts}.log)
│   ├── reports/                 # Task reports and cost summary
│   └── audit/
│       └── audit.jsonl          # Tool call audit trail (role, agent, tool, phase)
├── agent-team.json              # Project config (planner, team name)
├── .claude/
│   ├── settings.json            # Permissions, profiles, hooks
│   └── agents/
│       ├── librarian.md         # Knowledge curator (cross-team, auto-deployed)
│       ├── sw-team-lead.md      # Agent definitions (flat layout)
│       ├── sw-architect.md
│       ├── sw-developer.md
│       ├── sw-reviewer.md
│       ├── sw-qa.md
│       ├── sw-PROTOCOL.md       # Communication protocol
│       ├── team-lead/
│       │   └── CLAUDE.md        # Subagent context
│       ├── architect/
│       │   └── CLAUDE.md
│       └── skills/              # Agent skills and references
├── ROADMAP.md                   # Task descriptions (builtin planner)
├── tasks/
│   └── plan.md                  # Decomposed task plan (builtin planner only)
└── openspec/                    # (OpenSpec planner only)
    ├── config.yaml              # OpenSpec project config
    ├── project.md               # Project context
    ├── specs/                   # Permanent specifications
    └── changes/                 # Active changes
        └── NAME/
            ├── proposal.md      # What and why
            ├── design.md        # Technical approach
            └── tasks.md         # Execution checklist (source of truth)
```

## Importing Rules

Import rules and workflows from other AI coding tools:

```bash
agent-team import               # Interactive — auto-detects available sources
agent-team import .windsurf     # Windsurf rules (rules/*.md + .windsurfrules)
agent-team import .cursor       # Cursor rules (rules/*.mdc + .cursorrules)
agent-team import .github       # GitHub Copilot (copilot-instructions.md)
agent-team import .claude       # Another Claude project (CLAUDE.md + rules/)
agent-team import /path/to/project  # Auto-detect from project root
```

Always-on rules are added to `CLAUDE.md`. Glob/manual rules go to `.claude/rules/`.

## Execution Modes

### SDK mode (default)

Tasks run via `@anthropic-ai/claude-agent-sdk` — a programmatic API that streams messages in-process.
Agent definitions are read from `.claude/agents/` (or `agents/`), frontmatter is parsed for tools, model, and permissions, and safety hooks block dangerous commands.

```bash
agent-team run --all              # SDK mode (default)
```

### CLI mode

Falls back to spawning `claude` as a subprocess (the original behavior). Useful when the SDK is unavailable or for debugging.

```bash
agent-team run --all --cli        # CLI subprocess mode
```

### Docker (SDK)

```bash
docker build -f Dockerfile.sdk -t agent-team-sdk .
docker run -e ANTHROPIC_API_KEY=sk-ant-... agent-team-sdk
```

### Configuration

`agent-team.json` supports project-level settings:

```json
{
  "planner": "builtin",
  "team": "software development",
  "blockedBashPatterns": ["docker\\s+system\\s+prune", "DROP\\s+TABLE"],
  "externalReview": { "agent": "codex" },
  "telegram": { "botToken": "7xxx:AAF...", "chatId": "123456789" }
}
```

- `blockedBashPatterns` — regex patterns added to built-in safety hooks
- `externalReview` — optional external CLI agent for independent review after each task
- `telegram` — optional Telegram notifications for task lifecycle events

### External Review

Configure an external CLI agent to independently review specs and implementations after each task completes.

Supported agents: `codex`, `devin`, `aider`, `claude`, `gemini`.

```bash
# Interactive setup
agent-team init                                      # select from list
agent-team reconfigure                               # change existing config

# Non-interactive
agent-team init --team "software development" --external-review codex
```

When configured, the runner automatically invokes the external agent after each successful task. Review output is saved to `.claude-loop/reports/task-{id}-external-review.md`.

To use a custom command or path, set `command` in the config:

```json
{
  "externalReview": { "agent": "codex", "command": "/usr/local/bin/codex" }
}
```

### Telegram Notifications

Get real-time task status updates in Telegram.

```bash
# Interactive setup
agent-team init                  # prompts for bot token + chat ID
agent-team reconfigure           # update existing config

# Non-interactive
agent-team init --team frontend \
  --telegram-token 7xxx:AAF... --telegram-chat 123456789
```

**Setup:**

1. Create a bot via [@BotFather](https://t.me/BotFather) — get the token
2. Get your chat ID from [@userinfobot](https://t.me/userinfobot)
3. Run `agent-team init` or `agent-team reconfigure`

**Notifications sent:**

| Event | When |
|-------|------|
| Started | Task execution begins |
| Done | Task completed successfully |
| Failed | Task failed after all retries |
| Review | Human review requested |

Notifications are fire-and-forget — network errors are logged
but never block task execution.

## How It Works

### Quality Gates

Every task must pass three mandatory quality gates before it can be marked as done.
No agent may report `DONE` or `verdict: PASS` while any gate is failing.

| Gate | What it checks |
|------|----------------|
| **Tests** | All tests pass, coverage thresholds met |
| **Lint** | Zero lint errors |
| **Build** | Compiles without errors |

Gate enforcement by role:

- **Developer** discovers project rules (lint config, test config, coding guidelines)
  at task start, runs lint and fixes errors before requesting review
- **Reviewer** runs the linter as part of review; lint errors are Critical findings
- **QA** runs all three gates; any failure = `verdict: FAIL`;
  iterates with developer until all gates pass
- **Team Lead** independently verifies all three gates before accepting DONE

Agents discover tooling dynamically — no hardcoded tool names.
The PROTOCOL's "Project Rules Discovery" procedure detects
the package manager, lint/test/build commands, and coding guidelines
from project files.

### Model Resolution

Each agent has a `model:` field in its frontmatter (e.g., `claude-opus`, `claude-sonnet`).

- **Team-lead** model is read from frontmatter and passed to `claude --model`
- **Subagents** (architect, developer, qa) use their own model from frontmatter when spawned via Teammate
- Override with `--model` flag: `agent-team run --all --model sonnet`

### Memory

`.claude-loop/memory.md` is a structured knowledge base injected into every task prompt. It has four sections:

- **Patterns & Decisions** — architectural choices that must be remembered
- **Known Errors & Gotchas** — what broke and how it was fixed
- **Skills Index** — quick reference to skill files
- **Session Log** — table of completed tasks

After each completed task, the **librarian** agent runs automatically to curate memory:

1. Reads the task report from `.claude-loop/reports/`
2. Extracts decisions, errors, patterns, and gotchas
3. Updates the correct section in `memory.md`
4. Syncs agent-specific gotchas to `.claude/agents/skills/`

The librarian keeps `memory.md` under 300 lines, summarizing older entries into an archive section when needed.

### Logging & Audit

Every task produces:

- `.claude-loop/logs/task-{id}-{timestamp}.log` — session ID, model, result, usage, cost
- `.claude-loop/reports/task-{id}.md` — what was done, who did what, test results
- `.claude-loop/audit/audit.jsonl` — tool call audit trail (via hooks)

Plan failures are saved to `.claude-loop/logs/plan-error.log` with stderr and stdout.

**Audit trail** records every tool call with structured metadata:

```json
{"ts":"2026-04-10T14:53:44Z","role":"frontend-qa","agent":"Write tests for M365","tool":"Bash","phase":"PRE"}
```

Fields are auto-detected from Claude Code hook context:

- `tool` — tool name (Read, Write, Bash, Glob, Agent, etc.)
- `role` — agent profile or subagent type
- `agent` — agent name or task description

## Agent Teams

### Software Development

| Agent | Model | Role |
|-------|-------|------|
| `sw-team-lead` | opus | Orchestrates agents, never writes code |
| `sw-architect` | opus | Designs solution, writes SPEC.md, reviews implementation |
| `sw-developer` | sonnet | Implements code per spec, provides evidence |
| `sw-reviewer` | opus | Reviews style, security, best practices |
| `sw-qa` | sonnet | Writes tests, finds bugs, verifies fixes |

### Frontend

| Agent | Model | Role |
|-------|-------|------|
| `fe-team-lead` | opus | Orchestrates UI pipeline |
| `fe-architect` | sonnet | Component hierarchy, design tokens, state management |
| `fe-dev` | sonnet | Implements UI components per spec |
| `fe-reviewer` | sonnet | Visual review, WCAG 2.1 AA accessibility |
| `fe-aqa` | sonnet | E2E tests, visual regression, performance |

### Fullstack

| Agent | Model | Role |
|-------|-------|------|
| `fs-team-lead` | opus | Routes tasks to fe-dev or be-dev based on scope |
| `fs-architect` | sonnet | Designs UI + API contracts + DB schema |
| `fe-dev` | sonnet | Implements UI components, consumes APIs |
| `be-dev` | sonnet | Implements APIs, services, DB, migrations |
| `fs-reviewer` | sonnet | Reviews both frontend and backend code |
| `fs-aqa` | sonnet | E2E, visual regression, API integration tests |

The team-lead classifies each task as **frontend**, **backend**, or **fullstack** before routing:

- Frontend signals: `*.tsx`, `*.css`, components, views, design tokens
- Backend signals: `*.controller.*`, `*.service.*`, routes, models, migrations
- Fullstack: features spanning both stacks (e.g., "add user settings page")

For fullstack tasks, the architect defines an **API contract** in SPEC.md.
be-dev implements the API first, then fe-dev consumes it.
If the contract changes, be-dev notifies fe-dev via `API_ISSUE` message.

### Localization

| Agent | Model | Role |
|-------|-------|------|
| `loc-team-lead` | opus | Orchestrates writing, translations, SEO, QA |
| `loc-tech-writer` | sonnet | Writes English source docs |
| `loc-localizer` | sonnet | Translates into target language |
| `loc-seo-specialist` | sonnet | Optimizes for search |
| `loc-qa` | sonnet | Reviews source, translations, SEO |

## Human Review

Agents can request human review by outputting `TASK_STATUS: HUMAN_REVIEW_NEEDED`.

1. Audio notification plays (+ Telegram notification if configured)
2. Visual banner appears with task details
3. User approves (`y`) or rejects (`n`)

Reduce review prompts with `--no-human-review` (sets `defaultMode: auto` for all profiles).

## Security Permissions

Blocked by default via `permissions.deny`:

| Category | Blocked |
|----------|---------|
| File deletion | `rm -rf`, `shred`, `find -delete` |
| Environment | `printenv`, `env` |
| Git destructive | `git push --force`, `git reset --hard`, `git clean -f` |
| Disk operations | `mkfs`, `fdisk`, `parted` |

## Obsidian Vault Sync

Export agent definitions into an [Obsidian](https://obsidian.md) vault
with interlinked notes and [Dataview](https://github.com/blacksmithgu/obsidian-dataview) metadata.

```bash
# Interactive (prompts for paths)
agent-team sync-vault

# Non-interactive (flags skip prompts)
agent-team sync-vault --agents ./agents --vault ~/my-vault/agent-team
```

Generated vault structure:

```text
vault/
├── index.md                          # Dataview index of all agents
└── agents/
    ├── software development/
    │   ├── sw-team-lead.md
    │   ├── sw-architect.md
    │   └── ...
    ├── frontend/
    │   └── ...
    └── localization/
        └── ...
```

Each note includes frontmatter (name, model, tools, tags), team member `[[wikilinks]]`, and skill references — ready for Obsidian graph view.

## Creating Custom Teams

```bash
# Interactive (recommended)
agent-team new-team

# Non-interactive
agent-team new-team \
  --name "security-audit" \
  --description "Security and vulnerability assessment team" \
  --roles "auditor,pentester,reviewer"
```

Creates agents in `.claude/agents/` with a PROTOCOL.md and profiles for each role.

## Requirements

> **Platform:** macOS (Apple Silicon & Intel) and Linux (x64 & arm64). Windows support is planned.

| Tool | Required | Install |
|------|----------|---------|
| macOS or Linux | **yes** | macOS arm64/x64, Linux x64/arm64 |
| Claude Code | **yes** | `npm i -g @anthropic-ai/claude-code` |
| Claude Agent SDK | bundled | Included in dependencies (`@anthropic-ai/claude-agent-sdk`) |
| Bun / npm | no | [bun.sh](https://bun.sh) (for dev tooling) |
| OpenSpec | no | `brew install openspec` or `npm i -g @fission-ai/openspec` (if `--planner openspec`) |

## License

This project is licensed under the terms of the [LICENSE](LICENSE) file.
