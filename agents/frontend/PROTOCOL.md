# Frontend Agent Communication Protocol

All frontend agents must use this protocol for inter-agent messaging.

## Execution Flow

```text
ROADMAP.md → agent-team plan (fe-team-lead creates tasks/plan.md)
                         ↓
tasks/plan.md → agent-team run (executes tasks one by one)
                         ↓
           fe-team-lead → fe-agents (per task spec)
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
| `REVIEW_FEEDBACK` | Review result with architectural findings |
| `DESIGN_ISSUE` | Visual or accessibility mismatch reported by fe-reviewer |
| `BUG_REPORT` | QA found a functional UI bug |
| `BUG_FIX` | Developer fixed a bug or design issue |
| `DONE` | Task complete, passing result upstream |
| `HUMAN_REVIEW` | Need human input or approval before proceeding |
| `BLOCKED` | Cannot continue, need help from team-lead |

## Communication Graph

```text
fe-team-lead ──► fe-architect ◄──► fe-dev ◄──► fe-reviewer
                                      ▲               │
                                      │    fixes      │ approved
                                      ▼               ▼
                                  fe-qa ◄─────────► fe-aqa
```

- `fe-team-lead` coordinates all frontend agents, never writes UI code
- `fe-architect` designs components, `fe-dev` implements them
- `fe-dev` iterates with `fe-architect` until spec is approved
- `fe-reviewer` reviews implementation (visual consistency, accessibility, design tokens)
- `fe-reviewer` sends feedback to `fe-dev` — developer fixes and re-submits until approved
- `fe-qa` and `fe-aqa` run **after reviewer approves** — E2E, visual regression, performance
- `fe-qa` reports bugs to `fe-dev`, developer fixes and re-submits to `fe-qa`
- Final status from `fe-qa` goes to `fe-team-lead`

## Tool Detection

Agents must detect the project's tooling before running commands.
Check `package.json` for `lint`, `test`, `build`, `dev` scripts.
Check for framework-specific tools: `vite`, `next`, `playwright`, etc.
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

All agents MUST use `MEMORY.md` to persist and share knowledge across tasks.

- **Read**: At the start of every task, read `MEMORY.md` for context on design tokens, component standards, and project rules
- **Write**: Before finishing, append findings: design decisions, component patterns, gotchas
- **Format**: Use `## Task #N: Title` sections

## Reports and Logs

- Task reports: `.claude-loop/reports/task-{id}.md`
- Task logs: `.claude-loop/logs/`
- Audit trail: `.claude-loop/audit/audit.jsonl`
