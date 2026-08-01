# Phase 2 — Theft & Maze

## Why

Phase 2 is the POC's go/no-go gate: build a maze, watch thieves carry your money back out through
it, and judge whether that round trip is worth building a game on. As scoped in the original
roadmap, nothing could deal damage — so maze length affected nothing, every theft was a guaranteed
total loss, and the gate's central question ("is the return trip tense?") was unanswerable by
construction. Exploration (2026-08-01) resolved this: **scope is raised to include one minimal
working tower**, so interception is possible, maze length matters, bounties give the economy an
income side, and gold sacks occur organically instead of via a debug key.

## What Changes

- **Placement**: wall (1×1) and rapid-fire tower (2×2) placement charged against the treasury, with
  full validation (bounds, unoccupied, no enemy in footprint, every active spawn still reaches the
  treasury, every live enemy still reaches its current goal). Rejected placements leave simulation
  state untouched. Removal with the 4.0 s / 80-tick delay, tile blocked throughout, 50% refund
  (`balance.json` knob).
- **Live re-pathing**: flow fields rebuild on any blocked-mask change; enemies re-read at their next
  waypoint — and immediately, mid-stride, when a mask change invalidates their committed waypoint
  (waypoint tile blocked, or a committed diagonal's flanking tile blocked).
- **Theft economy**: `inbound`/`returning` state machine; treasury grab of
  `min(carryCapacity, max(0, balance))` with unconditional flip to returning; carriers at 80%
  speed; gold sacks with insertion-order pickup and inbound-flips-on-pickup; gold escaping through
  a spawn is gone; spending permitted at balance ≥ 0 even into debt, blocked while balance < 0.
- **Minimal rapid-fire tower** (raised scope, pulled from Phase 3): fixed stats, hitscan on the
  firing tick, first-along-path targeting, render-only tracer; kills pay bounties to the treasury;
  killed carriers drop their sack on their tile. Enemies gain `hp`. No upgrades, no other
  archetypes, no enemy variety — those stay in Phase 3.
- **UI**: treasury readout, build palette (wall + rapid-fire tower) with affordability and
  debt-warning states, removal countdown, pointer → tile → command. Ghost placement preview driven
  by the same validation function the simulation uses; a range ring on tower ghost and selection
  (pulled from Phase 3 — without it, placement is blind). Any invalid click — red ghost or a
  stale-green race loss — produces the same red-flash reject with no command effect and no charge.
- **Docs**: ROADMAP.md updated to record the scope raise (Phase 2 gains the minimal tower, bounty,
  organic sack drops, range ring; Phase 3's exclusion list and Phase 2's "debug-key sacks" line
  amended accordingly).

## Capabilities

### New Capabilities

- `structure-placement`: wall and tower placement, the validation pipeline, rejection semantics,
  removal delay and refund, and treasury charging.
- `theft-economy`: the inbound/returning state machine, treasury grabs, carrier behavior, gold
  sacks (drop, pickup, contention order), escape, and the spending gate.
- `tower-combat`: the single rapid-fire tower — deterministic targeting, hitscan damage, kill
  bounties, carrier sack drops, and its render events.
- `build-ui`: HUD, build palette, ghost preview and reject feedback, range ring, removal countdown,
  and pointer-to-command input.

### Modified Capabilities

- `flowfield-pathfinding`: waypoint commitment gains an invalidation rule (mask changes can force an
  immediate mid-stride re-read); the Phase-1 despawn-at-treasury lifecycle is replaced by handoff to
  the theft state machine.

## Impact

- **Depends on `phase-1-foundation-spike`** — its sim core, flow fields, renderer, and isometric
  camera are the substrate; that change must be implemented first.
- **Code**: fills the existing stubs `sim/placement.ts`, `sim/economy.ts`, `sim/tower.ts`,
  `sim/commands.ts`; extends `sim/enemy.ts` (state machine, hp, carry), `sim/sim.ts` (tick steps
  2–3, 6–8), `sim/hash.ts` (every new state field enters the canonical walk); fills
  `render/towers.ts`, `render/fx.ts`, parts of `render/debug.ts`; fills `ui/hud.ts`,
  `ui/palette.ts`, `ui/input.ts`; adds tower/enemy stats to `data/balance.json`.
- **Tests**: `placement.test.ts`, `theft.test.ts`, tower targeting/bounty coverage, and the
  Phase-1 replay/hash tests extended over the new state.
- **Docs**: ROADMAP.md scope edit described above.
