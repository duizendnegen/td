# Exploration log

## 2026-08-03 — Aether-Industrial UI redesign + mobile playability

Prompted by: "integrate STYLEGUIDE.md in the README.md artifact, redesign to apply
mockups/desktop.html and mockups/mobile.html to the UI and HUD."

Q&A pass, biggest blast radius first. Decisions:

- **Mobile scope — full touch playability**, not just a responsive HUD. The change delivers
  tap-to-place without hover, touch-friendly selection, and mobile camera work alongside the
  visual redesign. This is the scope-doubling option, chosen deliberately.
- **Touch placement model — tap = preview, confirm to commit.** First tap drops the validated
  ghost on a tile (drag to adjust); an explicit confirm/cancel affordance commits. Desktop
  keeps hover + instant click-commit. Both models share the same `previewPlacement` validation
  path — the ghost/commit can never disagree, per the existing invariant.
- **Mobile camera — pinch-zoom + one-finger pan, landscape-first.** Fixed isometric angle
  stays; two-finger pan while a build tool is active. Portrait shows a rotate prompt.
  Touches `render/cameras.ts` + new gesture handling.
- **Doc authority — mockups win on layout, styleguide wins on material.** Layout: top app bar
  (treasury readout right), desktop left build rail + right inspector panel, mobile bottom
  build menu. Material: styleguide's bevel/tonal depth, typography (Public Sans caps /
  Inter / JetBrains Mono numbers), color roles — but corners stay lightly rounded as mocked.
  STYLEGUIDE.md's layout ("treasury top-center, palette bottom-center") and shape ("Sharp (0)")
  prose gets amended to match what ships.
- **Styling implementation — adopt Tailwind via Vite plugin.** Deviates from the inline-cssText
  status quo and from the "no framework" lean; chosen to match the mockup markup 1:1.
  Default to Tailwind v4 (`@tailwindcss/vite`, CSS-first `@theme`) with the mockups' v3-style
  config ported into theme tokens sourced from STYLEGUIDE.md frontmatter.
- **Coverage — everything, plus the wave progress bar.** All player-facing surfaces get the
  treatment: treasury bar, palette (incl. remove tool, which the mockups omit), inspector,
  START WAVE, wave counter + next-wave preview, concede + impossible-recovery notice, removal
  countdown, win/lose screens. Surfaces the mockups don't show are designed in the mockups'
  language. The styleguide's segmented emerald Wave Progress Bar ships as a small new feature
  fed from per-wave spawned/resolved counts (new sim-derived data). Debug spawn panel gets a
  minimal dev-only reskin.
- **README integration — summary section + link.** README's two-line "Visuals" section becomes
  "Visual Design & HUD": identity paragraph, resolved per-breakpoint layout map, interaction
  models (tap-preview-confirm, pinch/pan), pointing to STYLEGUIDE.md as the canonical token
  source. No token duplication into the README.
- **Fonts & icons — Google Fonts CDN for everything**, matching the mockups exactly: Public
  Sans, Inter, JetBrains Mono, and the Material Symbols icon font. Accepted tradeoffs: external
  requests, glyph flash on slow connections, online dependency during dev.
- **Branding — no mockup text.** "Ironclad Bastion" / "Royal Treasury" / Archer/Wizard/Catapult
  are treated as lorem ipsum. Top bar gets a neutral TREASURY label; page title stays
  "Maze Tower Defense — POC"; tower names stay rapid/sniper/area/slow.
- **Mobile inspector — bottom sheet that swaps with the build menu.** Selecting a tower slides
  the inspector into the bottom zone (stats condensed to one row, upgrade/remove as large touch
  buttons); dismissing restores the build menu. One bottom zone, board never covered.

Context findings that shaped the above:

- The styleguide's Mechanical Button states (Affordable / Debt-Warning / Blocked) map 1:1 onto
  the states `palette.ts` and `inspector.ts` already compute per frame — the redesign is a
  reskin of an existing state machine, not new UI logic.
- The mockups and STYLEGUIDE.md contradict each other on layout anchors and corner shapes;
  resolved above (mockups-layout / styleguide-material).
- Mockups omit: wave panel, concede, removal countdown, win/lose screens, remove tool, debug
  panel. All get designed in-language (see Coverage).
- `index.html` currently carries the HUD-overlay CSS inline; Tailwind adoption relocates this.

Open items judged proposal-level, not user decisions: wave progress bar placement (lean: in
or under the top bar), exact confirm/cancel affordance for tap-placement (lean: floating
✓/✕ pair beside the ghost), breakpoint value for the mobile layout swap, Material Symbols
subset strategy, and how the ARCHITECTURE.md §9 "no framework" note gets amended to record
the Tailwind decision.
