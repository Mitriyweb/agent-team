# TypeScript & Typing Guidelines

Strong typing is the foundation of a scalable frontend codebase.

## 1. Strict Typing Policy

- **NO `any`**: The use of `any` is strictly forbidden. Use `unknown` if the type is truly unknown, then narrow it.
- **Strict Props**: Every component must have a clearly defined `interface` or `type` for its props.
- **Inference**: Leverage TypeScript's inference for local variables, but be explicit for function returns and component interfaces.

## 2. Advanced Typing Patterns

- **Discriminated Unions**: Use for complex states (e.g., `loading | success | error`) to ensure type safety in conditional rendering.
- **Generics**: Use for reusable components (e.g., Tables, Selects) that work with various data types.
- **Utility Types**: Use `Pick`, `Omit`, `Partial`, and `Required` to derive types and avoid duplication.

## 3. Shared Types

- Centralize shared entity types (e.g., `User`, `Project`) in a `types/` directory.
- Avoid deeply nested namespaces; favor flat, exported interfaces.

## 4. Documentation via Types

- Use JSDoc comments on interface properties to provide context in IDE tooltips.
- Types should serve as the primary documentation for how to use a component.

![[Untitled.base]]
