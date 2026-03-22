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
3. Run the full test suite using `scripts/run_tests.sh`.
4. Report failures back to the developer with detailed logs.
5. Iterate until all tests pass and the implementation is green.

## Gotchas

- Bats tests in `tests/scripts/` must not require an API key or Docker.

## Validation loop

The QA role ensures that all tests are passing and that no regressions are found in the existing test suite.
