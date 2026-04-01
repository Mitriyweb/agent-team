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

## `max_files`

Optional field to enforce task size limits.

```
max_files:5
```

If a task is expected to touch more files than this limit, `run.sh` will warn or split the task (depending on configuration).

---

## Task Sizing

To prevent context-window overflow and ensure high-quality output, tasks should be well-scoped.

### Sizing Limits

| Limit | Action |
|-------|--------|
| **Description** | `run.sh` warns if description > 500 words |
| **Scope** | `run.sh` warns if no `agents:` are specified |
| **Output** | QA agent output is capped at 4096 tokens via `--max-output-tokens` |

### Splitting Over-scoped Tasks

If a task is too broad, split it into smaller, manageable sub-tasks.

**Over-scoped Task:**

- `[ ] id:001 type:feature agents:architect,developer Implement full e-commerce backend including products, cart, checkout, and admin dashboard.`

**Well-scoped Tasks:**

- `[ ] id:001 type:feature agents:architect,developer Implement product catalog API and storage`

- `[ ] id:002 depends:001 type:feature agents:architect,developer Implement shopping cart logic and persistent storage`

- `[ ] id:003 depends:002 type:feature agents:architect,developer Implement checkout workflow and payment integration`

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
