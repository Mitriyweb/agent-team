# Agent Communication Protocol

All agents must use this protocol for inter-agent messaging.

## Execution Flow

```text
ROADMAP.md → agent-team plan (team-lead creates tasks/plan.md)
                         ↓
tasks/plan.md → agent-team run (executes tasks one by one)
                         ↓
           {{TEAM_PREFIX}}team-lead → {{TEAM_PREFIX}}agents (per task spec)
```

1. **Planning**: `agent-team plan` runs team-lead to decompose ROADMAP.md into `tasks/plan.md`
2. **Execution**: `agent-team run` picks tasks from `tasks/plan.md` by priority and dependencies
3. **Coordination**: team-lead spawns agents per task spec, coordinates via protocol below

## Message Format

Use the Teammate tool to communicate with other agents:

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
| `QUESTION` | Need clarification before continuing |
| `ANSWER` | Response to a `QUESTION` |
| `REVIEW_REQUEST` | Asking architect or reviewer to check work |
| `REVIEW_FEEDBACK` | Review result with findings |
| `BUG_REPORT` | QA found a bug, reporting to developer |
| `BUG_FIX` | Developer fixed a bug, notifying QA to re-run |
| `HUMAN_REVIEW` | Need human input or approval before proceeding |
| `DONE` | Task complete, passing result upstream |
| `BLOCKED` | Cannot continue, need help from team-lead |

## Tool Detection

Agents must detect the project's tooling before running commands.
Check `package.json` for `lint`, `test`, `build`, `format` scripts.
Do NOT assume any specific tool is installed.

## Handoff Summary

Every agent MUST end its final message with a structured handoff block:

```markdown
## Handoff Summary

**Status**: [DONE | BLOCKED | NEEDS_REVIEW]
**Changes**: <bullet list of files changed and why>
**Decisions**: <key technical decisions made>
**Next Agent**: [agent-name] — <what they need to do>
**Blockers**: <none | description>
```

Agents must NOT assume prior context — re-derive state from the Handoff Summary.

## Memory Management

All agents MUST use `.claude-loop/memory.md` to persist and share knowledge across tasks.

- **Read**: At the start of every task, read `.claude-loop/memory.md` for context
- **Write**: Before finishing, append findings: decisions, gotchas, patterns
- **Format**: Use `## Task #N: Title` sections

## Reports and Logs

- Task reports: `.claude-loop/reports/task-{id}.md`
- Task logs: `.claude-loop/logs/`
- Audit trail: `.claude-loop/audit/audit.jsonl`
