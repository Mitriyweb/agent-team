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

- **Responsibilities:** Implements per SPEC.md, iterates on architect feedback, fixes QA bugs

- **Communicates with:** architect (review loop), qa (bug fix loop)

- **Triggers:** Most task types

### reviewer

- **Model:** claude-sonnet

- **Focus:** Style, security, best practices (not architecture — architect owns that)

- **Runs:** In parallel with qa after developer finishes

- **Output:** REVIEW.md → reports to team-lead

### qa

- **Model:** claude-sonnet

- **Responsibilities:** Writes unit + integration tests, reports bugs to developer, iterates to green

- **Runs:** In parallel with reviewer after developer finishes

- **Output:** QA_REPORT.md → reports to team-lead

---

## Task Flow

```
1. team-lead receives task from run.sh
2. team-lead → architect: "Design this"
3. architect → developer: "Questions about codebase?"
4. developer → architect: "Here's what you need to know"
5. architect writes SPEC.md
6. architect → team-lead: "Spec ready"

7. team-lead → developer: "Implement per SPEC.md"
8. developer → architect: "Done, please review"
9. architect → developer: "Found issues: ..."
10. [iterate until architect approves]
11. architect → team-lead: "Implementation approved"

12. team-lead → reviewer: "Review the code"      ┐ parallel
13. team-lead → qa: "Write tests and verify"      ┘

14. qa → developer: "Bug found: ..."
15. developer → qa: "Fixed, re-run tests"
16. [iterate until tests are green]

17. reviewer → team-lead: "Review done: REVIEW.md"
18. qa → team-lead: "Tests green, coverage X%"

19. team-lead writes SUMMARY.md
20. task marked as done in ROADMAP.md
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
