# Design — aether-ui-redesign

## Context

See `proposal.md` (Why) and `openspec/explorations/20260803_ui-redesign.md` for the settled
decision set. Current state that shapes the approach:

- The HUD is vanilla-TS DOM: each `src/ui/*` class creates elements with inline `cssText` and
  appends to `#hud` (`index.html`), refreshed per frame with change-detection guards.
- `InputController` is pointer/hover-driven; ghost verdicts re-evaluate on (tile, tick) change
  through `sim.previewPlacement` — the authoritative-validation invariant to preserve.
- `IsometricCamera` is a fixed orthographic frustum fit to the board bounding box on resize;
  no zoom/pan concept exists.
- The sim already tracks `waveIndex`, per-group spawned counts for the active wave
  (`types.ts:115`), and live enemies — wave progress is derivable read-only.
- Mockups are Tailwind-v3-CDN prototypes; STYLEGUIDE.md frontmatter is the token source.

## Goals / Non-Goals

**Goals:**

- One design language across every player-facing surface, including the ones the mockups omit.
- Touch playability without forking the validation/command path: pointer and touch are two
  front-ends to the same `previewPlacement` + command emission.
- Zero sim-rule changes; zero new sim state.

**Non-Goals:**

- No React/framework adoption — Tailwind is a styling layer; DOM construction stays vanilla TS.
- No offline font/icon strategy (CDN accepted by decision).
- No portrait layout — portrait gets a rotate prompt, not a design.
- No touch support for the debug overlay/panel (desktop dev tool).

## Decisions

### D1 — Tailwind v4 via `@tailwindcss/vite`, tokens in `@theme`

Add `tailwindcss` + `@tailwindcss/vite` (dev deps), one `src/ui/hud.css` entry containing
`@import "tailwindcss"`, an `@theme` block porting STYLEGUIDE.md frontmatter (colors, spacing,
type scale as `--font-*`/`--text-*`/`--color-*` custom properties), and component-layer classes
for the material system: `.bevel-panel`, `.recessed-slot`, `.rivet`, `.hazard-stripe`.
The mockups' v3 `tailwind.config` JS is ported, not copied — v4 is CSS-first.
*Alternative considered:* v3 with a JS config matching the mockups 1:1 — rejected: new code on
a previous major.
*Constraint this creates:* class names must appear verbatim in source for Tailwind's scanner —
no runtime string-building of class names. UI modules use exported `const` class-string
literals; state changes toggle whole literal variants (`classList` swaps between
`BTN_AFFORDABLE` / `BTN_DEBT` / `BTN_BLOCKED`), mirroring today's style-swap pattern.

### D2 — HUD skeleton moves into `index.html` slots

`index.html` gains the static layout scaffold: `#topbar` (treasury right, wave counter +
progress center, concede), `#rail` (desktop build palette), `#inspector` (desktop right panel),
`#bottom` (mobile build menu / inspector sheet), `#overlay` (screens, rotate prompt). UI classes
mount into named slots instead of free-positioning against `#hud`. Desktop/mobile placement is
pure CSS (Tailwind responsive variants at a single breakpoint, `md:` ≈ 768px); components
render once and are re-parented by CSS grid areas, not by JS.
*Alternative:* keep absolute-positioned components and restyle in place — rejected: the
mockup layouts are structural (bars/rails/sheets), and two JS-managed layouts would duplicate
state.

### D3 — Interaction front-ends split on capability, not user agent

`matchMedia('(hover: hover) and (pointer: fine)')` selects the pointer model; otherwise the
touch model. Both are thin drivers over one shared core (tile picking via ground raycast,
ghost verdict loop, command emission) extracted from today's `InputController`:

```
            pointer driver (hover ghost, click commits)
           /
shared core — previewPlacement / commands / selection
           \
            touch driver (pending ghost, ✓/✕ commits)
```

The touch driver holds one piece of UI state: the pending placement `{tx, ty}`. Confirm/cancel
render as a floating ✓/✕ pair anchored by projecting the ghost tile's world position to screen
space each frame (same math the debug overlay uses), offset above the tile and clamped to the
viewport. Confirm issues the standard place command; the reject path (red flash) is unchanged.

### D4 — Gestures: raw pointer events, no gesture library

