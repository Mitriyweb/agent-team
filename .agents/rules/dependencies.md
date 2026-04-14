# Dependency Management Rules

## Exact versions only

NEVER use `^` or `~` in package.json versions.

```json
// Wrong
"knip": "^6.4.1"

// Correct
"knip": "6.4.1"
```

## After adding a dependency

1. Verify no `^` or `~`: `grep -E '"\^|"~' package.json` (should return empty)
2. Run `bun run knip` to check for unused dependencies
3. Run `bun run validate` to verify nothing is broken
