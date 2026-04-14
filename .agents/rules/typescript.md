# TypeScript Rules

## Enums over union types

NEVER use union types for sets of predefined string values. ALWAYS use enums.

```typescript
// Wrong
type Status = 'active' | 'inactive' | 'pending';

// Correct
export enum Status {
  Active = 'active',
  Inactive = 'inactive',
  Pending = 'pending',
}
```

- PascalCase for enum names and keys
- String values in lowercase
- Export all enums
- Use enum members (`Status.Active`) everywhere, never raw strings

## Braces required

All `if`, `else`, `for`, `while`, `do` MUST use braces, even for single-line bodies.

```typescript
// Wrong
if (valid) return true;

// Correct
if (valid) {
  return true;
}
```

## No `any`

Use proper TypeScript types. `any` is forbidden (enforced by biome `noExplicitAny: error`).

## No eslint-disable

NEVER add `eslint-disable` comments. Fix the code instead. No exceptions.

## Strict mode

The project uses `strict: true` in tsconfig with all additional checks enabled:
`noImplicitAny`, `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`,
`noFallthroughCasesInSwitch`, `noUncheckedIndexedAccess`.

## Dead code

Run `bun run knip` before committing. No unused files, exports, or dependencies allowed.
