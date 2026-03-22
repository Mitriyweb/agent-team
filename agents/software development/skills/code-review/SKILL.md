---
name: code-review
description: Review the implementation for style, security, and best practices.
compatibility: Requires bash, Claude Code
metadata:
  team: software-development
  role: reviewer
  version: "1.0"
---

## Procedure

1. Receive the pull request or implementation from the developer.
2. Check for style, security, and adherence to best practices.
3. Report findings back to the developer with line references.
4. Iterate until all issues are addressed and the code meets project standards.

## Gotchas

- Refer to `references/checklist.md` for the security and style checklist.

## Validation loop

The reviewer ensures that all flagged issues have been resolved and that no regressions have been introduced during the review cycle.
