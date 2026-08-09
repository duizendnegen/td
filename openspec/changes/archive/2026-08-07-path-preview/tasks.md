## 1. Simulation layer — route tracing

- [x] 1.1 Add `tracePath(field, grid, from)` to `src/sim/flowfield.ts`: a `nextTile` loop appending
  tiles until `nextTile` returns null, capped at `grid.width * grid.height` steps (design D2).
  Integer-only, no float, no imports outside `sim/`.
- [x] 1.2 Add tests to `tests/flowfield.test.ts`: trace from a spawn reaches the treasury and each
  consecutive pair matches that tile's field direction; trace from an unreachable tile yields no
  onward route; trace from a source tile is that tile alone; tracing from every tile of a board
  terminates.

## 2. Simulation layer — the preview entry point

- [x] 2.1 Add a read-only `previewRoutes(kind, tx, ty)` to `src/sim/sim.ts` returning
  `{ verdict, lanes, orphaned }` (design D3). It runs the existing `validatePlacement`, then traces
  out of `scratch` **before returning**, so callers receive copied arrays.
- [x] 2.2 Return `lanes: null` for every verdict that returns before `scratch` is rebuilt
  (`no-funds`, `out-of-bounds`, `not-buildable`, `occupied`, `enemy-in-footprint`, and the socket
  `ok` path) — see the verdict table in `proposal.md`.
- [x] 2.3 On `seals-spawn`, collect every walkable tile whose projected inbound cost is
  `UNREACHABLE` into `orphaned`; leave it null otherwise (design D6).
- [x] 2.4 Add a read-only accessor for the **current** lanes: one trace per active spawn through
  `inbound`, one from the treasury through `returning`.
- [x] 2.5 Leave `previewPlacement` in place and unchanged for verdict-only callers.
- [x] 2.6 Add tests: `previewRoutes` does not alter the state hash; a result held across a second
  `previewRoutes` call and across a confirmed placement is unchanged (the `scratch` swap at
  `sim.ts:361-365`); `lanes` is null for each of the six early-return verdicts; `orphaned` covers
  the west quarter for walls at (4,8)+(4,9) on level_01.

## 3. Render layer — the lane ribbon

- [x] 3.1 New ribbon layer module in `src/render/`: owns the line sets, the region shade, and the
  dash phase. Reads sim state only; never mutates it.
- [x] 3.2 Classify tiles into shared / current-only / projected-only via per-tile set comparison,
  pairing lanes by index (design D4). Emit three line sets, shared tiles drawn once.
- [x] 3.3 Marching dashes: emit the dash segment list with a per-frame phase offset scrolling
  toward each lane's destination; opposed direction on inbound versus return (design D5). No
  geometry rebuild per frame.
- [x] 3.4 Orphaned-region shading as a distinct tile fill, shown only when `orphaned` is non-null.
- [x] 3.5 Take colours from the STYLEGUIDE token set, not `debug.ts`'s literals (design D7).
- [x] 3.6 Dispose geometry and materials on rebuild and on hide, matching the existing overlay
  teardown pattern.

## 4. Wiring — arm state and evaluation cadence

- [x] 4.1 Show the ribbon while a build tool is armed; hide it on deselect and when a placed tower
  is selected for inspection.
- [x] 4.2 Drive recomputation from `InputCore`'s existing (tool, tile, tick) guard
  (`inputcore.ts:167-173`) — no new evaluation cadence (design D8).
- [x] 4.3 Guard geometry rebuild on the classification result, not just the key, so a still cursor
  over a still board does not rebuild at 20 Hz.
- [x] 4.4 With a tool armed but no ghost tile (cursor off-board), show current lanes only.

## 5. Remove F1

- [x] 5.1 Delete from `src/render/debug.ts`: `toggleFields`, `buildFields`, `buildFieldLayer`,
  `buildBlockedLayer`, the `fieldLayer`/`fieldLayerSource` members and their staleness check in
  `update()`, and the now-unused `UNREACHABLE_COLOR` / `BLOCKED_COLOR` constants. Keep
  `INBOUND_COLOR` / `RETURNING_COLOR` — F2 still uses them.
- [x] 5.2 Remove the F1 key binding in `src/app/game.ts`. Leave F2, F3, F4 and the fast-forward
  probe untouched.

## 6. Documentation

- [x] 6.1 `ARCHITECTURE.md` §11: drop the F1 row and the sentence claiming F1 is how the corner
  rule gets verified at all; point corner-rule verification at `flowfield.test.ts`.
- [x] 6.2 `ARCHITECTURE.md` §9: add the lane ribbon to the UI surface list.
- [x] 6.3 `ROADMAP.md`: update the F1 references and the Phase 2 legibility gate at line 167.

## 7. Verification

- [x] 7.1 `npm run typecheck` and `npm test` clean; confirm `replay.test.ts`'s golden hash is
  **unchanged** — this change adds no hashed state.
- [x] 7.2 Exploratory pass with the Playwright plugin: arm a tool on level_01 and confirm the two
  lanes match the traced routes (inbound col 7, return cols 5–6).
- [x] 7.3 Playwright: hover (7,3) and confirm the equal-length reroute is visible as displaced and
  newly used tiles; hover (9,5) and confirm the ribbon reads as inert.
- [x] 7.4 Playwright: place a wall at (4,9), hover (4,8), and confirm the west quarter shades as the
  orphaned region and clears when the ghost moves off.
- [x] 7.5 Playwright: sweep from a valid dirt tile onto rock and confirm no stale projected trail
  persists; repeat onto a socket tile with a tower armed.
- [x] 7.6 Playwright on level_02 past wave 6: confirm three lanes, and that the return lane runs to
  the north spawn rather than retracing the west approach.
