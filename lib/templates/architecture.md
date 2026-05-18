# agent-team Architecture

## Overview

agent-team is a TypeScript + Bun multi-agent orchestration system designed to automate software development workflows.
It solves the problem of autonomous task execution by decomposing a high-level roadmap into actionable tasks and assigning
them to a specialized team of AI agents (architects, developers, testers) who collaborate via a structured communication
protocol to deliver verified code changes.

## Core Loop

The orchestration starts in [lib/run.ts](../lib/run.ts) with the `TaskRunner`. It picks the next pending task from the
roadmap and invokes the agent execution loop:

1. **Selection**: `TaskRunner` identifies the next task based on priority and dependencies.
2. **Execution**: It calls `runAgent` in [lib/sdk/agent-runner.ts](../lib/sdk/agent-runner.ts), which utilizes the
   `@anthropic-ai/claude-agent-sdk` programmatic `query()` API.
3. **Tool Cycle**: The SDK manages the agent's internal loop: Agent generates a tool call → `hooks.ts` validates/logs
   → tool executes → observation returned to Agent.
4. **Budget**: The loop is constrained by `maxTurns` (default 50) and an optional USD budget checked before each task.
5. **Completion**: The agent must output a `TASK_STATUS` (SUCCESS, FAILED, or HUMAN_REVIEW_NEEDED). If success, the
   `librarian` agent is triggered to update memory.

## Instruction Architecture

Agents are defined as Markdown files with YAML frontmatter, typically stored in `agents/` or `.claude/agents/`.

- **Frontmatter Fields**:
  - `role`: The functional identity (e.g., developer).
  - `model`: The specific Claude model to use (e.g., `claude-3-5-sonnet-latest`).
  - `tools`: Comma-separated list or YAML array of allowed tools (e.g., `Read, Write, Bash, Agent`).
  - `permission_mode`: Permissions for the SDK (e.g., `acceptEdits`).
  - `allow_sub_agents`: Boolean enabling the `Agent` tool for spawning sub-agents.
- **Scoped Instructions**: The Markdown body serves as the System Prompt. `runAgent` reads the frontmatter to configure
  the SDK session and passes the body to define the agent's behavior and constraints.

## Agent Roles

- **Team-lead**: The primary orchestrator. It reads the task spec, decides on a routing strategy, and delegates work to
  specialized agents. It never writes code directly.
- **Architect**: Responsible for technical design. It creates specifications (`spec.md`) and defines acceptance criteria.
- **Developer**: Implements the solution based on the architect's spec. It iterates until the implementation passes
  architectural review.
- **Reviewer**: Performs independent code review focusing on style, security, and best practices.
- **QA / AQA**: Writes and runs tests (unit, E2E). It enforces quality gates and reports bugs back to the developer.
- **Librarian**: A specialized agent that runs after every task to curate the shared memory.

## Memory & Context

The system uses a durable knowledge store at `.claude-loop/memory.md` (Karpathy wiki-as-codebase pattern).

- **Structure**: It contains sections for "Patterns & Decisions", "Known Errors & Gotchas", and a "Session Log".
- **Curation**: The `librarian` agent (using [lib/templates/librarian.md](../lib/templates/librarian.md)) reads the latest
  task report, extracts key learnings, and appends them to `memory.md` while deduplicating and summarizing older entries.
- **Context Injection**: `TaskRunner` reads `memory.md` and injects it into the `team-lead` prompt. To prevent context
  overflow, `capMemoryForPrompt` in [lib/memory.ts](../lib/memory.ts) limits the injection to the most recent 30 tasks.

## Tool Design

Tools are provided by the Claude Agent SDK and scoped via frontmatter.

- **Scope**: Common tools include `Read`, `Write`, `Edit`, `Bash`, `Glob`, `Grep`, `Task`, and `Teammate`.
- **Permissions**: Scoped in `CLAUDE.md` YAML. The orchestrator enforces these via the SDK's `permissionMode`.
- **Risk Classes**:
  - **Read-only**: `Read`, `Glob`, `Grep`.
  - **Write**: `Write`, `Edit`, `Bash` (writes to disk/git).
  - **External**: `WebSearch` (if enabled).
  - **Orchestration**: `Agent`, `Teammate` (spawning/communicating with sub-agents).

## Notifications

The system provides async status updates via a Telegram module in [lib/notify.ts](../lib/notify.ts).

- **Triggers**: Notifications fire when a task starts, completes successfully, fails, or requires human review.
- **Configuration**: Bot token and Chat ID are stored in `agent-team.json` and passed to the `tg` convenience wrapper.

## Safety & Prompt Injection

- **Boundary Enforcement**: `lib/sdk/hooks.ts` implements `PreToolUse` hooks to intercept and validate tool calls.
- **Bash Sanitization**: It uses regex patterns (`DEFAULT_BLOCKED_PATTERNS`) to block dangerous commands like `rm -rf /`
  or direct disk overwrites.
- **Path Restricted**: Write operations are blocked if they attempt to modify files outside the current working directory.
- **Sub-agent Boundaries**: Sub-agents inherit restricted toolsets and operate within their own session context, preventing
  a compromised sub-agent from escalating privileges beyond its assigned tools.

## Non-negotiable Rules

- **Quality Gates**: Every task must pass Build, Lint, and Test gates before being marked DONE.
- **Team-lead Delegation**: The team-lead must never implement code; implementation is strictly for the `developer` role.
- **Rule Discovery**: Agents must perform "Project Rules Discovery" at the start of a task to detect local environment
  tools (package managers, linters).
- **Librarian Curation**: Memory must be updated via the librarian after every successful task to ensure knowledge persistence.

## Minimal Extension Path

To add a new agent:

1. **Define**: Create a new Markdown file in `agents/{team}/` (e.g., `agents/software development/security-specialist.md`).
2. **Configure**: Add YAML frontmatter with the appropriate `role`, `model`, and `tools`.
3. **Protocol**: Update the `Communication Graph` in the team's `PROTOCOL.md` to define how other agents should interact
   with it.
4. **Registration**: The `team-lead` will automatically discover the new agent if it exists in the `.claude/agents/`
   directory (where agents are deployed during `init`).
