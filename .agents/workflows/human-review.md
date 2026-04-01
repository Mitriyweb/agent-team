---
description: How to request a human review during task execution
---

### When to request a human review

Agents should request a human review if:

- A critical decision needs human approval.

- An ambiguity in the requirements cannot be resolved by the team.

- A "safety check" is required before a potentially destructive operation.

- The user explicitly requested a checkpoint at a certain stage.

### How to request it

To pause the execution loop and wait for human input, the `team-lead` (or any agent in
the final phase of their task) must output the following string on the VERY LAST LINE
of their response:

```text
TASK_STATUS: HUMAN_REVIEW_NEEDED
```

### Communication Protocol

A new message type `HUMAN_REVIEW` has been added to the protocol. Agents can use this to signal to the `team-lead` that the process should stop for a human.

```json
{
  "from": "developer",
  "type": "HUMAN_REVIEW",
  "subject": "Approval needed for UI changes",
  "body": "I've refactored the login screen. Please check the screenshots in .claude-loop/reports/ before I proceed."
}
```

### User Interaction

The user will see a prompt in the terminal:
`══ HUMAN REVIEW NEEDED ════════════════════════════════════════`
`Task #NNN requested a human review.`
`Approve and continue? (y/n):`

If approved, the agent will receive a message that the review was approved and should continue with the next steps.
