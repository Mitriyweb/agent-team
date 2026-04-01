## Purpose
Identifying OWASP vulnerabilities and common security pitfalls in code.

## When to Apply
Apply during any code review or architectural design phase to ensure security by design.

## Steps
1. Verify user input is always validated and sanitized.
2. Check for SQL injection, XSS, and CSRF vulnerabilities.
3. Ensure no hardcoded secrets or sensitive credentials.
4. Verify access control mechanisms (auth/authz) are enforced.
5. Review library dependencies for known vulnerabilities.

## Output Format
- Categorized security findings in REVIEW.md.
- Specific fix recommendations.
