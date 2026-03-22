# Project Gotchas

List of project-specific traps and common errors.

- **Path Spacing**: Always quote paths containing spaces (e.g., `"agents/software development/"`).
- **Environment Variables**: Use `os.environ` or `process.env` instead of shell commands.
- **Model Pricing**: Access pricing via `config/pricing.yaml` rather than hardcoding values.
