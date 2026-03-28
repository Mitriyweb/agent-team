---
description: How to validate an existing agent team
---

### Validating a team

To ensure a team is correctly structured and follows all rules (e.g., has a `PROTOCOL.md`
and standard agent profiles with H1 titles and `## Instructions`), use the
`agent-team validate` command.

#### Example

```bash
npx @mitriyweb/agent-team validate security-audit
```

### Validation Rules

The validator checks for:

- Existence of the team directory in `agents/`.
- Presence of a `*PROTOCOL.md` file.
- Presence of at least one agent `.md` file.
- Each agent file must have:
  - An H1 title (e.g., `# Developer`).
  - A `## Instructions` section.
