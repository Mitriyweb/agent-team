# Modern Aesthetics: Premium Design Recipes

Use these recipes to transform basic layouts into high-end "WOW" experiences.

## 1. Glassmorphism (The "Glass" Effect)

Layered transparency that creates depth and focus.

- **Background**: `hsla(0, 0%, 100%, 0.05)` (Light) or `hsla(220, 20%, 10%, 0.6)` (Dark).

- **Blur**: `backdrop-filter: blur(12px) saturate(180%);`

- **Border**: `1px solid hsla(0, 0%, 100%, 0.1);`

- **Shadow**: Large, soft, low-opacity shadow to ground the element.

## 2. Mesh Gradients (Organic Fluidity)

Vibrant, multi-stop backgrounds that feel alive.

- **Technique**: Use multiple overlapping radial gradients with varying positions and blur.

- **Colors**: Use contrasting but harmonious HSL values (e.g., Primary Blue, Secondary Purple, Accent Emerald).

- **Animation**: Subtle `background-position` or `transform` shifts to create slow motion.

## 3. Bento Grids (Information Density)

Organizing content into a clean, modern grid of varied card sizes.

- **Principles**:

  - Use `display: grid` with `grid-template-areas`.

  - Content should be "chunked" into distinct modules.

  - Large rounded corners (16px+) and generous padding (24px+).

## 4. Sophisticated Depth (The "Z-Axis")

Moving beyond simple shadows.

- **Inner Glow**: `box-shadow: inset 0 1px 1px hsla(0, 0%, 100%, 0.1);` for a sharp top edge.

- **Multi-layered Shadows**: Combine 3-4 shadows with increasing blur and decreasing opacity.

- **Translation**: Combine with `translateY(-2px)` on hover for a tactile "lift".

## 5. Modern Typography Rules

- **Tracking (Letter Spacing)**: `-0.02em` for headings to make them feel tight and custom.

- **Line Height**: `1.1` for headings, `1.6` for long-form body text.

- **Variable Fonts**: Use weight ranges (e.g., 500-800) for dynamic emphasis.
