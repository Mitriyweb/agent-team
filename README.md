# Claude Code Agent Team

Autonomous development team powered by Claude Code.
Drop this into any project, add your API key, and let the agents work through your roadmap.

**Software Development**

```
team-lead ──► architect ◄──► developer ◄──► qa
                                  │             └──► aqa
                              reviewer
```

**Localization**

```
team-lead ──► tech-writer ◄──► localizer(s) ◄──► qa
                  ▲                               │
                  └────── seo-specialist ◄─────────┘
```

**Frontend**

```
team-lead ──► fe-architect ◄──► fe-dev ◄──► fe-qa
                                  │       └──► fe-aqa
                          fe-reviewer
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
# Link binary
ln -sf $(pwd)/dist/agent-team ~/.local/bin/agent-team
```

> Make sure `~/.local/bin` is in your `PATH`.

## Quickstart

Initialize a project with a specific agent team:

```bash
# Initialize with the frontend team
agent-team init --team frontend

# Initialize with the software development team
agent-team init --team "software development"

# Initialize without human review checkpoints
agent-team init --team frontend --no-human-review

# Initialize with OpenSpec planner (default: builtin)
agent-team init --team "software development" --planner openspec
```

This will:

- Copy agent definitions to `agents/<team>/`
- Create a template `ROADMAP.md` and `MEMORY.md`
- Update `.gitignore` with agent-team artifacts
- Configure `autoMode` in `.claude/settings.json` (with `--no-human-review`)
- Save project config to `agent-team.json`
- If `--planner openspec`: initialize OpenSpec in the project

> **Tip:** If `--no-human-review` is used, Claude's `autoMode` will be enabled by default for the project.

Then run:

```bash
agent-team run          # execute one task (highest priority)
agent-team run --all    # execute all tasks in sequence
agent-team run --dry-run  # preview without running
```

## Planning

The agent team supports two planners, configured during `init` via `--planner`:

### Built-in planner (default)

The autonomous work of the agent team is driven by the `ROADMAP.md` file located in the root of your project.

1. **Define Tasks**: Create a `ROADMAP.md` and add tasks using markdown checklists (`- [ ]`).
2. **Orchestration**: The `team-lead` agent parses the roadmap, selects the highest priority
   pending task, decomposes it into subtasks, and assigns them to the appropriate agents.
3. **Dependencies**: You can specify dependencies (`depends:001`) to ensure tasks are executed in strict order.

   ```markdown
   - [ ] id:001 priority:high type:feature agents:architect,developer Implement login API
   ```

4. **Reference**: For a complete reference on task fields and statuses, see [docs/task-format.md](docs/task-format.md).

### OpenSpec planner

