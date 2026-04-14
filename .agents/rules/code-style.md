# Code Style Rules

## Language

ALL documentation, comments, commit messages, and PR descriptions MUST be in English.

## Formatting

- Biome handles formatting: 2-space indent, 80 char line width
- Run `bun run check:fix` to auto-format

## Commit size

Maximum 4000 LOC per commit. Check with `git diff --cached --shortstat`.
Split large changes into focused commits.

## Commit messages

Use conventional commits: `feat:`, `fix:`, `test:`, `refactor:`, `docs:`, `chore:`.

## No dead code

- No unused variables (biome `noUnusedVariables: error`)
- No unused exports (knip)
- No commented-out code
- Remove, don't comment

## Imports

- Use `.ts` extensions in imports (Bun requirement)
- Group: node builtins, external deps, internal modules
- Biome organizes imports automatically
