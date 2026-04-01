## Purpose

Ensuring high code coverage and deterministic tests for all code changes.

## When to Apply

Apply during the fresh verification phase by QA or any developer-led testing.

## Steps

1. Detect project test runner and dependencies (e.g., jest, pytest).
2. Write unit tests for all business logic and edge cases in the spec.
3. Use mocks or stubs for all external dependencies (DB, APIs).
4. Run tests and verify coverage (target: 80% minimum).
5. Document all failing tests in PROBLEMS.md and VERDICT.json.

## Output Format

- Clean, maintainable test files.

- VERDICT.json and QA_REPORT.md for every task.
