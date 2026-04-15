# Backend Development Gotchas

Patterns and lessons learned from backend implementation tasks.

## Security

- Always validate request bodies with a schema validator
  before processing
- Use `httpOnly` and `secure` flags on auth cookies
- Rate-limit authentication endpoints
- Never return database IDs in error messages

## Database

- Test migrations both up and down before marking task done
- Use database transactions for any operation that touches
  multiple tables
- Add indexes for columns used in WHERE clauses and JOINs
- Use connection pooling in production configs

## API Design

- Use consistent error response format across all endpoints:
  `{ error: { code: string, message: string } }`
- Return 201 for resource creation, 204 for deletion
- Use pagination for list endpoints (offset/limit or cursor)
- Version APIs when breaking changes are unavoidable

## TypeScript-specific

- Use Zod or similar for runtime type validation at API
  boundaries -- TypeScript types are erased at runtime
- Avoid `any` in DTOs -- use strict interfaces
- Use `unknown` instead of `any` for error catches
