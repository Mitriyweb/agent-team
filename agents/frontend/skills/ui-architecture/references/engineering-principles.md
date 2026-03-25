# Engineering Principles for Frontend Architecture

High-end UI architecture must be as robust and maintainable as it is visually stunning.

## 1. SOLID in React/Frontend

- **S: Single Responsibility**: One component should do exactly one thing. If a component handles data fetching, business logic, AND complex UI, split it.
- **O: Open/Closed**: Components should be open for extension (via composition/props) but closed for modification.
- **L: Liskov Substitution**: Shared UI components (e.g., Buttons, Inputs) should be interchangeable if they follow the same interface.
- **I: Interface Segregation**: Don't force a component to depend on props it doesn't use. Use specialized interfaces.
- **D: Dependency Inversion**: Components should depend on abstractions (props/interfaces), not specific implementations. Use Context or Hooks for DI.

## 2. DRY (Don't Repeat Yourself)

- **Shared Logic**: Extract repeatable logic (API calls, form handling, intersection observers) into **Custom Hooks**.
- **UI Patterns**: Identify recurring visual patterns and extract them into atomic components (Buttons, Cards, Inputs).
- **Style Tokens**: Never hardcode colors or spacing. Always use the project's design system.

## 3. KISS (Keep It Simple, Stupid)

- **Avoid Over-engineering**: Don't build a complex state management system for a simple form.
- **Readable Logic**: Favor declarative code over complex imperative loops.
- **Component Size**: Aim for components under 150 lines. If larger, refactor into sub-components.

## 4. Composition Over Inheritance

- Use `children` and specialized slots to build complex UI from simple building blocks.
- Avoid deep prop-drilling; use Context API or State Management for deeply nested dependencies.
