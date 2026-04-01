# Project Memory

This file serves as a persistent memory for all agents.
It contains shared knowledge, architectural decisions, and important findings that should persist across tasks.

## Shared Knowledge

- Use this section for general project information.

## Architectural Decisions

- Document key design choices here.

## Lessons Learned & Gotchas

- Record common pitfalls and how to avoid them.

## Progress Tracking (Cross-Task)

- Track long-term goals that span multiple tasks.

## Human-in-the-loop

To pause the execution for human review, use the `HUMAN_REVIEW` message type in the protocol.
The `team-lead` will then signal the loop to stop by outputting `TASK_STATUS: HUMAN_REVIEW_NEEDED`.

**Best practices:**

- Provide clear context in the review request.

- Specify which files/reports the human should look at.

- Use this sparingly for truly critical or ambiguous points.
