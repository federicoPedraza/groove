---
name: concentric-radius
description: >-
  MANDATORY rules for border-radius / rounded-* utilities in this frontend.
  Use whenever adding, changing, or reviewing a `rounded-*` class, a
  `border-radius`, or a `--radius-*` token — especially when one rounded
  element is nested inside another (card-in-card, button/input/badge-in-panel,
  chip pinned in a corner). Enforces concentric corners so nested arcs share a
  center.
---

# Concentric corners (border-radius standard)

Two nested rounded corners only look right when their arcs are **concentric** —
when they share a center. Using the same radius for an outer panel and an inner
element makes the gap between the curves uneven (tightest on the straight edges,
~1.41× wider at the 45° diagonal), which reads as a pinch/bulge. This is
regulatory for all UI in `src/` — apply it every time you touch a radius.

## The rule

```
inner_radius = max(0, outer_radius − inset)
inset        = outer_border_width + outer_padding_toward_that_corner
```

- `border-radius` is measured on the **border-box outer edge**, so the parent's
  border width counts toward the inset, not just its padding.
- For asymmetric padding (e.g. `px-3 py-2`), the corner is governed by the
  **smaller** of the two adjacent-side insets.
- When `inset ≥ outer_radius` the result clamps to **0 → `rounded-none`**
  (sharp). There is no negative round; the corner has already straightened out
  before you reach the inner element. Set `rounded-none` explicitly — never
  leave a stale `rounded-md`.

## Token scale (defined in `src/app/globals.css` `@theme`)

All tied to `--radius` (12px) so they cascade if the base changes:

| Token            | px  | calc                       |
| ---------------- | --- | -------------------------- |
| `rounded-2xs`    | 2   | `calc(var(--radius) - 10px)` |
| `rounded-xs`     | 4   | `calc(var(--radius) - 8px)`  |
| `rounded-sm`     | 8   | `calc(var(--radius) - 4px)`  |
| `rounded-md`     | 10  | `calc(var(--radius) - 2px)`  |
| `rounded-lg`     | 12  | `var(--radius)`              |
| `rounded-xl`     | 16  | `calc(var(--radius) + 4px)`  |
| `rounded-none`   | 0   | —                          |
| `rounded-full`   | pill| — (excluded, see below)    |

`rounded` with no suffix resolves to **12px** here (= `--radius`) — do not use
it as a "small" radius; it is the same as `rounded-lg`.

Pick the **token nearest** the computed value. Use an arbitrary
`rounded-[Npx]` only when the nearest token is >1.5px off and it matters
(e.g. a 3px result between `rounded-2xs` and `rounded-xs`). A 1px result snaps
to `rounded-2xs`.

shadcn primitive defaults: Card `rounded-lg`(12), Button/Input/Badge
`rounded-md`(10), Sidebar `rounded-xl`(16).

## When it applies — corner adjacency

Apply the rule to a child only when it actually sits **at** a parent's corner:

- the **first or last** flow child spanning the parent's width/height (touches
  the top or bottom corners), **or**
- an **absolutely-positioned** element pinned into a corner (`top-2 right-2`…).

A child whose corner lands inside the parent's rounded region must be
concentric. A child inset past the radius clamps to `rounded-none`.

**Same radius as parent is the classic bug.** A `rounded-md` box inside a
`rounded-md` panel can never be concentric — recompute it.

## Exclusions — leave these alone

- **Mid-document blocks** separated from any corner by sibling content — no
  shared corner, so no concentric constraint. Forcing them sharp is a
  regression.
- **Centered / floating decorative boxes** that never reach a corner.
- **`rounded-full`** pills, dots, avatars, switches, radio/progress indicators
  — pill geometry, not nesting.
- **Top-level containers** with no rounded parent (their radius is a free
  choice). On most pages the page background and main content column are *not*
  rounded, so page-level cards are top-level.
- **Preview / swatch mockups** that intentionally mirror a real component —
  keep them matching the real thing, don't step them down.
- **Shared primitives' base radius** — override at the corner-adjacent call
  site, don't change the primitive default for one case.

Oversized small chips (a bare `rounded`=12px pill larger than its containing
card) are a violation even when not corner-adjacent — step them down to match
the card's chip convention (usually `rounded-sm`).

## Worked examples (from this codebase)

- Card face `rounded-lg border-2 p-2` → inner card: 12 − 2 − 8 = **2px**
  (`rounded-2xs`). `item-detail-card.tsx`, `unit-card.tsx`.
- `rounded-md border px-3 py-3` panel, last full-width box: 10 − 1 − 12 < 0 →
  **`rounded-none`**. `assistant-mcp-panel.tsx`, the sound waveform bars.
- Count chip pinned `top-1 right-1` in `rounded-md border-2` tile:
  10 − 2 − 4 = **4px** (`rounded-xs`). `item-tile.tsx`.
- List rows in a `rounded-lg` panel with `p-2`: 12 − 1 − 8 = 3 → exact, use
  `rounded-[3px]`. `command-history-panel.tsx`.

## Checklist before finishing any radius change

1. Is this element nested at a rounded parent's corner? If no → leave it.
2. Compute `inset = parent border + governing padding`.
3. `inner = max(0, parent_radius − inset)`; snap to the nearest token (arbitrary
   only if >1.5px off).
4. If `inset ≥ parent_radius`, use `rounded-none`.
5. Never use bare `rounded` (=12px) as a small radius.
