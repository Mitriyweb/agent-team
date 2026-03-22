---
name: architecture-design
description: Design the technical solution for a given brief.
compatibility: Requires bash, Claude Code
metadata:
  team: software-development
  role: architect
  version: "1.0"
---

## Procedure

1. Receive the task brief from the team-lead.
2. Read the codebase context to understand the current architecture.
3. Produce a written specification (`SPEC.md`).
4. Wait for team-lead approval before handing the spec to the developer.

## Gotchas

- The scope is strictly the current team; cross-team decisions must go back to the team-lead, not be made unilaterally.
- Refer to `references/patterns.md` for common architecture patterns used in the project.

## Validation loop

The architect reviews the specification against the brief to ensure all requirements are addressed and constraints are met.
