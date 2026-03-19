# Frontend Agent Communication Protocol

All frontend agents must use this protocol for inter-agent messaging.

## Execution Flow

```
ROADMAP.md → plan.sh (fe-team-lead creates tasks/plan.md)
                         ↓
tasks/plan.md → run.sh (executes tasks one by one)
                         ↓
           fe-team-lead → fe-agents (per task spec)
```

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
| `REVIEW_FEEDBACK` | Review result with architectural findings |
| `DESIGN_ISSUE` | Visual or accessibility mismatch reported by fe-reviewer |
| `BUG_REPORT` | QA found a functional UI bug |
| `BUG_FIX` | Developer fixed a bug or design issue |
| `DONE` | Task complete, passing result upstream |
| `BLOCKED` | Cannot continue, need help from team-lead |

## Communication Graph

```
fe-team-lead ──► fe-architect ◄──► fe-dev ◄──► fe-qa
                                  │
                          fe-reviewer
```

- `fe-team-lead` coordinates all frontend agents, never writes UI code.
- `fe-architect` talks directly to `fe-dev` during design and architectural review.
- `fe-dev` iterates with `fe-architect` until approved, then with `fe-reviewer` and `fe-qa`.
- `fe-reviewer` and `fe-qa` run in parallel after developer finishes initial implementation.
- `fe-reviewer` reports visual issues directly to `fe-dev`, final status to `fe-team-lead`.
- `fe-qa` reports functional bugs directly to `fe-dev`, final status to `fe-team-lead`.
