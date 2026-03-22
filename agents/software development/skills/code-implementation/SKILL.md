---
name: code-implementation
description: Implement code changes according to a written specification.
compatibility: Requires bash, Claude Code
metadata:
  team: software-development
  role: developer
  version: "1.0"
---

## Procedure

1. Receive the written specification (`SPEC.md`) from the architect.
2. Implement the changes in the codebase.
3. Run `scripts/validate_code.sh` to ensure code quality.
4. Fix any errors identified during validation.
5. Pass the implementation to the reviewer and QA in parallel.

## Gotchas

- The "software development" directory has a space; quote all paths.
- `permissions.deny` blocks shell `env` and `printenv`, but not `os.environ` or `process.env`. Production code can read environment variables.
- Model prices are stored in `config/pricing.yaml`; never hardcode them.
- Refer to `references/gotchas.md` for more project-specific traps.

## Validation loop

The developer runs `scripts/validate_code.sh` and ensures all linting and basic checks pass before submission.
