# Agent Communication Protocol

All agents must use this protocol for inter-agent messaging.

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
| `DONE` | Task complete, passing result upstream |
| `BLOCKED` | Cannot continue, need help from team-lead |

## Communication Graph

```
team-lead ──► architect ◄──► developer ◄──► qa
                                  │
                              reviewer
```

- `team-lead` coordinates all agents, never writes code
- `architect` talks directly to `developer` during design and implementation review
- `developer` iterates with `architect` until approved, then with `qa` until tests pass
- `reviewer` and `qa` run in parallel after developer finishes
- `reviewer` reports only to `team-lead`
- `qa` reports bugs directly to `developer`, final status to `team-lead`

## Example: architect → developer review loop

```json
// architect → developer
{
  "from": "architect",
  "type": "REVIEW_FEEDBACK",
  "subject": "Implementation review: UserService",
  "body": "🚨 Critical: no email validation in createUser.\n✅ Good: error handling is solid.",
  "files": ["src/services/UserService.ts"],
  "requires_response": true
}

// developer → architect
{
  "from": "developer",
  "type": "ANSWER",
  "subject": "Re: UserService review — fixed",
  "body": "Added zod validation on line 42. Ready for re-review.",
  "files": ["src/services/UserService.ts"],
  "requires_response": false
}
```

## Example: qa → developer bug loop

```json
// qa → developer
{
  "from": "qa",
  "type": "BUG_REPORT",
  "subject": "Bug: createUser returns 500 on duplicate email",
  "body": "Test: POST /users with existing email.\nExpected: 409 Conflict.\nActual: 500 Internal Server Error.\nLocation: src/controllers/users.ts:78",
  "files": ["tests/users.test.ts"],
  "requires_response": true
}

// developer → qa
{
  "from": "developer",
  "type": "BUG_FIX",
  "subject": "Re: duplicate email bug — fixed",
  "body": "Added UniqueConstraintError handler in UserController.ts:78. Please re-run tests.",
  "files": ["src/controllers/users.ts"],
  "requires_response": false
}
```
