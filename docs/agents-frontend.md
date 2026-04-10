# Frontend Specialist Team

The Frontend Specialist Team is a dedicated group of agents focused on delivering high-quality, accessible, and performant user interfaces.

## Communication Graph

```
fe-team-lead ──► fe-architect ◄──► fe-dev ◄──► fe-qa
                                  │
                          fe-reviewer
```

- `fe-team-lead` coordinates the UI pipeline.

- `fe-architect` designs the component structure and state strategy.

- `fe-dev` implements the UI using the chosen framework and styling.

- `fe-reviewer` ensures visual consistency and WCAG 2.1 AA compliance.

- `fe-qa` performs functional UI testing and visual regression.

## Agent Roles

### fe-team-lead

- **Model:** claude-opus

- **Responsibility:** Orchestrates the UI pipeline, decomposes frontend tasks, and synthesizes results.

- **Out of Scope:** Backend development, database changes.

### fe-architect

- **Model:** claude-sonnet

- **Responsibility:** Defines component hierarchy, design tokens, and state management strategy. Writes `UI_SPEC.md`.

- **Out of Scope:** Implementation code, visual design assets.

### fe-dev

- **Model:** claude-sonnet

- **Step 0:** Discovers project rules (lint config, test config, coding guidelines)

- **Responsibility:** Implements UI components per `UI_SPEC.md`.
  Runs lint self-check before requesting review. Framework and styling aware.

- **Out of Scope:** Backend logic, unit tests.

### fe-reviewer

- **Model:** claude-sonnet

- **Step 0:** Discovers project rules, runs linter

- **Responsibility:** Runs lint (errors = Critical), performs visual review
  for pixel-perfection, ensures WCAG 2.1 AA accessibility compliance.

- **Out of Scope:** Architectural changes, functional testing.

### fe-qa

- **Model:** claude-sonnet

- **Step 0:** Discovers project rules (lint config, test config, coding guidelines)

- **Responsibility:** Writes lint-compliant tests, runs all three quality gates
  (tests + lint + build), E2E tests, visual regression, performance monitoring.

- **Out of Scope:** Fixing production UI code, accessibility review.

## Environment Configuration

The frontend team relies on the following configuration in `.env` (see `config/frontend.env.example`):

| Variable | Description | Example |
|----------|-------------|---------|
| `FRONTEND_FRAMEWORK` | The framework to use | `React`, `Vue`, `Svelte` |
| `CSS_APPROACH` | The styling methodology | `Tailwind`, `CSS-Modules` |
| `DESIGN_TOKENS_PATH` | Path to design tokens | `src/styles/tokens.json` |
| `FIGMA_FILE_URL` | URL to reference design | `https://figma.com/...` |
| `A11Y_STANDARD` | Accessibility baseline | `WCAG 2.1 AA` |
| `VISUAL_REGRESSION` | Tool for visual diffs | `Playwright-Snapshots` |

## Pipeline Flow

1. **Design:** `fe-team-lead` tasks `fe-architect` to create `UI_SPEC.md`.
2. **Implementation:** `fe-dev` discovers project rules, builds components, runs lint self-check.
3. **Architectural Review:** `fe-architect` reviews the code for architectural integrity.
4. **Visual & A11y Review:** `fe-reviewer` discovers project rules, runs linter
   (lint errors = Critical), checks for visual matches and accessibility.
5. **Quality Gates:** `fe-qa` discovers project rules, writes lint-compliant tests,
   runs all three gates (tests + lint + build). Iterates with `fe-dev` until all pass.
6. **Independent Verification:** `fe-team-lead` independently verifies all three gates.
7. **Delivery:** `fe-team-lead` synthesizes the `SUMMARY.md` and marks the task as complete.
8. **Memory curation:** `librarian` extracts findings from the task report
   into structured `memory.md`.
