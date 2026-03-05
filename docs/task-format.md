# Task Format Reference

Full reference for all fields in `ROADMAP.md`.

## Format

```
- [ ] id:NNN priority:LEVEL type:TYPE depends:NNN,NNN agents:AGENT,AGENT  Description
```

---

## `id`

Unique task identifier. Three digits, zero-padded.

```
id:001  id:042  id:100
```

Used in:

- `depends` references from other tasks
- Log filenames: `.claude-loop/logs/task-001.log`
- Report filenames: `.claude-loop/reports/task-001.md`

---

## `priority`

Determines the order tasks are picked from the queue.

| Value | Behavior |
|-------|----------|
| `high` | Picked first. Blocks release if not done. |
| `medium` | Picked after all `high` tasks. |
| `low` | Picked last. Nice to have. |

---

## `type`

Tells agents which workflow to apply.

| Value | Workflow |
|-------|----------|
| `feature` | `architect` designs → `developer` implements → reviewed and tested |
| `fix` | `developer` localizes and fixes → `qa` reproduces and verifies |
| `refactor` | `architect` reviews before and after → `developer` restructures |
| `test` | `qa` writes tests → `developer` fixes failures |
| `docs` | Generated from code by `developer` or `qa` |
| `chore` | Infrastructure / deps / config. `developer` runs without formal review. |

---

## `depends`

Comma-separated list of task IDs that must be in `done` status before this task is picked.

```
depends:001
depends:001,003
```

The loop will skip this task and move to the next eligible one until all dependencies are satisfied.

---

## `agents`

Which agents participate, listed in execution order.
If omitted, `team-lead` decides based on `type`.

| Combination | When to use |
|-------------|-------------|
| `developer` | Small fix or chore — no review needed |
| `architect,developer` | Feature without mandatory tests |
| `architect,developer,qa` | Feature with tests |
| `architect,developer,reviewer,qa` | Full cycle for critical or security-sensitive code |
| `qa` | Tests only — code is already written |
| `developer,qa` | Fix: repair and verify with tests |
| `architect,developer,reviewer` | Refactor with review, no new tests |

**Available agents:** `team-lead` · `architect` · `developer` · `reviewer` · `qa`

---

## Description

Write **what** to achieve, not **how** to implement it.
Include: endpoints, file paths, expected behavior, edge cases.

```diff
- Use jsonwebtoken library to generate tokens
+ POST /auth/login returns { access_token, refresh_token }
+ POST /auth/refresh accepts refresh_token and returns a new pair
+ authGuard middleware rejects requests without a valid access_token
```

---

## Task Statuses

| Symbol | Meaning |
|--------|---------|
| `- [ ]` | Pending |
| `- [~]` | In progress |
| `- [x]` | Done |
| `- [!]` | Failed |
