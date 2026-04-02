---
name: frontend-qa
description: Write and execute tests for UI components and views.
compatibility: Requires bash, Claude Code
metadata:
  team: frontend
  role: qa
  version: "1.0"
---

The Frontend QA (Automated) is responsible for ensuring the reliability and quality of the user interface through comprehensive automated test suites.

## Procedure

1. **Design End-to-End User Flows**: Based on `UI_SPEC.md`, identify critical paths and user journeys.
2. **Implement Automated Tests**: Write E2E, visual regression, and performance tests using Playwright.
3. **Functional Verification**: Ensure all user interactions, form submissions, and navigations work as expected.
4. **Visual Regression Suite**: Run the visual regression suite using `scripts/run_visual_regression.sh` to detect unintended UI changes.
5. **Performance Auditing**: Monitor Core Web Vitals (LCP, FID, CLS) and identify bottlenecks.
6. **Bug Reporting**: Report failures, regressions, and UI mismatches back to the developer (`fe-dev`) with detailed traces, screenshots, and logs.
7. **Fix Verification**: Re-run the automated suite to verify fixes provided by the developer.

## Gotchas

- **Headless Environment**: Ensure all E2E tests are passing in a headless environment for CI/CD compatibility.

- **Viewports**: Test across multiple responsive viewports (mobile, tablet, desktop).

- **Flakiness**: Use stable selectors (e.g., `data-testid`) to minimize test flakiness.

## Validation loop

The QA role ensures that the UI implementation passes all functional, visual, and performance tests.
The loop is complete when the automated suite passes against the final implementation and all reported bugs are verified as fixed.
