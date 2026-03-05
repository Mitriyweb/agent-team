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

```bash
# 1. Clone into your project
git clone https://github.com/your-org/claude-agent-team .claude-team

# 2. Setup folders
mkdir -p .claude
cp -r .claude-team/claude/* .claude/
cp -r .claude-team/agents .claude/
cp -r .claude-team/scripts ./

# 3. Configure environment
echo "ANTHROPIC_API_KEY=your_key_here" > .env

# 4. Create ROADMAP.md with tasks, then run
touch ROADMAP.md
./scripts/run.sh          # execute one task (highest priority)
./scripts/run.sh --all    # execute all tasks in sequence
./scripts/run.sh --dry-run  # preview without running
```

## Requirements

| Tool | Version | Install |
|------|---------|---------|
| Bun | 1.0+ | [bun.sh](https://bun.sh) |
| Claude Code | latest | `bun install -g @anthropic-ai/claude-code` |
| Docker | 24+ | [docker.com](https://docker.com) *(optional, for local model)* |
| tmux | any | `apt install tmux` *(optional, for multi-agent view)* |

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
├── package.json                # Dev dependencies (biome, markdownlint-cli2, prek)
├── biome.json                  # Biome config (lint + format JSON)
├── .pre-commit-config.yaml     # Pre-commit hooks via prek
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
| `team-lead` | claude-opus-4-6 | Decomposes tasks, orchestrates agents, writes final summary |
| `architect` | claude-sonnet-4-6 | Designs solution, reviews implementation, approves before QA |
| `developer` | claude-sonnet-4-6 | Writes code per spec, iterates on architect + QA feedback |
| `reviewer` | claude-sonnet-4-6 | Reviews style, security, best practices (parallel with QA) |
| `qa` | claude-sonnet-4-6 | Writes tests, reports bugs directly to developer, iterates to green |

### Localization

| Agent | Model | Responsibility |
|-------|-------|----------------|
| `team-lead` | claude-opus-4-6 | Orchestrates writing, translations, SEO, and QA |
| `tech-writer` | claude-sonnet-4-6 | Writes English source docs, reviews localizations and SEO changes |
| `localizer` | claude-sonnet-4-6 | Translates into one target language, iterates on tech-writer feedback |
| `seo-specialist` | claude-sonnet-4-6 | Optimizes source and all translations for search (metadata, keywords, structure) |
| `qa` | claude-sonnet-4-6 | Reviews source docs, translations, and SEO changes, reports issues to responsible agent |

## Running Modes

### Cloud only (default)

Uses Anthropic API. Requires `ANTHROPIC_API_KEY`.

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
