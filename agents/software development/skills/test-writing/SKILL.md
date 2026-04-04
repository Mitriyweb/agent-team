---
name: test-writing
description: Write and execute tests to verify the implementation.
compatibility: Requires bash, Claude Code
metadata:
  team: software-development
  role: qa
  version: "1.0"
---

## Procedure

1. Receive the implementation from the developer.
2. Write appropriate tests to verify the changes.
3. Run the full test suite (detect from package.json: `npm test`, `bun test`, etc.).
4. Report failures back to the developer with detailed logs.
5. Iterate until all tests pass and the implementation is green.

## Gotchas

- Tests must not require an API key or Docker unless explicitly specified.

## Validation loop

The QA role ensures that all tests are passing and that no regressions are found in the existing test suite.
