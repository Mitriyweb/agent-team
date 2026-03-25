# Internationalization (i18n) Best Practices

Proper handling of i18n ensures that the software remains functional and visually correct in every locale.

## 1. Placeholder Management

- **Preserve Keys**: Never translate or modify variable keys inside placeholders (e.g., `{name}`, `{{user_count}}`).
- **Context**: Placeholders must be positioned naturally according to the target language's grammar.
- **Escaping**: Ensure special characters in the target language don't break the i18n tag structure.

## 2. Pluralization Rules

- **Complex Rules**: Languages like Russian or Arabic have more than two plural forms.
  Always provide translations for all required forms (`one`, `few`, `many`, `other`).
- **Zero**: Treat "zero" specifically if the target language supports it (`zero` vs `other`).

## 3. Locale-Specific Formatting

- **Dates**: Use locale-appropriate formats (e.g., `DD/MM/YYYY` vs `MM/DD/YYYY`).
- **Numbers**: Use correct decimal separators (`,` vs `.`) and grouping separators.
- **Currencies**: Position currency symbols correctly (e.g., `$10` vs `10 €`).

## 4. UI Constraints

- **Text Expansion**: Some languages (e.g., German) can be up to 30% longer than English. Ensure translations are concise enough for UI elements.
- **RTL (Right-to-Left)**: Be aware of RTL requirements for languages like Arabic or Hebrew.

## 5. Metadata & Context

- **Comments**: Always read i18n developer comments to understand the context of a string (e.g., "This is a button label", "This is an error message").