Touch gestures ride the existing `pointerdown/move/up` listeners with a small tracker (active
pointer map). Rules: single pointer + build tool → move pending ghost (tap = place ghost,
drag ≥ 8px slop = adjust); single pointer + no tool → camera pan (tap = select); two pointers →
always camera (pinch zoom + pan), regardless of tool. Tap vs drag disambiguation: 8px slop /
250ms. No dependency added; the tracker is ~100 lines and testable.

### D5 — Camera gains `zoom` and `panOffset`, `frame()` becomes zoom-aware

`IsometricCamera` keeps its fixed yaw/pitch and fit logic; `frame(aspect)` computes the
fit frustum as today, then divides extents by `zoom` (1 = fit, up to `MAX_ZOOM` ≈ 4) and
shifts by `panOffset` (camera-space XY), clamped so the frustum stays within the fit extents.
Desktop never changes `zoom`, so current behavior is bit-identical there. Pinch zooms about
the gesture midpoint by adjusting `panOffset` to keep the midpoint's world position fixed.
Render-side only — never enters the sim.

### D6 — Wave progress is a pure derivation; no sim changes

`total = Σ group.count` (level data), `spawned = Σ spawnedPerGroup`, `alive = enemies.length`
(strict-sequential waves ⇒ every live enemy belongs to the active wave), `resolved = spawned −
alive`, progress = `resolved / total`. Rendered as a segmented bar (one segment per, e.g.,
10%) in the top bar, emerald fill per the styleguide. This drops the proposal's tentative "sim
exposes counts" — nothing new is exposed.

### D7 — Surfaces the mockups omit are designed by rule, not invention

Mapping: wave counter + next-wave preview → top-bar center block (preview as a compact
`label-caps` line under the counter, expanded panel during build phase); START WAVE → the
mobile mockup's large emerald bevel button, bottom-right above the build menu on all form
factors; concede → quiet bronze control at top-bar left, with the impossible-recovery notice
as an error-container card beneath it; removal countdown → JetBrains Mono badge (existing
world-anchored placement); win/lose screens → centered bevel-panel card, emerald/crimson
headline, JetBrains Mono ledger; remove tool → palette item with hazard-stripe styling; debug
spawn panel → surface-container colors only, otherwise untouched. Rotate prompt: full-screen
`#overlay` card shown via CSS `(orientation: portrait)` on coarse-pointer devices.

### D8 — Docs in the same change

README "Visuals" → "Visual Design & HUD" (identity paragraph, per-breakpoint layout map,
interaction models, link to STYLEGUIDE.md as token source). STYLEGUIDE.md prose amended:
layout section rewritten to the shipped anchors, "Sharp (0)" shapes section rewritten to
lightly-rounded-as-mocked. ARCHITECTURE.md §9 amended: HUD remains framework-free DOM, styled
by Tailwind utility classes (build-time CSS only, no runtime framework).

## Risks / Trade-offs

- [Tailwind scanner misses dynamic classes] → D1's literal-variant rule; a grep-able
  convention (`BTN_*`, `PANEL_*` constants) keeps all class strings static.
- [Touch heuristics misfire on hybrid devices (touch laptops)] → capability query prefers the
  pointer model when hover exists; touch driver is additive, not exclusive — a touch on a
  hover-capable device falls back to the pointer path.
- [Two-step placement slows expert mobile play] → confirm affordance sits adjacent to the
  ghost (one short reach); drag-adjust means mis-taps cost nothing.
- [CDN fonts flash/fail offline] → accepted by decision; `font-display: swap` and system-font
  fallback stacks keep the HUD legible without them.
- [Pinch/pan fighting browser gestures] → `touch-action: none` on the canvas; HUD keeps
  default touch-action so its buttons scroll/click natively.
- [Layout re-slotting breaks the per-frame change-detection guards] → guards key on content,
  not position; slots only change CSS placement.
- [test gap: ui/ and render/ are play-verified, not unit-tested] → per project convention,
  exploratory Playwright passes during apply (config guidance); the gesture tracker and
  progress derivation are plain functions and DO get unit tests.

## Open Questions

- Exact breakpoint value (default `md` 768px vs a game-specific one) — tune during apply.
- Segment count of the progress bar (visual density) — tune against the top bar width.
- Whether `MAX_ZOOM` 4 is enough for reliable taps on small phones — tune on device.
