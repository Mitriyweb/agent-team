# Using Scripts in Roles

How to add executable scripts to agent roles.

## Structure

```
agents/<team>/
├── scripts/           ← Team-level scripts
│   ├── lint.sh
│   └── validate-spec.sh
├── PROTOCOL.md
├── architect.md       ← References scripts in frontmatter + body
├── developer.md
└── ...
```

## Adding Scripts to a Role

### 1. Frontmatter

Add a `scripts` field listing available scripts and one-off commands:

```yaml
---
name: developer
description: ...
model: claude-sonnet-4-5
tools: Read, Write, Edit, Bash, Glob, Grep, Teammate
scripts:
  - name: lint
    run: bash scripts/lint.sh
    description: Run project linters
  - name: format
    run: bunx @biomejs/biome check --write .
    description: Auto-format code with Biome
---
```

### 2. Body section

Add an **Available Scripts** section at the end of the role file:

```markdown
## Available Scripts

- **`scripts/lint.sh`** — Run project linters
- **`scripts/lint.sh --fix`** — Auto-fix lint errors

### One-off commands

- `bunx @biomejs/biome check --write .` — Auto-format with Biome

Run any script with `--help` for full usage details.
```

### 3. Workflow integration

Reference scripts in the role's workflow steps:

```markdown
### Step 3 — Validate the spec

\```bash
bash scripts/validate-spec.sh SPEC.md
\```
```

---

## Writing Scripts for Agents

Follow [agentskills.io best practices](https://agentskills.io/skill-creation/using-scripts):

| Principle | Why |
|-----------|-----|
| No interactive prompts | Agents can't type input — use flags instead |
| `--help` documentation | Agents need to discover usage |
| Structured output | JSON or clear text — avoid alignment-based tables |
| Meaningful exit codes | `0` success, `1` error, `2` invalid args |
| Idempotent | Safe to re-run without side effects |
| Safe defaults | Destructive ops require `--force` or `--confirm` |

### Template

```bash
#!/bin/bash
# ─────────────────────────────────────────────────────
#  script-name.sh — One-line description
#
#  Usage:
#    bash scripts/script-name.sh [OPTIONS] [ARGS]
#    bash scripts/script-name.sh --help
#
#  Exit codes:
#    0  Success
#    1  Error
#    2  Invalid arguments
# ─────────────────────────────────────────────────────

set -euo pipefail

for arg in "$@"; do
  case "$arg" in
    --help|-h)
      awk '/^# ─/{if(n++)exit} n{sub(/^# ?/,"");print}' "$0"
      exit 0
      ;;
  esac
done

# ... script logic ...
```

### One-off Commands

For simple tool invocations, use package runners instead of scripts:

| Runner | When |
|--------|------|
| `bunx` | Bun-based projects |
| `npx` | Node.js projects |
| `uvx` | Python projects (via uv) |
| `deno run` | Deno projects |
| `go run` | Go projects |

Pin versions for reproducibility: `bunx @biomejs/biome@1.9.4 check .`

---

## Available Scripts

### Software Development Team

| Command | Description |
|---------|-------------|
| `bun run lint` | Run markdownlint |
| `bun run check` | Run Biome linter and formatter |
| `bun run validate` | Run lint, check, typecheck, and tests |
| `bun run fix` | Auto-fix lint and format errors |
