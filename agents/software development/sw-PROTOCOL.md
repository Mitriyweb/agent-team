# Agent Communication Protocol

All agents must use this protocol for inter-agent messaging.

## Execution Flow

```
ROADMAP.md → plan.sh (team-lead creates tasks/plan.md)
                         ↓
tasks/plan.md → run.sh (executes tasks one by one)
                         ↓
           sw-team-lead → sw-agents (per task spec)
```

1. **Planning**: `plan.sh` runs team-lead to decompose ROADMAP.md into `tasks/plan.md`
2. **Execution**: `run.sh` picks tasks from `tasks/plan.md` by priority and dependencies
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
| `REVIEW_REQUEST` | Asking architect or sw-reviewer to check work |
| `REVIEW_FEEDBACK` | Review result with findings |
| `BUG_REPORT` | QA found a bug, reporting to developer |
| `BUG_FIX` | Developer fixed a bug, notifying QA to re-run |
| `HUMAN_REVIEW` | Need human input or approval before proceeding |
| `DONE` | Task complete, passing result upstream |
| `BLOCKED` | Cannot continue, need help from team-lead |

## Communication Graph

```
sw-team-lead ──► sw-architect ◄──► sw-developer ◄──► sw-qa
                                  │             └──► sw-aqa
                              sw-reviewer
```

- `team-lead` coordinates all agents, never writes code.
- `architect` talks directly to `developer` during design and implementation review.
- `developer` iterates with `architect` until approved, then with `qa` and `aqa` until tests pass.
- `sw-reviewer`, `qa`, and `aqa` run in parallel after developer finishes.
- `sw-reviewer` reports only to `team-lead`.
- `qa` and `aqa` report bugs directly to `developer`, final status to `team-lead`.

## Example: sw-architect → sw-developer review loop

```json
// sw-architect → sw-developer
{
  "from": "sw-architect",
  "type": "REVIEW_FEEDBACK",
  "subject": "Implementation review: UserService",
  "body": "🚨 Critical: no email validation in createUser.\n✅ Good: error handling is solid.",
  "files": ["src/services/UserService.ts"],
  "requires_response": true
}

// sw-developer → sw-architect
{
  "from": "sw-developer",
  "type": "ANSWER",
  "subject": "Re: UserService review — fixed",
  "body": "Added zod validation on line 42. Ready for re-review.",
  "files": ["src/services/UserService.ts"],
  "requires_response": false
}
```

## Example: sw-qa → sw-developer bug loop

```json
// sw-qa → sw-developer
{
  "from": "sw-qa",
  "type": "BUG_REPORT",
  "subject": "Bug: createUser returns 500 on duplicate email",
  "body": "Test: POST /users with existing email.\nExpected: 409 Conflict.\nActual: 500 Internal Server Error.\nLocation: src/controllers/users.ts:78",
  "files": ["tests/users.test.ts"],
  "requires_response": true
}

// sw-developer → sw-qa
{
  "from": "sw-developer",
  "type": "BUG_FIX",
  "subject": "Re: duplicate email bug — fixed",
  "body": "Added UniqueConstraintError handler in UserController.ts:78. Please re-run tests.",
  "files": ["src/controllers/users.ts"],
  "requires_response": false
}
```

## Memory Management

All agents should use `MEMORY.md` to persist and share knowledge across tasks.

- **Read**: At the start of every task, read `MEMORY.md` to get context on architectural decisions and project-wide rules.
- **Write**: Before finishing a task, update `MEMORY.md` if you've made a significant decision, discovered a major "gotcha", or established a new pattern.
- **Format**: Keep the file organized by sections (Shared Knowledge, Architectural Decisions, etc.).

## Handoff Summary

To ensure critical decisions survive context compaction, each agent MUST end its final message
in a turn with a structured summary block. Agents MUST NOT assume prior context; they should
re-derive state from the Handoff Summary of the previous agent's message.

```markdown
## Handoff Summary
**Status**: [DONE | BLOCKED | NEEDS_REVIEW]
**Changes**: <bullet list of files changed and why>
**Decisions**: <key technical decisions made>
**Next Agent**: [agent-name] — <what they need to do>
**Blockers**: <none | description>
```
