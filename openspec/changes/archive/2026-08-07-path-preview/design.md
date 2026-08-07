# Design — path-preview

## Context

See `proposal.md` (Why) for motivation and `specs/` for the behaviour contract. Current state that
shapes the approach:

- Both fields are live and public on `Sim` (`inbound`, `returning`, `sim.ts:44-45`), rebuilt on any
  blocked-mask or active-spawn change.
- `nextTile(field, grid, tx, ty)` (`flowfield.ts:108`) already is the per-step walk primitive. A
  route trace is a loop over it; nothing new needs computing.
- **The projected fields already exist on every hover.** `validatePlacement` tentatively blocks the
  footprint, rebuilds both fields into `scratch`, runs its checks, restores the mask, and returns
  a verdict (`placement.ts:109-133`). The post-placement routing is computed and discarded.
- `InputCore.updateBuildGhost` calls `sim.previewPlacement` only when the (tool, tile) key or the
  tick changes (`inputcore.ts:167-173`) — an evaluation cadence this change can reuse as-is.
- **`scratch` is swapped into live state on an accepted placement** (`sim.ts:361-365`), and is
  overwritten by the next `previewPlacement` call. Any reference handed outward becomes wrong.
- Five of nine verdicts return before `scratch` is rebuilt, so on those paths the buffers hold the
  *previous* hover's fields (see the table in `proposal.md` — Impact).
- `sim/` may not use floats beyond the single permitted `Math.sqrt` normalisation, must not import
  `three` or touch the DOM, and iteration order is part of the determinism contract.

Traced against the shipped levels, for grounding:

| Case | Result |
|---|---|
| level_01, no walls | inbound climbs col 7, return descends cols 5–6; both cost 26344 |
| level_01, wall (7,3) | Δ cost **0**, inbound shifts col 7 → col 6 over five tiles |
| level_01, wall (10,1) | Δ cost +600 (+0.58 tiles), right half of both lanes reshapes |
| level_01, walls (4,8)+(4,9) | west spawn cost −1; columns 0–3 orphaned entirely |
| level_02 @ wave 6 | west→treasury 16.24 tiles, treasury→**north** 9.07 tiles — no retrace |

## Goals / Non-Goals

**Goals:**

- Zero sim-rule changes and zero new hashed state. The ribbon is derived, read-only, and must not
  move the replay hash.
- Reuse the already-computed projected fields rather than adding a third field build per hover.
- Keep the trace in `sim/` so it is testable under the sim-only test policy.
- One rendering idiom for routes (classified dashed lines) plus one for the orphaned region.

**Non-Goals:**

