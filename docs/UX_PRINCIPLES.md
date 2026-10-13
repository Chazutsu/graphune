# UX principles

Smoothness and visual quality are release criteria, not polish tasks. When a feature conflicts with
interaction continuity, reduce the feature before reducing the quality floor.

## Priority

1. Preserve the user's train of thought.
2. Make the current state and next action obvious.
3. Keep spatial relationships stable.
4. Add capability only after the first three hold.

## Interaction budgets

- Selection feedback: within 120 ms.
- Local search debounce: 160 ms.
- Direct interaction transitions: 80–140 ms.
- No layout movement on hover or focus.
- No blank intermediate state while replacing valid content.
- Long collections must keep search and filters reachable while scrolling.

## Visual language

- Cards behave like paper on a whiteboard: clear edge, quiet surface, no decorative elevation.
- Canvas tools behave like precision instruments: compact, aligned, and disabled until valid.
- Use the active Obsidian theme for color and typography. Preserve contrast relationships rather
  than imposing a separate light or dark palette.
- Spend accent color on focus, selection, and progress. Do not use it as decoration.
- Motion must explain a user-triggered change. Continuous motion is limited to active progress.

## Quality gate

A UI change is incomplete until it has:

- keyboard-visible focus and meaningful accessible names;
- a useful empty, loading, and failure state;
- stable behavior at 280 px sidebar width;
- `prefers-reduced-motion` support;
- no unnecessary rerender loop, polling, or synchronous Vault scan;
- tests for the primary interaction and state transition.
