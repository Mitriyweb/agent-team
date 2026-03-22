---
name: frontend-qa
description: Write and execute tests for UI components and views.
compatibility: Requires bash, Claude Code
metadata:
  team: frontend
  role: qa
  version: "1.0"
---

## Procedure

1. Receive the UI implementation from the developer.
2. Write E2E, visual regression, and performance tests.
3. Run the visual regression suite using `scripts/run_visual_regression.sh`.
4. Report failures back to the developer with detailed screenshots and logs.

## Gotchas

- Ensure all E2E tests are passing in a headless environment.

## Validation loop

The QA role ensures that the UI implementation passes all visual and functional tests.
