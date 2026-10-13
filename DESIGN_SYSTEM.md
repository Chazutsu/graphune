# Graphune Design System

This is Graphune's product-local design system. As in the Blog product, design decisions move from
tokens to components to screens. Graphune does not share its visual language with Blog or Taktune.

## Product character

- **Spatial clarity:** Make the position and relationship of notes understandable before adding
  decoration.
- **Calm workspace:** Use quiet, low-contrast surfaces for sustained thinking and reserve strong
  emphasis for active interactions.
- **Compact navigation:** Keep search, filtering, and navigation available in narrow Obsidian
  sidebars.
- **Direct manipulation:** Show the target and result of dragging, selection, and preview actions
  immediately.

## Token layers

1. Obsidian semantic variables provide theme-compatible inputs.
2. `--hb-*` variables express meaning within Graphune.
3. Tailwind theme aliases and semantic classes provide the component implementation API.

`src/design-system/tokens.css` owns fallbacks for Obsidian variables, color, spacing, radius,
typography, motion, and z-index. Do not add React inline styles except for values that depend on
dynamic coordinates.

Tailwind aliases use the `hb` namespace, such as `text-hb-muted`, `bg-hb-hover`, and
`border-hb-border`. Avoid host-dependent names such as `ob` and ambiguous names such as
`text-muted`. Use Tailwind to compose layout and state. Keep classes that describe complex UI
behavior, such as `heptabase-*`, in product-local CSS for compatibility.

### Core tokens

| Role | Token | Use |
| --- | --- | --- |
| Canvas | `--hb-paper` | Primary workspace surface |
| Subtle surface | `--hb-mist` | Search and supporting panels |
| Text | `--hb-ink` / `--hb-muted` / `--hb-faint` | Primary, supporting, and inactive information |
| Interaction | `--hb-hover` / `--hb-focus` | Hover, visible focus, and selection |
| Boundary | `--hb-line` / `--hb-line-subtle` / `--hb-line-strong` | Separation strength |
| Motion | `--hb-motion-*` / `--hb-ease` | State transitions; `0ms` when reduced motion is requested |
| Elevation | `--hb-shadow-floating` | Temporary surfaces such as popovers |

## Component rules

- Fields use `heptabase-field` and must provide hover and `:focus-visible` states.
- Tabs preserve the ARIA tabs pattern and arrow-key navigation.
- Cards prioritize information density and avoid decorative empty space.
- Drag feedback does not rely on color alone; show a label or item count.
- Interactive targets are at least 44 px on narrow touch layouts.
- Motion stops when `prefers-reduced-motion` is enabled.

## Component maturity

| Pattern | API | Required states |
| --- | --- | --- |
| Field | `heptabase-field` | Default, hover, focus-visible, disabled |
| Tabs | `heptabase-tabs` / `heptabase-tab` | Default, active, focus-visible, arrow-key navigation |
| Note card | `heptabase-note-card` | Default, dragging, on-canvas, canvas-selected |
| Floating panel | `heptabase-*__popover` | Closed, open, focus containment, narrow width |
| Canvas tools | `canvas-layout-tool` | Enabled, disabled, focus-visible, operation result |

## Ownership

- Graphune owns this file and `src/design-system/*`.
- Do not reference Taktune's `--ttd-*` variables or Blog tokens.
- Promote only nonvisual, Obsidian-specific duplication to `obsidian-plugin-kit`.

## Promotion gate

Move a candidate into `packages` only after both plugins have used it in production, it contains no
product-specific vocabulary, and it has independent tests and a compatibility policy. Do not share
UI merely because it looks similar.
