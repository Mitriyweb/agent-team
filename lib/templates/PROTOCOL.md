# Agent Communication Protocol

All agents must use this protocol for inter-agent messaging.

## Execution Flow

```
ROADMAP.md → agetn-team plan (team-lead creates tasks/plan.md)
                         ↓
tasks/plan.md → agetn-team run (executes tasks one by one)
                         ↓
           {{TEAM_PREFIX}}team-lead → {{TEAM_PREFIX}}agents (per task spec)
```

1. **Planning**: `agetn-team plan` runs team-lead to decompose ROADMAP.md into `tasks/plan.md`
2. **Execution**: `agetn-team run` picks tasks from `tasks/plan.md` by priority and dependencies
3. **Coordination**: team-lead spawns agents per task spec, coordinates via protocol below

## Message Format

```javascript
Teammate({
  operation: "write",
  target_agent_id: "<agent-name>",
  message: JSON.stringify({
    from: "<my-name>",
    type: "<type>",
    subject: "<subject>",
    body: "<text>",
    files: ["<changed-files>"],       // optional
    requires_response: true | false
  })
})
```

## Message Types

| Type | When to use |
|------|-------------|
| `READY` | Agent is ready and waiting for a task |
| `QUESTION` | Need clarification before continuing |
| `ANSWER` | Response to a `QUESTION` |
| `REVIEW_REQUEST` | Asking architect or reviewer to check work |
| `REVIEW_FEEDBACK` | Review result with findings |
| `BUG_REPORT` | QA found a bug, reporting to developer |
| `BUG_FIX` | Developer fixed a bug, notifying QA to re-run |
| `HUMAN_REVIEW` | Need human input or approval before proceeding |
| `DONE` | Task complete, passing result upstream |
| `BLOCKED` | Cannot continue, need help from team-lead |

## Memory Management

All agents should use `MEMORY.md` to persist and share knowledge across tasks.

- **Read**: At the start of every task, read `MEMORY.md` to get context on architectural decisions and project-wide rules.
- **Write**: Before finishing a task, update `MEMORY.md` if you've made a significant decision, discovered a major "gotcha", or established a new pattern.
- **Format**: Keep the file organized by sections (Shared Knowledge, Architectural Decisions, etc.).
