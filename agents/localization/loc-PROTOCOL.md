# Localization Team — Communication Protocol

All localization agents must use this protocol for inter-agent messaging.

## Execution Flow

```text
ROADMAP.md → agent-team plan (loc-team-lead creates tasks/plan.md)
                         ↓
tasks/plan.md → agent-team run (executes tasks one by one)
                         ↓
           loc-team-lead → loc-agents (per task spec)
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
| `REVIEW_REQUEST` | Asking tech-writer or QA to check work |
| `REVIEW_FEEDBACK` | Review result with findings |
| `LOCALIZATION_REQUEST` | Team lead assigns translation task |
| `LOCALIZATION_DONE` | Localizer finished translation, passing to review |
| `QA_ISSUE` | QA found a problem |
| `QA_FIX` | Localizer/tech-writer fixed an issue |
| `DONE` | Task complete, passing result upstream |
| `HUMAN_REVIEW` | Need human input or approval before proceeding |
| `BLOCKED` | Cannot continue, need help from team-lead |

## Communication Graph

```text
loc-team-lead ──► loc-tech-writer ◄──► loc-localizer(s) ◄──► loc-qa
                   ▲                               │
                   └────── loc-seo-specialist ◄─────┘
```

- `team-lead` orchestrates the full pipeline, never writes docs or translations
- `tech-writer` writes source English content, reviews localizations and SEO changes
- `localizer` translates into one target language, iterates on feedback
- `seo-specialist` optimizes source and all translations, iterates with tech-writer
- `qa` checks source, translations, and SEO changes; reports issues to the responsible agent
- Multiple localizers run in parallel (one per language)
- `seo-specialist` and `qa` run in parallel after localizations are approved

## Tool Detection

Agents must detect the project's tooling before running commands.
Check for i18n frameworks, translation file formats (JSON, PO, XLIFF), and build tools.
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

- **Read**: At the start of every task, read `MEMORY.md` for context on terminology, style guides, and cultural preferences
- **Write**: Before finishing, append findings: translation rules, terminology standards, cultural notes
- **Format**: Use `## Task #N: Title` sections

## Reports and Logs

- Task reports: `.claude-loop/reports/task-{id}.md`
- Task logs: `.claude-loop/logs/`
- Audit trail: `.claude-loop/audit/audit.jsonl`
