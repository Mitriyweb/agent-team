# Animation Guidelines

To achieve a "WOW" effect, all interfaces must feel alive and responsive through subtle, purposeful animations.

## Core Principles

1. **Purposeful**: Animations should guide the user's attention or provide feedback, never just for decoration.
2. **Snappy**: Keep transitions short (150ms - 300ms).

3. **Natural**: Use non-linear easing functions (e.g., `cubic-bezier(0.4, 0, 0.2, 1)`).

## Standard Transitions

- **Hover Transitions**: `all 0.2s cubic-bezier(0.4, 0, 0.2, 1)`

- **Entrance (Scale/Fade)**: `transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.2s linear`

- **Page Transitions**: Suble slide or fade (max 400ms).

## Micro-interactions

- **Buttons**: Scale down slightly (0.95) on active state, lifts on hover with a subtle shadow increase.

- **Inputs**: Outline or shadow glows softly when focused.

- **Cards**: Lift vertically (+4px to +8px) and increase shadow depth on hover.

## Easing Functions (CSS)

```css
--ease-standard: cubic-bezier(0.4, 0, 0.2, 1);
--ease-emphasized: cubic-bezier(0.87, 0, 0.13, 1);
--ease-decelerate: cubic-bezier(0.0, 0.0, 0.2, 1);
--ease-accelerate: cubic-bezier(0.4, 0, 1, 1);
```
