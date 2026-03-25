# API Design Guidelines

## 1. RESTful Standards

- **Nouns over Verbs**: `/users`, not `/getUsers`.
- **HTTP Methods**:
  - `GET`: Retrieve data (Idempotent).
  - `POST`: Create or perform action.
  - `PUT`: Full update (Idempotent).
  - `PATCH`: Partial update.
  - `DELETE`: Remove data (Idempotent).
- **Status Codes**:
  - `200 OK`, `201 Created`.
  - `400 Bad Request`, `401 Unauthorized`, `403 Forbidden`, `404 Not Found`.
  - `500 Internal Server Error`.

## 2. Request & Response Structure

- **Consistency**: Use `camelCase` for all JSON keys.
- **Wrappers**: (Optional) Use a consistent envelope `{ "data": ..., "error": ..., "meta": ... }`.
- **Validation**: Strict validation (e.g., Zod, Joi) for all incoming payloads.

## 3. Reliability Patterns

- **Idempotency**: Use `Idempotency-Key` headers for critical POST operations.
- **Pagination**: Mandate pagination for all list endpoints (`limit`, `offset` or `cursor`).
- **Rate Limiting**: Define headers (`X-RateLimit-Remaining`).
- **Versioning**: Prefix URLs with `/v1/`.

## 4. Documentation

- Every API must be documented (OpenAPI/Swagger).
- Provide clear error messages with internal error codes for debugging.
