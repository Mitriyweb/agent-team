---
description: Review code changes and create a commit following project standards
---

# Review & Commit Workflow

Review changed code for quality and compliance, then commit if all checks pass.

**References:** `CLAUDE.md` (workflow rules), `MEMORY.md` (cross-session decisions)

## Phase 0: Detect Changes

```bash
git status
git diff --name-only
git diff --stat
```

1. Identify all changed files (`.md`, `.js`, `.sh`, `.bats`, `.yaml`)
2. Read full content of each changed file
3. Categorize by type and apply matching rules:
   - `.md` files -> markdownlint-cli2 rules

   - `.js` files -> Biome lint + format

   - `.sh` / `.bats` files -> shell correctness, proper shebang (`#!/usr/bin/env bash`)

   - Agent definitions (`.md` in `agents/`) -> valid YAML frontmatter, H1 title, `## Instructions` section

   - All files -> no hardcoded secrets or credentials

## Phase 1: Code Review

For each changed file, check for violations and categorize:

- **Critical** - must fix before commit (broken syntax, secrets, missing required sections)

- **High** - should fix before commit (lint errors, missing shebang, bad frontmatter)

- **Medium** - nice to fix (style, naming)

If critical/high issues found -> fix them before proceeding.

### Run Validation Pipeline

```bash
bun run validate
bun run build
```

This runs the full chain: `markdownlint-cli2` -> `biome check` -> `bats tests` -> build.

All must pass before proceeding.

## Phase 2: Prepare Commit Message

**Format** (conventional commits, matching repo history):

```text
type: brief description

Optional body with details

- Bullet point 1

- Bullet point 2

```

**Types:** `feat`, `fix`, `refactor`, `test`, `docs`, `style`, `chore`, `perf`

**Rules:**

- Subject line: lowercase `type:` prefix, max 72 chars

- No period at the end of subject line

- Body wrapped at 72 chars (optional, for complex changes)

## Phase 3: Stage & Commit

```bash
git add [specific-files]
git status
git diff --cached
```

Verify:

- All intended files are staged

- No accidental files included (`node_modules/`, `dist/`, `trace.log`, `.env`)

### Create Commit

```bash
git commit -m "type: description"
```

**NEVER** use `--no-verify` or `-n` — pre-commit hooks MUST run.

### Handle Hook Failures

Pre-commit hooks run: `lint:fix` -> `check:fix` -> `audit` -> `validate` -> `build`.

If hooks fail:

1. Read the error output
2. Fix the issue:
   - Markdown errors: `bun run lint:fix`

   - Biome errors: `bun run check:fix`

   - Test failures: fix the test or code, then `bun run test`

3. Stage fixed files: `git add [fixed-files]`
4. Create a **new** commit (never `--amend` unless explicitly asked)

### Verify Commit

```bash
git log --oneline -n 1
git diff HEAD~1 --stat
```

Confirm the commit message and changed files match intent.

## Review Summary

After commit, output:

```text
Commit: [hash] [message]
Files: [count] | LOC: [additions+deletions]
Checks: lint [pass/fail] | biome [pass/fail] | tests [pass/fail] | build [pass/fail]
Issues: [count critical] / [count high] / [count medium]
```

## Key Rules

1. **Never `--no-verify`** — pre-commit hooks must run
2. **All checks pass** before commit (`bun run validate && bun run build`)
3. **Use `bun run`** — never `npm run`
4. **Conventional commits** — `type: description` format
5. **New commits only** — never amend unless user explicitly requests it
