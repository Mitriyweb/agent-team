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
| `REVIEW_REQUEST` | Asking tech-writer or qa to check work |
| `REVIEW_FEEDBACK` | Review result with findings |
| `LOCALIZATION_REQUEST` | Team lead assigns translation task to a localizer |
| `LOCALIZATION_DONE` | Localizer finished translation, passing to review |
| `QA_ISSUE` | QA found a problem, reporting to localizer or tech-writer |
| `QA_FIX` | Localizer/tech-writer fixed an issue, notifying QA to re-check |
| `DONE` | Task complete, passing result upstream |
| `BLOCKED` | Cannot continue, need help from team-lead |

## Communication Graph

```
team-lead ──► tech-writer ◄──► localizer(s) ◄──► qa
                   ▲                               │
                   └────── seo-specialist ◄────────┘
```

- `team-lead` orchestrates the full pipeline, never writes docs or translations
- `tech-writer` writes source English content, reviews localizations and SEO changes
- `localizer` translates into one target language, iterates on feedback
- `seo-specialist` optimizes source and all translations, iterates with tech-writer
- `qa` checks source, translations, and SEO changes; reports issues to the responsible agent
- Multiple localizers run in parallel (one per language)
- `seo-specialist` and `qa` run in parallel after localizations are approved
