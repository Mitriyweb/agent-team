---
description: How to create a new agent team and validate it
---

### Creating a new team

To create a new agent team, use the `agent-team new-team` command. This will create a directory in `agents/` with a communication protocol and agent profiles.

#### Example

```bash
npx @mitriyweb/agent-team new-team --name "security-audit" --description "Security and vulnerability assessment team" --roles "auditor,pentester,reviewer"
```

### Validating a team

To ensure a team is correctly structured and follows all rules, use the `agent-team validate` command.

#### Example

```bash
npx @mitriyweb/agent-team validate security-audit
```

### Protocol and Agents

- Each team will have a `<prefix>-PROTOCOL.md` file describing how they communicate.
- Each role will have a `<prefix>-<role>.md` file with instructions.
- A `skills/` directory will be created for the team's specialized capabilities.
