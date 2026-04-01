# Interactive Feedback: Tactile UX Guidelines

A premium interface doesn't just look good; it feels alive under the user's cursor.

## 1. Tactile Button States

- **Hover**: Subtle scale-up (1.02), background tint, and shadow depth increase.

- **Active (Click)**: Immediate scale-down (0.96) following the velocity of the click.

- **Magnetic Effect**: (Optional) Button center shifts slightly toward the cursor within its bounds.

## 2. Skeleton Screens (Refined)

Move beyond simple grey boxes.

- **Gradient**: Pulsing linear gradient from a slightly lighter surface color.

- **Animation**: `linear infinite 1.5s` shimmy effect.

- **Shape**: Match the final component's border-radius (12px) exactly.

## 3. Staggered Entrance

- **Technique**: Apply a standard "fade-in-up" animation to a list of items.

- **Delay**: Incremental delay (e.g., `item_index * 50ms`) for a "waterfall" effect.

- **Easing**: `cubic-bezier(0.22, 1, 0.36, 1)`.

## 4. Sophisticated Micro-interactions

- **Input Focus**: Border doesn't just change color; it glows with a soft outer shadow.

- **Checkbox/Radio**: Animated SVG paths or scale-in effects for the checkmark.

- **Switch**: Smooth spring-like motion for the toggle handle.

## 5. Cursor Interactions (Advanced)

- **State Change**: Cursor can change to a "view" icon or a specific color when hovering over high-impact elements (e.g., hero cards).

- **Inertia**: Smooth transition of visual states to avoid jarring jumps.
