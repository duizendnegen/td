# Tasks — aether-ui-redesign

## 1. Styling foundation

- [x] 1.1 Add `tailwindcss` + `@tailwindcss/vite` dev deps; wire the plugin into `vite.config.ts`
- [x] 1.2 Create `src/ui/hud.css`: `@import "tailwindcss"`, `@theme` tokens ported from STYLEGUIDE.md frontmatter (colors, spacing, fonts, type scale)
- [x] 1.3 Add material component classes: `.bevel-panel`, `.recessed-slot`, `.rivet` (+corner variants), `.hazard-stripe`, mechanical-button press behavior
- [x] 1.4 Add Google Fonts links (Public Sans, Inter, JetBrains Mono, Material Symbols) to `index.html` with system-font fallback stacks
- [x] 1.5 Replace `index.html`'s inline HUD CSS with the slot skeleton: `#topbar`, `#rail`, `#inspector`, `#bottom`, `#overlay`; import `hud.css` from `main.ts`

## 2. Desktop restyle (existing behavior, new skin)

- [x] 2.1 Treasury readout → top-bar recessed slot: JetBrains Mono, gold, crimson in debt (`hud.ts`)
- [x] 2.2 Build palette → left rail with cost badges, hotkey hints, and literal-variant state classes for affordable/debt/blocked/selected; remove tool gets hazard-stripe styling (`palette.ts`)
- [x] 2.3 Inspector → right bevel panel: header, stat rows, upgrade/dismantle buttons with the same state variants and countdown state (`inspector.ts`)
- [x] 2.4 Wave counter + next-wave preview → top-bar center block; START WAVE → large emerald bevel button (bottom-right); concede → bronze top-bar control; impossible-recovery notice → error-container card (`wavehud.ts`)
- [x] 2.5 Win/lose screens → centered bevel-panel card with emerald/crimson headline and mono ledger (`screens.ts`)
- [x] 2.6 Debug spawn panel: surface-container reskin only, desktop-only visibility (`spawnpanel.ts`)
- [x] 2.7 Play-verify desktop: all palette/inspector states, debt lock, dead-run notice, win and lose screens (Playwright pass)

## 3. Wave progress bar

- [x] 3.1 Pure derivation function (total / spawned / alive → progress) + unit tests against strict-sequential wave invariants
- [x] 3.2 Segmented emerald bar in the top bar: fills during active waves, hidden otherwise (`wavehud.ts`)

## 4. Mobile layout (styling only)

- [x] 4.1 Breakpoint variants: compact top bar, palette as bottom build menu with the same items/states, touch-sized targets
- [x] 4.2 Inspector as bottom sheet swapping with the build menu on selection; dismiss affordance restores the menu
- [x] 4.3 Play-verify mobile layout at phone viewport (Playwright emulation): both layouts expose identical controls and states

## 5. Input core refactor (no behavior change)

- [x] 5.1 Extract shared core from `InputController`: tile picking, ghost verdict loop, selection, command emission; pointer driver reuses it
- [x] 5.2 Verify desktop parity: hover ghost, one-click commit, reject flash, range rings, upgrade-hover preview all unchanged; state hash unaffected by hovering (existing invariant)

## 6. Touch driver

- [x] 6.1 Capability selection: `(hover: hover) and (pointer: fine)` → pointer model, else touch model
- [x] 6.2 Pointer-map gesture tracker with tap/drag disambiguation (8px / 250ms slop) + unit tests
- [x] 6.3 Pending ghost: tap anchors, drag/tap moves, verdict re-evaluates per (tile, tick); pending state never touches the sim (hash test)
- [x] 6.4 Confirm/cancel affordance anchored to the ghost via world→screen projection, viewport-clamped; confirm issues the standard place command, reject path unchanged
- [x] 6.5 Tap-to-select structures / tap-empty-to-deselect with no tool active; drives inspector + bottom sheet
- [x] 6.6 Removal via inspector confirmed working under touch (countdown visible, no hover dependency)

## 7. Touch camera

- [x] 7.1 `IsometricCamera`: `zoom` + `panOffset` with clamping; `frame()` zoom-aware; desktop (zoom=1) bit-identical to current framing
- [x] 7.2 Pinch-to-zoom about gesture midpoint + pan routing per gesture rules (two-finger always camera; one-finger camera when no tool); `touch-action: none` on canvas
- [x] 7.3 Resize while zoomed preserves center and re-clamps; determinism: replay with and without gestures produces identical hashes
- [x] 7.4 Rotate prompt overlay on portrait + coarse pointer; lossless rotation round-trip

## 8. Documentation

- [x] 8.1 README: "Visuals" → "Visual Design & HUD" (identity summary, per-breakpoint layout map, interaction models, link to STYLEGUIDE.md as token source)
- [x] 8.2 STYLEGUIDE.md: amend layout anchors and shapes prose to what ships (mockups-layout / rounded corners); note mockups as layout reference
- [x] 8.3 ARCHITECTURE.md §9: record Tailwind adoption (build-time styling layer; DOM stays framework-free), slot skeleton, and the two input drivers

## 9. Verification

- [x] 9.1 `npm run typecheck` + full test suite green (new unit tests: gesture tracker, progress derivation, camera clamp math)
- [x] 9.2 End-to-end exploratory pass, desktop viewport: full run to win and to concede in the new UI
- [x] 9.3 End-to-end exploratory pass, phone-landscape emulation: build, upgrade, remove, start wave, survive a wave entirely via touch driver
- [x] 9.4 Determinism probe (F8) hash matches a pre-change baseline for the same seed/commands (UI change never touches sim)