[OpenSpec](https://github.com/Fission-AI/OpenSpec) is a spec-driven development framework that separates planning from execution.

```bash
# Enable during init
agent-team init --team "software development" --planner openspec

# Plan creates an OpenSpec proposal instead of tasks/plan.md
agent-team plan
```

When using OpenSpec, `agent-team plan` creates a structured proposal in `openspec/changes/` with:

- `proposal.md` — what to build and why
- `design.md` — architectural decisions
- `tasks.md` — broken-down implementation tasks

Requires `@fission-ai/openspec` (`npm i -g @fission-ai/openspec`). The planner choice is stored in `agent-team.json`.

## Requirements

| Tool | Required | Install |
|------|----------|---------|
| Claude Code | **yes** | `npm i -g @anthropic-ai/claude-code` or [claude.ai/download](https://claude.ai/download) |
| API key | **yes** | Anthropic key or Azure APIM subscription key (see `.env.example`) |
| Docker | no | [docker.com](https://docker.com) *(for local model via Ollama)* |
| tmux | no | `brew install tmux` / `apt install tmux` *(for multi-agent view)* |
| Bun / npm | no | [bun.sh](https://bun.sh) *(only for dev tooling: biome, markdownlint, pre-commit hooks)* |
| OpenSpec | no | `npm i -g @fission-ai/openspec` *(only if `--planner openspec`)* |

## CLI Commands

```bash
agent-team init [--team NAME] [--planner builtin|openspec] [--no-human-review]
agent-team run [--all] [--dry-run] [--team NAME] [--budget N]
agent-team plan [ROADMAP.md]
agent-team new-team --name NAME --description DESC --roles ROLE1,ROLE2
agent-team validate NAME
agent-team -v, --version
```

## Repository Structure

```
.
├── agents/                     # Agent team definitions
│   ├── software development/   # Software dev team
│   ├── frontend/               # Frontend team (fe-*)
│   └── localization/           # Localization team
├── bin/
│   └── init.ts                 # CLI entry point
├── lib/
│   ├── assets.ts               # Asset extraction (review sound)
│   ├── common.ts               # Shared helpers, logging, provider config
│   ├── git.ts                  # Git branch, commit, push, PR helpers
│   ├── plan.ts                 # Roadmap planning / decomposition
│   ├── run.ts                  # Main autonomous task runner loop
│   ├── team.ts                 # Team management (init, create, validate)
│   ├── ui.ts                   # Terminal UI / progress bar
│   └── templates/              # Templates for new teams
├── tests/lib/                  # Unit tests (Bun test runner)
├── .github/workflows/
│   ├── lint.yml                # CI — lint, check, typecheck, test, build
│   └── release.yml             # Release — build binary on tag push
├── package.json
├── biome.json
├── tsconfig.json
├── .pre-commit-config.yaml
├── install.sh                  # Standalone installer
├── README.md
└── LICENSE
```

## Agent Teams

### Software Development

| Agent | Model | Responsibility |
|-------|-------|----------------|
| `team-lead` | claude-opus | Decomposes tasks, orchestrates agents, writes final summary |
| `architect` | claude-sonnet | Designs solution, reviews implementation, approves before QA |
| `developer` | claude-sonnet | Writes code per spec, iterates on architect + QA feedback |
| `reviewer` | claude-sonnet | Reviews style, security, best practices (parallel with QA) |
| `qa` | claude-sonnet | Manual verification of acceptance criteria |
| `aqa` | claude-sonnet | Automated E2E, integration, and performance testing |

### Localization

| Agent | Model | Responsibility |
|-------|-------|----------------|
| `team-lead` | claude-opus | Orchestrates writing, translations, SEO, and QA |
| `tech-writer` | claude-sonnet | Writes English source docs, reviews localizations and SEO changes |
| `localizer` | claude-sonnet | Translates into one target language, iterates on tech-writer feedback |
| `seo-specialist` | claude-sonnet | Optimizes source and all translations for search (metadata, keywords, structure) |
| `qa` | claude-sonnet | Reviews source docs, translations, and SEO changes, reports issues to responsible agent |

### Frontend

| Agent | Model | Responsibility |
|-------|-------|----------------|
| `team-lead` | claude-opus | Orchestrates UI pipeline, decomposes frontend tasks, synthesizes results |
| `fe-architect` | claude-sonnet | Defines component hierarchy, design tokens, and state management strategy |
| `fe-dev` | claude-sonnet | Implements UI components and views per spec. Framework and styling aware |
| `fe-reviewer` | claude-sonnet | Performs visual review for pixel-perfection and WCAG 2.1 AA accessibility |
| `fe-qa` | claude-sonnet | Manual UI/UX testing and accessibility verification |
| `fe-aqa` | claude-sonnet | Automated E2E tests, visual regression, and performance monitoring |

## Running Modes

### Cloud only (default)

Set `PROVIDER` in `.env` (see `.env.example`):

| Provider | `PROVIDER=` | Keys in `.env` |
|----------|-------------|----------------|
| Anthropic (direct) | `anthropic` | `ANTHROPIC_API_KEY` |
| Azure APIM | `azure-apim` | `AZURE_APIM_ENDPOINT` + `AZURE_APIM_KEY` |
| LiteLLM proxy | `litellm` | `LITELLM_HOST` |

```bash
agent-team run --all
```

### Local model only

Uses Ollama with qwen3-coder:30b. No API costs.

```bash
docker compose -f config/docker-compose.yml up -d
```

### Hybrid (recommended)

team-lead + architect on cloud, developer + qa on local model.
Routes through LiteLLM proxy.

```bash
docker compose -f config/docker-compose.yml up -d
```

## Logs and Reports

Every task execution produces:

```
.claude-loop/
├── logs/task-001.log          # Full Claude Code output
├── reports/task-001.md        # What was done, files changed, decisions made
└── sessions/task-001.session  # Session ID for resuming
```

## Human Review and Notifications

During task execution, any agent can request a human review by outputting `TASK_STATUS: HUMAN_REVIEW_NEEDED` as the last line.
When this happens:

1. **Audio Notification**: A review sound plays (custom `review.m4a` or fallback to `say`/`spd-say`/terminal bell).
2. **Visual Banner**: A high-visibility banner appears with the task number and description.
3. **Approval Prompt**: The user is asked to approve (`y`) or reject (`n`).

Agents request a review when:

- A critical decision needs human approval
- Requirements are ambiguous and cannot be resolved by the team
- A destructive or irreversible operation requires a safety check
- The task specification explicitly requests a review checkpoint

You can reduce review prompts by initializing with `--no-human-review`, which enables `autoMode`.

## Security Permissions

The following destructive operations are blocked by default via `permissions.deny`:

| Category | Blocked commands |
|----------|-----------------|
| File deletion | `rm -rf`, `shred`, `find -delete` |
| Environment | `os.environ`, `os.getenv`, `process.env`, `printenv`, `env` |
| Git destructive | `git push --force`, `git reset --hard`, `git clean -f` |
| Disk operations | `mkfs`, `fdisk`, `parted` |

To allow a specific command, remove its entry from `permissions.deny` in `claude/settings.json`.

## Creating Custom Teams

```bash
agent-team new-team \
  --name "security-audit" \
  --description "Security and vulnerability assessment team" \
  --roles "auditor,pentester,reviewer"
```

This creates `agents/security-audit/` with a PROTOCOL.md and agent profiles for each role.

## License

This project is licensed under the terms of the [LICENSE](LICENSE) file included in the root directory.
