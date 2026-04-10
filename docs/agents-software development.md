# Agent Roles

How the five agents work together to complete a task.

## Communication Graph

```
team-lead ──► architect ◄──► developer ◄──► qa
                                  │
                              reviewer
```

- `team-lead` orchestrates — never writes code

- `architect` talks directly to `developer` in both design and review phases

- `developer` iterates with `architect` until approved, then with `qa` until tests pass

- `reviewer` and `qa` run in parallel after developer finishes

- `qa` reports bugs directly to `developer`, reports final status to `team-lead`

---

## Agent Reference

### team-lead

- **Model:** claude-opus

- **Responsibilities:** Decomposes tasks, spawns and coordinates agents, writes final SUMMARY.md

- **Never:** Writes code, reviews code, or writes tests itself

- **Triggers:** All tasks — always the entry point

### architect

- **Model:** claude-sonnet

- **Phase 1:** Questions developer about codebase → writes SPEC.md

- **Phase 2:** Reviews implementation → iterates with developer → approves

- **Triggers:** `type:feature`, `type:refactor`

### developer

- **Model:** claude-sonnet

- **Step 0:** Discovers project rules (lint config, test config, coding guidelines)

- **Responsibilities:** Implements per SPEC.md, runs lint self-check before review,
  iterates on architect feedback, fixes QA bugs

- **Communicates with:** architect (review loop), qa (bug fix loop)

- **Triggers:** Most task types

### reviewer

- **Model:** claude-opus

- **Step 0:** Discovers project rules, runs linter

- **Focus:** Lint compliance (Critical), style, security, best practices
  (not architecture — architect owns that)

- **Runs:** In parallel with qa after developer finishes

- **Output:** REVIEW.md (lint errors = Critical findings) → reports to team-lead

### qa

- **Model:** claude-sonnet

- **Step 0:** Discovers project rules (lint config, test config, coding guidelines)

- **Responsibilities:** Writes lint-compliant tests, runs all three quality gates
  (tests + lint + build), reports failures to developer, iterates until all gates pass

- **Lint errors in own tests:** QA fixes these itself (not the developer's job)

- **Runs:** In parallel with reviewer after developer finishes

- **Output:** VERDICT.json + QA_REPORT.md → reports to team-lead

### librarian (cross-team)

- **Model:** claude-sonnet

- **Responsibilities:** Curates `.claude-loop/memory.md` after each completed task

- **Runs:** Automatically after task SUCCESS or approved HUMAN_REVIEW

- **Input:** Task report from `.claude-loop/reports/` (falls back to task log)

- **Output:** Structured updates to memory.md sections (Patterns & Decisions, Known Errors & Gotchas, Session Log)

---

## Task Flow

```
1. team-lead receives task from agent-team run
2. team-lead → architect: "Design this"
3. architect → developer: "Questions about codebase?"
4. developer → architect: "Here's what you need to know"
5. architect writes SPEC.md
6. architect → team-lead: "Spec ready"

7. team-lead → developer: "Implement per SPEC.md"
8. developer discovers project rules (lint, test, build config)
9. developer implements, runs lint self-check, fixes errors
10. developer → architect: "Done, lint clean, please review"
11. architect → developer: "Found issues: ..."
12. [iterate until architect approves]
13. architect → team-lead: "Implementation approved"

14. team-lead → reviewer: "Discover project rules, run lint, review" ┐ parallel
15. team-lead → qa: "Discover rules, write lint-compliant tests"     ┘

16. reviewer runs linter → lint errors are Critical findings
17. qa runs all 3 quality gates (tests, lint, build)
18. qa → developer: "Gate failed: lint 5 errors / test 2 failures"
19. developer → qa: "Fixed, re-run all gates"
20. [iterate until all 3 gates pass]

21. team-lead independently verifies all 3 gates
22. reviewer → team-lead: "Review done: REVIEW.md"
23. qa → team-lead: "All gates pass, coverage X%"

24. team-lead writes SUMMARY.md
25. task marked as done
26. librarian curates memory.md from task report
```

## Handoff Summaries

To ensure critical technical decisions and context survive Claude Code's context compaction, every agent must end its final message in a task with a
structured handoff block. This block acts as a bridge for the next agent, providing a compressed state of the task.

### Example Handoff Summary

```markdown

## Handoff Summary

**Status**: DONE
**Changes**:

- Created `src/services/AuthService.ts` for JWT handling

- Added `tests/auth.test.ts` with 95% coverage

**Decisions**:

- Used `jsonwebtoken` library instead of `jose` for consistency with existing backend

- Implemented RSA256 for token signing

**Next Agent**: sw-reviewer — Review security of RSA implementation and token storage
**Blockers**: none
```

Agents are instructed to re-derive the current task state from this summary rather than assuming prior context is still available in the conversation history.
