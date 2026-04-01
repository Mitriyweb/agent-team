## Purpose

Verifying security-sensitive code and identifying common vulnerability patterns.

## When to Apply

Apply during review of any task that modifies authentication, authorization, or data persistence.

## Steps

1. Verify user input is always sanitized and validated (no injection).
2. Check for proper authorization checks on all protected resources.
3. Verify that sensitive data is encrypted at rest and in transit.
4. Ensure dependencies are secure and up-to-date.
5. Review against OWASP Top 10 and team-specific security checklists.

## Output Format

- Categorized security findings in REVIEW.md.

- Risk assessment and recommended mitigation steps.
