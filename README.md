# Claude Code Agent Team

Autonomous development team powered by Claude Code.
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
npx @mitriyweb/agent-team init --team frontend
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
# Initialize with a team
agent-team init --team "software development"
agent-team init --team frontend
agent-team init --team localization

# Without human review checkpoints (auto mode)
agent-team init --team frontend --no-human-review

# With OpenSpec planner
agent-team init --team "software development" --planner openspec

# Import rules from another tool
agent-team import .windsurf
agent-team import .cursor
agent-team import .github
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
agent-team run --all     # execute all tasks in sequence
agent-team run           # execute one task (highest priority)
agent-team run --dry-run # preview without running
```

## CLI Commands

```text
Setup:
  agent-team init [--team NAME] [--planner builtin|openspec] [--no-human-review]
  agent-team update                                    Update project configs
  agent-team reconfigure                               Update skills & workflows
  agent-team import <path>                             Import rules from .windsurf, .cursor, .github

Execution:
  agent-team run [--all] [--plan] [--dry-run]          Execute tasks
                 [--team NAME] [--model MODEL]
                 [--budget N] [--resume ID] [--branch]
  agent-team plan [FILE] [--model MODEL]               Decompose roadmap into tasks

Teams:
  agent-team new-team --name NAME --description DESC --roles ROLE1,ROLE2
  agent-team validate NAME                             Validate team structure

Monitoring:
  agent-team audit                                     Show audit report

  agent-team -v, --version                             Show version
  agent-team -h, --help                                Show this help
```

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

[OpenSpec](https://github.com/Fission-AI/OpenSpec) separates planning from execution.

```bash
agent-team init --team "software development" --planner openspec
agent-team plan
```

Creates a structured proposal in `openspec/changes/` with `proposal.md`, `design.md`, `tasks.md`.
Tasks are automatically converted to agent-team format in `tasks/plan.md`.

Requires `@fission-ai/openspec` (`npm i -g @fission-ai/openspec`).

## Project Structure After Init

```text
your-project/
├── CLAUDE.md                    # Project instructions (with agent-team managed block)
├── .claude-loop/
│   ├── memory.md                # Structured knowledge base (curated by librarian)
│   ├── logs/                    # Task execution logs
│   ├── reports/                 # Task reports and cost summary
│   └── audit/                   # Tool call audit trail
├── ROADMAP.md                   # Task descriptions (builtin planner)
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
└── tasks/
    └── plan.md                  # Decomposed task plan
```

## Importing Rules

Import rules and workflows from other AI coding tools:

```bash
agent-team import .windsurf     # Windsurf rules (rules/*.md + .windsurfrules)
agent-team import .cursor       # Cursor rules (rules/*.mdc + .cursorrules)
agent-team import .github       # GitHub Copilot (copilot-instructions.md)
agent-team import .claude       # Another Claude project (CLAUDE.md + rules/)
agent-team import /path/to/project  # Auto-detect from project root
```

Always-on rules are added to `CLAUDE.md`. Glob/manual rules go to `.claude/rules/`.

## How It Works

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

### Logging

Every task produces:

- `.claude-loop/logs/task-{id}-{timestamp}.log` — session ID, model, result, usage, cost
- `.claude-loop/reports/task-{id}.md` — what was done, who did what, test results
- `.claude-loop/audit/audit.jsonl` — tool call audit trail (via hooks)

Plan failures are saved to `.claude-loop/logs/plan-error.log` with stderr and stdout.

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

1. Audio notification plays
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

## Creating Custom Teams

```bash
agent-team new-team \
  --name "security-audit" \
  --description "Security and vulnerability assessment team" \
  --roles "auditor,pentester,reviewer"
```

Creates agents in `.claude/agents/` with a PROTOCOL.md and profiles for each role.

## Requirements

| Tool | Required | Install |
|------|----------|---------|
| Claude Code | **yes** | `npm i -g @anthropic-ai/claude-code` |
| Bun / npm | no | [bun.sh](https://bun.sh) (for dev tooling) |
| OpenSpec | no | `npm i -g @fission-ai/openspec` (if `--planner openspec`) |

## License

This project is licensed under the terms of the [LICENSE](LICENSE) file.
