---
name: component-development
description: Implement UI components and views according to specification.
compatibility: Requires bash, Claude Code
metadata:
  team: frontend
  role: frontend-dev
  version: "1.0"
---

## Procedure

1. Receive the written specification from the ui-architect.
2. Implement the UI components and views using the project's framework.
3. Run `scripts/validate_a11y.sh` to check for accessibility issues.
4. Iterate on feedback from the design-reviewer and QA.

## Gotchas

- Refer to `references/gotchas.md` for project-specific UI traps.
- Ensure all components are accessible (WCAG 2.1 AA baseline).

## Validation loop

The frontend-dev runs accessibility checks and ensures the component meets the spec before passing to the reviewer.
