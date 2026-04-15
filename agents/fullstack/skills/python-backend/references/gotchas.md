# Python Backend Gotchas

Patterns and lessons learned from Python backend tasks.

## Environment

- Always check for existing virtual environments before
  creating a new one (`ls .venv venv .python-version`)
- Use `python -m pip` instead of bare `pip` to avoid
  PATH confusion
- Pin all dependency versions in requirements files
- When using poetry, run `poetry lock` after changes
  to `pyproject.toml`

## Security

- Use Pydantic `BaseModel` or marshmallow schemas for
  all request validation -- never trust raw `request.json`
- Set `httponly=True` and `secure=True` on auth cookies
- Rate-limit authentication endpoints with middleware
- Never return database IDs or tracebacks in error
  responses to clients
- Use `secrets.token_urlsafe()` for generating tokens,
  never `random`

## Database

- Test migrations both upgrade and downgrade before
  marking task done
- Use database transactions for multi-table operations
  (`with session.begin():` or `@atomic`)
- Add indexes for columns used in WHERE, JOIN, ORDER BY
- Use connection pooling (SQLAlchemy `pool_size`,
  Django `CONN_MAX_AGE`)
- Prefer `bulk_create` / `bulk_update` over loops for
  batch operations

## API Design

- Use consistent error response format:
  `{"error": {"code": "string", "message": "string"}}`
- Return 201 for resource creation, 204 for deletion
- Use pagination for list endpoints (offset/limit or
  cursor-based)
- Version APIs when breaking changes are unavoidable
- Use `status.HTTP_*` constants, not magic numbers

## Django-specific

- Use `select_related` for ForeignKey, `prefetch_related`
  for ManyToMany
- Never use `Model.objects.all()` in views without
  pagination
- Use `F()` expressions for database-level updates
- Keep `settings.py` split into base/dev/prod

## FastAPI-specific

- Use `Depends()` for dependency injection, not global
  state
- Define response models explicitly with `response_model`
- Use `BackgroundTasks` for fire-and-forget operations
- Use `lifespan` context manager for startup/shutdown

## SQLAlchemy-specific

- Always close sessions (`with Session() as session:`)
- Use `selectinload` over `joinedload` for collections
  to avoid cartesian products
- Use `text()` wrapper for raw SQL, never bare strings

## Type Hints

- Use `from __future__ import annotations` for forward
  references
- Prefer `str | None` over `Optional[str]` (Python 3.10+)
- Use `TypeVar` and `Generic` for reusable service classes
- Run `mypy --strict` when the project supports it
