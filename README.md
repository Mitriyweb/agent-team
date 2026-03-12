# Claude Code Agent Team

Autonomous development team powered by Claude Code.
Drop this into any project, add your API key, and let the agents work through your roadmap.

**Software Development**

```
team-lead ──► architect ◄──► developer ◄──► qa
                                  │
                              reviewer
```

**Localization**

```
team-lead ──► tech-writer ◄──► localizer(s) ◄──► qa
                  ▲                               │
                  └────── seo-specialist ◄─────────┘
```

## Quickstart

### Option 1: One-command installation (Recommended)

Drop the agent team into any existing project:

```bash
npx @mitriyweb/agent-team init
```

This will:

- Create `.claude/agents/` with all agent roles
- Create `scripts/claude-team/` with orchestration scripts
- Setup `.env` and `.claude/settings.json`
- Create a template `ROADMAP.md`

### Option 2: Manual clone

```bash
# 1. Clone into your project
git clone https://github.com/Mitriyweb/agent-team .claude-team

# 2. Setup (no bun needed)
cd .claude-team && ./scripts/setup.sh

# 3. Configure provider in .env (see .env.example)
cp .env.example .env
# Edit .env: set PROVIDER and your API key

# 4. Create ROADMAP.md with tasks, then run
touch ROADMAP.md
./scripts/run.sh          # execute one task (highest priority)
./scripts/run.sh --all    # execute all tasks in sequence
./scripts/run.sh --dry-run  # preview without running
```

## Planning

The autonomous work of the agent team is driven by the `ROADMAP.md` file located in the root of your project.

1. **Define Tasks**: Create a `ROADMAP.md` and add tasks using markdown checklists (`- [ ]`).
2. **Orchestration**: The `team-lead` agent parses the roadmap, selects the highest priority
   pending task, decomposes it into subtasks, and assigns them to the appropriate agents.
3. **Dependencies**: You can specify dependencies (`depends:001`) to ensure tasks are executed in strict order.

   ```markdown
   - [ ] id:001 priority:high type:feature agents:architect,developer Implement login API
   ```

4. **Reference**: For a complete reference on task fields and statuses, see [docs/task-format.md](docs/task-format.md).

## Requirements

| Tool | Required | Install |
|------|----------|---------|
| Claude Code | **yes** | `npm i -g @anthropic-ai/claude-code` or [claude.ai/download](https://claude.ai/download) |
| API key | **yes** | Anthropic key or Azure APIM subscription key (see `.env.example`) |
| Docker | no | [docker.com](https://docker.com) *(for local model via Ollama)* |
| tmux | no | `brew install tmux` / `apt install tmux` *(for multi-agent view)* |
| Bun / npm | no | [bun.sh](https://bun.sh) *(only for dev tooling: biome, markdownlint, pre-commit hooks)* |

## Repository Structure

```
.
├── agents/
│   ├── software development/   # Software dev team
│   │   ├── team-lead.md         # Orchestrator — decomposes tasks, coordinates team
│   │   ├── architect.md         # Designs system + reviews implementation
│   │   ├── developer.md         # Writes code, iterates on feedback
│   │   ├── reviewer.md          # Reviews style, security, best practices
│   │   ├── qa.md                # Writes tests, reports bugs directly to developer
│   │   └── PROTOCOL.md          # Inter-agent messaging protocol
│   └── localization/           # Docs & localization team
│       ├── team-lead.md         # Orchestrator — coordinates writing and translations
│       ├── tech-writer.md       # Writes English source docs, reviews translations and SEO
│       ├── localizer.md         # Translates into one assigned target language
│       ├── seo-specialist.md    # Optimizes source and translations for search
│       ├── qa.md                # Reviews source docs, translations, and SEO changes
│       └── PROTOCOL.md          # Inter-agent messaging protocol
├── claude/
│   └── settings.json       # Claude Code project settings
├── scripts/
│   ├── run.sh              # Main autonomous loop
│   ├── claude.sh           # Launch Claude Code with provider from .env
│   ├── agents.sh           # Launch agents manually (local / cloud / both)
│   ├── setup.sh            # One-time environment setup
│   └── _common.sh          # Shared helpers for scripts
├── config/
│   ├── docker-compose.yml  # Ollama + LiteLLM for local model support
│   ├── litellm.yaml        # Route requests between local and cloud models
│   └── scheduling/
│       ├── cron.example         # Cron schedule examples
│       └── claude-loop.service  # systemd unit file
├── docs/
│   ├── agents-software development.md  # How agent roles work
│   ├── routing.md                      # Local vs cloud model routing
│   └── task-format.md                  # Full ROADMAP.md field reference
├── package.json                # Optional dev dependencies (biome, markdownlint-cli2, prek)
├── biome.json                  # Biome config (lint + format JSON)
├── .pre-commit-config.yaml     # Pre-commit hooks via prek
├── .env.example                # Environment template
├── .github/
│   └── workflows/
│       └── lint.yml            # CI — markdownlint-cli2 on push and PR
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
| `qa` | claude-sonnet | Writes tests, reports bugs directly to developer, iterates to green |

### Localization

| Agent | Model | Responsibility |
|-------|-------|----------------|
| `team-lead` | claude-opus | Orchestrates writing, translations, SEO, and QA |
| `tech-writer` | claude-sonnet | Writes English source docs, reviews localizations and SEO changes |
| `localizer` | claude-sonnet | Translates into one target language, iterates on tech-writer feedback |
| `seo-specialist` | claude-sonnet | Optimizes source and all translations for search (metadata, keywords, structure) |
| `qa` | claude-sonnet | Reviews source docs, translations, and SEO changes, reports issues to responsible agent |

## Running Modes

### Cloud only (default)

Set `PROVIDER` in `.env` (see `.env.example`):

| Provider | `PROVIDER=` | Keys in `.env` |
|----------|-------------|----------------|
| Anthropic (direct) | `anthropic` | `ANTHROPIC_API_KEY` |
| Azure APIM | `azure-apim` | `AZURE_APIM_ENDPOINT` + `AZURE_APIM_KEY` |
| LiteLLM proxy | `litellm` | `LITELLM_HOST` |

```bash
./scripts/run.sh --all
```

### Local model only

Uses Ollama with qwen3-coder:30b. No API costs.

```bash
docker compose -f config/docker-compose.yml up -d
./scripts/agents.sh local
```

### Hybrid (recommended)

team-lead + architect on cloud, developer + qa on local model.

```bash
docker compose -f config/docker-compose.yml up -d
./scripts/agents.sh both
```

## Logs and Reports

Every task execution produces:

```
.claude-loop/
├── logs/task-001.log          # Full Claude Code output
├── reports/task-001.md        # What was done, files changed, decisions made
└── sessions/task-001.session  # Session ID for resuming
```

## Configuration

`claude/settings.json` is included in the repo and configures two things:

### Enabling Agent Teams

Agent Teams are experimental and off by default. The setting is already enabled:

```bash
# Per session (alternative)
export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1
```

### Security Permissions

The following destructive operations are blocked by default via `permissions.deny`:

| Category | Blocked commands |
|----------|-----------------|
| File deletion | `rm -rf`, `shred`, `find -delete` |
| Environment | `os.environ`, `os.getenv`, `process.env`, `printenv`, `env` |
| Git destructive | `git push --force`, `git reset --hard`, `git clean -f` |
| Disk operations | `mkfs`, `fdisk`, `parted` |

To allow a specific command, remove its entry from `permissions.deny` in `claude/settings.json`.

## License

This project is licensed under the terms of the [LICENSE](LICENSE) file included in the root directory.