- No per-enemy path lines, no travelling pacer, no numeric readout — all three were considered and
  rejected (D1, D5, and the spec's no-readout requirement).
- No change to placement validation rules, verdict set, or command flow.
- No bespoke visual for `strands-enemy`.
- No reinstatement of F1 under another key.
- No exposure/kill-box visualisation in this change (see Open Questions).

## Decisions

### D1 — Lanes from spawns and treasury, not routes from live enemies

The ribbon traces `(#activeSpawns)` inbound lanes plus one return lane, from fixed endpoints.

Alternative considered: trace from each live enemy's current tile. Rejected on two grounds. First,
`validatePlacement` already rejects `strands-enemy` (`placement.ts:122-129`), so the worst a live
enemy can suffer from a confirmed placement is a detour — per-enemy lines would spend 10–20
polylines showing a category of outcome validation has already made safe. Second, there is a
build phase with no enemies on the board, and per-enemy lines render nothing there.

The cost is real and accepted: mid-wave, a lane traced from the spawn does not tell you what the
pack currently at column 7 will do.

### D2 — `tracePath` in `sim/flowfield.ts`, pure and capped

```
tracePath(field, grid, from) -> Tile[]
```

A `nextTile` loop that appends tiles until `nextTile` returns null (source reached, or the start
tile was unreachable), capped at `grid.width * grid.height` steps. Integer-only, no allocation
beyond the returned array, and it sits next to the field it walks. Termination is structural — a
Dijkstra parent chain is acyclic and strictly decreasing in cost — but the cap is cheap insurance
against a malformed field and makes the "always terminates" scenario trivially true.

Placing it in `sim/` rather than `render/` is what makes it testable in `tests/flowfield.test.ts`
without a render harness.

### D3 — The sim returns copied routes, never `scratch`

A new read-only entry point returns the verdict *and* the projected routes together:

```
previewRoutes(kind, tx, ty) -> {
  verdict,                    // unchanged PlacementVerdict
  lanes:    Tile[][] | null,  // null when validation produced no post-placement routing
  orphaned: Tile[]  | null,   // non-null only on 'seals-spawn'
}
```

It calls the existing `validatePlacement`, then traces out of `scratch` **before returning**, so
the caller receives arrays that no later swap or re-evaluation can mutate. `lanes` is `null` for
every verdict that returned before `scratch` was rebuilt — which is the same set the spec says
must show no projected trail, so the forced constraint and the desired behaviour coincide exactly.

Alternative considered: expose `scratch` and let `render/` trace it. Rejected — it hands out a
buffer that becomes live state one tick later (`sim.ts:361-365`), and it would put the
stale-verdict knowledge in the renderer.

`previewPlacement` stays as-is for callers that only want a verdict; `previewRoutes` is the
superset the ribbon uses. Both run the same validation, so the ghost tint and the ribbon can never
disagree — the same invariant the ghost preview already holds.

### D4 — Per-tile set classification, not a polyline diff

Build a tile-key set from the current lanes and one from the projected lanes, then classify every
tile into shared / current-only / projected-only and emit three line sets.

Alternative considered: longest-common-prefix/suffix split on each polyline pair. Rejected — it
breaks when routes diverge, rejoin, and diverge again (a spec scenario), and needs per-lane
pairing logic that the multi-spawn case complicates. Set classification handles re-divergence for
free and is a few lines. The cost is giving up smooth line continuity across a classification
boundary; at these vertex counts (~25 tiles/lane) that is a cosmetic detail, not a legibility one.

Lanes are paired by index for classification — inbound lane *i* against inbound lane *i*, return
against return — so a change on one spawn's lane is not attributed to another's.

### D5 — Marching dashes, no pacer

Direction is carried by dash motion scrolling toward each lane's destination, driven by frame time
in `render/` and never by the sim clock.

Alternative considered: a dot per lane travelling at a reference enemy speed. Rejected on the
equal-length reroute case — level_01's `(7,3)` produces old and new lanes of identical cost, so two
dots would launch and arrive together forever, reading as a rendering bug on precisely the
placements the ribbon exists to explain. It also asserts a timing it cannot honour: speed varies by
enemy type, is ×0.8 while carrying, and is further scaled while slowed.

Implementation is a per-frame phase offset applied when emitting the dash segment list, not a
geometry rebuild — see D8.

### D6 — The orphaned region is read straight off the projected inbound cost array

On `seals-spawn`, every walkable tile whose projected inbound cost is `UNREACHABLE` is collected
into `orphaned`. This is already computed; the verdict is derived from exactly this array
(`placement.ts:116-119`).

Scoped to `seals-spawn` only. `strands-enemy` also leaves valid projected fields, but its
diagnostic (flag the specific enemy) is a third visual idiom for a rarer case, and the lanes still
route, so it takes the ordinary trail (D1's consequence, and a spec requirement).

### D7 — F1 removal is total within `render/debug.ts`

Remove `toggleFields`, `buildFields`, `buildFieldLayer`, `buildBlockedLayer`, the
`fieldLayer`/`fieldLayerSource` members and their staleness check in `update()`, the F1 key
binding, and the now-unused `UNREACHABLE_COLOR`/`BLOCKED_COLOR` constants. `INBOUND_COLOR` and
`RETURNING_COLOR` are still used by F2 and stay. `F2`, `F3`, `F4` and the fast-forward probe are
untouched.

The ribbon's colours should come from the STYLEGUIDE token set rather than inheriting `debug.ts`'s
literals — it is a player surface now, not a debug one.

### D8 — Reuse the existing (tool, tile, tick) evaluation cadence; rebuild geometry only on change

`InputCore` already recomputes the verdict only when the key or tick changes. Extend that same
guard to cover the ribbon: recompute lanes and classification on the same trigger, cache the three
line-sets plus the region shade, and let the per-frame path do nothing but advance the dash phase.

Cost per recomputation, worst case on the shipped levels: 3 current lanes + 3 projected lanes ×
~25 tiles = ~150 `nextTile` steps, plus a set build. Negligible against the two full Dijkstras
`validatePlacement` is already running on the same trigger.

Note the cadence includes *every tick* while a tool is armed and the cursor is still, so this runs
at 20 Hz during a wave. That is already true of `previewPlacement` today; the trace does not change
the order of magnitude.

### D9 — Docs updated in the same change

`ARCHITECTURE.md` §11's F1 row and the sentence claiming F1 is how the corner rule gets verified at
all; a new §9 note on the ribbon. `ROADMAP.md`'s F1 references and the Phase 2 legibility gate
(`ROADMAP.md:167`), which this change is the answer to.

## Risks / Trade-offs

**Stale `scratch` read as a valid projection** → The single highest-consequence failure: it would
draw a confidently wrong route for another tile. Mitigated structurally by D3 — the trace happens
inside the sim, immediately after validation, and returns `null` on every early-return verdict.
The renderer is never in a position to make this mistake.

**Visual density** → Up to 3 lanes × 3 classifications, plus a region shade, plus the ghost, its
range ring, and the enemies. Mitigated by drawing shared tiles once (D4), so the doubling only ever
covers the diverged span — 5–10 tiles on the traced cases, not 25 per lane. If it still reads as
noise at the playtest, the fallback is dropping the current-only class and showing the projected
routes alone.

**Loss of F1's exhaustive view** → The ribbon shows one route per lane, not every tile's direction,
so a field bug off the traced routes becomes invisible. Accepted: `flowfield.test.ts` checks the
whole board on the corner rule and cost monotonicity, which is stronger than eyeballing arrows, and
F2 still exposes per-enemy committed waypoints.

**Geometry churn at 20 Hz** → Rebuilding `BufferGeometry` every tick while armed during a wave.
Mitigated by D8's change-guard (a still cursor over a still board reclassifies to the same result,
so the guard should compare the classification, not just the key) and by animating dashes via phase
offset rather than rebuild.

**Colour collision between the orphaned-region shade and any future coverage shade** → Both are
tile fills. Only one exists in this change; noted so a later addition picks a different idiom
rather than a second fill colour.

## Migration Plan

No data migration. F1 removal is a keybinding and overlay deletion with no persisted state. Rollback
is reverting the change; nothing outside `render/debug.ts` depended on the F1 layer.

## Open Questions

- **Kill-box visibility while armed.** `inputcore.ts:174-175` shows the ghost's own range ring and
  explicitly hides everything else, so while drafting the player sees the reroute but not their own
  tower coverage — and therefore cannot judge whether a reroute is *good*. Deliberately out of scope
  here (a numeric exposure delta and a coverage shade were both considered and dropped). Whether it
  needs solving is a playtest question, and answering it later changes nothing in these specs.
- **Should the ribbon persist briefly after a placement confirms**, so the player sees the change
  land? Purely additive; a timing detail with no spec consequence.
