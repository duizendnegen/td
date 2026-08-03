# Aether-Industrial UI redesign + touch playability

## Why

The HUD is functional but unstyled placeholder DOM, while the game now has a complete design
identity: STYLEGUIDE.md (Aether-Industrial tokens + material rules) and two concrete mockups
(`mockups/desktop.html`, `mockups/mobile.html`). Adopting them makes the POC presentable and —
since the mobile mockup implies a phone player the game cannot actually serve — this change also
makes the game playable on touch devices. Decisions were settled in
`openspec/explorations/20260803_ui-redesign.md`.

## What Changes

- Restyle every player-facing UI surface in the Aether-Industrial language: treasury top bar,
  build palette, tower inspector, wave counter + next-wave preview, START WAVE, concede +
  impossible-recovery notice, removal countdown, win/lose screens. Mockups win on layout,
  STYLEGUIDE.md wins on material rules (bevels, tonal depth, typography, color roles); no
  mockup placeholder text is adopted (neutral TREASURY label, existing tower names).
- New desktop layout: top app bar (treasury readout right), left build rail, right inspector
  panel. New mobile layout below a breakpoint: compact top bar, bottom build menu, inspector
  as a bottom sheet that swaps with the build menu.
- Adopt Tailwind (v4, `@tailwindcss/vite`) as the UI styling layer; theme tokens ported from
  STYLEGUIDE.md frontmatter. UI modules migrate from inline `cssText` to Tailwind classes.
  Fonts (Public Sans, Inter, JetBrains Mono) and Material Symbols icons load from Google
  Fonts CDN, matching the mockups.
- New segmented wave progress bar (emerald fill as the active wave drains), fed from per-wave
  spawned/resolved counts.
- Touch playability: tap-to-place with a preview-then-confirm step (desktop keeps
  hover + instant click; both run the same authoritative validation), touch tower selection,
  and pinch-zoom + pan camera on touch — landscape-first, portrait shows a rotate prompt.
- Docs: README's "Visuals" section becomes "Visual Design & HUD" (identity summary, layout
  map, interaction models, link to STYLEGUIDE.md as canonical token source); STYLEGUIDE.md's
  layout/shape prose amended to match what ships; ARCHITECTURE.md §9's "no framework" note
  amended to record the Tailwind decision.

## Capabilities

### New Capabilities

- `touch-input`: touch interaction with the board — tap-preview-confirm placement, drag to
  adjust the pending ghost, tap-to-select towers, and touch gesture routing (build vs camera).

### Modified Capabilities

- `build-ui`: HUD layout is respecified per form factor (top bar / left rail / right inspector
  on desktop; compact top bar / bottom build menu / inspector bottom sheet on mobile); visual
  state semantics (affordable / debt-warning / blocked, selected) bind to the design system's
  mechanical-button states; a wave progress bar requirement is added; the ghost-preview
  requirement gains the touch confirm-step path.
- `isometric-camera`: the "entire board always framed" requirement is relaxed on touch —
  pinch-zoom and pan within board bounds are added, with fit-to-board remaining the default
  and the desktop behavior; projection (2:1 dimetric, orthographic) is unchanged.

## Impact

- **Code**: all of `src/ui/` (hud, palette, inspector, wavehud, screens, spawnpanel, input),
  `src/render/cameras.ts` (zoom/pan), `src/render/fx.ts` (pending-ghost confirm state),
  `index.html` (fonts, Tailwind entry, HUD overlay CSS relocation), `src/app/game.ts` (wiring).
  Sim: expose per-wave spawned/resolved counts for the progress bar (read-only derivation if
  already trackable; no rule changes).
- **Dependencies**: adds `tailwindcss` + `@tailwindcss/vite` (dev). Runtime gains Google Fonts
  CDN requests (accepted tradeoff: external dependency, glyph flash on slow connections).
- **Docs**: README.md, STYLEGUIDE.md, ARCHITECTURE.md §9.
- **Not changing**: sim rules, balance data, level format, debug spawn panel behavior (minimal
  dev-only reskin), desktop mouse interaction model.
