# Localization Team — Communication Protocol

Extends the base agent communication protocol for documentation and localization workflows.

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
| `REVIEW_REQUEST` | Asking loc-tech-writer or loc-qa to check work |
| `REVIEW_FEEDBACK` | Review result with findings |
| `LOCALIZATION_REQUEST` | Team lead assigns translation task to a loc-localizer |
| `LOCALIZATION_DONE` | Localizer finished translation, passing to review |
| `QA_ISSUE` | QA found a problem, reporting to loc-localizer or loc-tech-writer |
| `QA_FIX` | Localizer/loc-tech-writer fixed an issue, notifying QA to re-check |
| `DONE` | Task complete, passing result upstream |
| `HUMAN_REVIEW` | Need human input or approval before proceeding |
| `BLOCKED` | Cannot continue, need help from team-lead |

## Communication Graph

```
loc-team-lead ──► loc-tech-writer ◄──► loc-localizer(s) ◄──► loc-qa
                   ▲                               │
                   └────── loc-seo-specialist ◄────────┘
```

- `team-lead` orchestrates the full pipeline, never writes docs or translations
- `loc-tech-writer` writes source English content, reviews localizations and SEO changes
- `loc-localizer` translates into one target language, iterates on feedback
- `loc-seo-specialist` optimizes source and all translations, iterates with loc-tech-writer
- `loc-qa` checks source, translations, and SEO changes; reports issues to the responsible agent
- Multiple loc-localizers run in parallel (one per language)
- `loc-seo-specialist` and `loc-qa` run in parallel after localizations are approved

## Memory Management

All agents should use `MEMORY.md` to persist and share knowledge across tasks.

- **Read**: At the start of every task, read `MEMORY.md` to get context on terminology, style guides, and cultural preferences.
- **Write**: Before finishing a task, update `MEMORY.md` if you've established a new translation rule or terminology standard.

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
