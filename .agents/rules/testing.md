# Testing Rules

## Test location

- Tests live under `tests/lib/` mirroring source structure
- `lib/plan.ts` is tested by `tests/lib/plan.test.ts`

## Single assertion per test

Each `it()` block should contain one logical assertion.

```typescript
// Wrong
it('handles tasks', () => {
  expect(getTask('1')).toBeDefined();
  expect(getTask('1').status).toBe('pending');
  expect(getTask('999')).toBeUndefined();
});

// Correct
it('returns task by id', () => {
  expect(getTask('1')).toBeDefined();
});

it('returns undefined for unknown id', () => {
  expect(getTask('999')).toBeUndefined();
});
```

## No skipped tests

NEVER use `it.skip` or `describe.skip`. Use `it.todo('description')` instead.

## Test runner

Use `bun test`. Tests use `bun:test` imports (`describe`, `it`, `expect`, `mock`, `spyOn`).

## Mocking

- Mock external processes (`Bun.spawn`, `Bun.spawnSync`)
- Mock interactive prompts (`@clack/prompts`)
- Restore mocks in `afterEach` with `mock.restore()`

## Validation pipeline

`bun run validate` runs: lint -> check -> typecheck -> knip -> test. All must pass.
