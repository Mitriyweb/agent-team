# Proof-Loop Integration Plan

This document summarizes the valuable components from [repo-task-proof-loop](https://github.com/DenisSergeevitch/repo-task-proof-loop)
and how they are integrated into the `agent-team` workflow.

## Core Concepts to Adopt

1. **Spec Freeze**: The `sw-architect` creates a `SPEC.md` that is treated as an immutable contract
   for the implementation phase. No coding begins until the spec is "frozen".
2. **Evidence Packing**: The `sw-developer` must provide concrete proof (logs, test results, screenshots)
   in an `EVIDENCE.md` file before requesting a review. This ensures the developer has verified
   their own work against the spec.
3. **Fresh Verification**: The `sw-qa` agent acts as an independent verifier. It must not rely on the
   developer's narrative but instead perform a "fresh" verification of the codebase to produce a `VERDICT.json`.
4. **Durable Artifacts**: All task-related artifacts (Spec, Evidence, Verdict, Problems) should be
   stored in a task-specific directory (e.g., `.claude-loop/tasks/<TASK_ID>/`) to ensure auditability
   and easier resumption.

## Mapping of Roles

| proof-loop Role | agent-team Role | Primary Responsibility in Proof-Loop |
| :--- | :--- | :--- |

| `task-spec-freezer` | `sw-architect` | Creates and freezes `SPEC.md` |
| `task-builder` | `sw-developer` | Implements changes and packs `EVIDENCE.md` |
| `task-verifier` | `sw-qa` | Performs fresh verification, produces `VERDICT.json` |
| `task-fixer` | `sw-developer` | Fixes issues identified in `PROBLEMS.md` |
| Orchestrator | `sw-team-lead` | Drives the loop: Spec → Build → Evidence → Verify → Fix |

## Integration Steps

1. **Update `sw-team-lead`**: Orchestrate the strict phases: Design (Spec Freeze) -> Implementation (Build + Evidence) -> Verification (Fresh Verify)
-> Fix loop.
2. **Update `sw-architect`**: Explicitly "freeze" the spec. Ensure it contains clear Acceptance Criteria (AC1, AC2, etc.).
3. **Update `sw-developer`**: Require `EVIDENCE.md` with proof for every AC before moving to review.
4. **Update `sw-qa`**: Require `VERDICT.json` and `PROBLEMS.md` based on independent verification.
