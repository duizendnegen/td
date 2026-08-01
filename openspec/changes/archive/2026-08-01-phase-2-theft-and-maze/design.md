# Design — Phase 2: Theft & Maze

## Context

Phase 1 delivers the substrate this change extends: the fixed-point 20 Hz sim with command queue
and canonical hash, dual flow fields with corner-cutting prevented at build time,
waypoint-committed steering, the isometric camera, and the GLB render pipeline. All Phase 2 systems
must live inside that determinism contract: integer state only, commands as the only input path,
render strictly read-only, every new state field added to the hash walk. See proposal.md for
motivation and the scope-raise rationale.

## Goals / Non-Goals

**Goals:**

- Make the placement/theft/interception loop judgeable at the phase gate with minimal new surface.
- Keep every path guarantee (no sealing, no stranding) and the rejection-is-atomic property cheap:
  one field rebuild per validation attempt, no allocation.
- Make re-pathing and rejection *legible* — the mid-stride turn and the red flash are game
  feedback, not error handling.

**Non-Goals:**

- Any second tower archetype, upgrades, targeting priorities beyond first-along-path, enemy
  variety, or status effects beyond the carried-gold indicator — all Phase 3, and requests to pull
  more forward should be refused by default.
- Waves, interest, bankruptcy loss, end-of-wave sack return — Phase 4.
- Projectile simulation. Hitscan plus render-only tracers, per ARCHITECTURE.md §7.

## Decisions

### D1 — One pure validation function, two call sites

`validatePlacement(state, footprint)` runs the full six-check pipeline against a caller-supplied
state and returns a verdict without observable mutation: the tentative mask set and inbound/returning
rebuilds happen in pre-allocated scratch buffers that are unconditionally restored (spare-buffer
swap, per ARCHITECTURE.md). The **authoritative** call happens at command apply (tick step 2); the
**speculative** call drives the ghost preview from the UI layer, re-evaluated when the hovered tile
or the tick changes — not per mouse-move.

*Alternatives rejected:* a lighter preview heuristic (drifts from the real rules and reintroduces
the lying ghost); previewing by mutate-then-revert on live state (one missed revert path corrupts
the hash; purity is cheaper to guarantee than revert completeness).

### D2 — Accept the placement, invalidate the commitment

Placement never checks enemies' committed waypoints — only their current tiles. Instead, after any
mask-change field rebuild (tick step 3), every enemy whose committed move became illegal re-reads
the field at its current tile and commits a new waypoint before movement that tick. A committed
move is illegal iff its waypoint tile is blocked, or it is diagonal and either flanking orthogonal
tile is blocked. These are the only two ways a legal commitment can become illegal; removal
(unblocking) never invalidates, so enemies pick up improvements at their natural next re-read.

*Alternatives rejected:* rejecting placements that contain committed waypoints (every enemy
projects a two-tile blocking shadow — building near a busy corridor becomes near-impossible and
the ghost flickers as enemies stream past); letting the enemy reach the blocked waypoint and fix
on arrival (visibly walks into a wall at the exact moment the player is watching).

### D3 — Refund 50%, credited at removal completion

The refund fraction lives in `balance.json`. Crediting at countdown *expiry* (not at removal
initiation) keeps the delay meaningful for money as well as pathing: gold parked in walls is
illiquid for the full 4 s.

*Alternatives rejected:* full refund (walls become a theft-proof vault for the whole balance);
zero refund (punishes exactly the maze rework this phase must evaluate); credit at initiation
(makes the anti-juggling delay free from the economy's side).

### D4 — Spending gated at zero, not at cost

Literal reading of the README: balance ≥ 0 permits any purchase, including into debt; balance < 0
blocks all spending. The overdraft emergency wall is a deliberate money-as-health decision, kept
honest by the palette's debt-warning state. In this phase debt is recoverable via bounties.

*Alternative rejected:* requiring cost ≤ balance — simpler, but deletes a genuinely interesting
decision and contradicts both README and ROADMAP wording.

### D5 — "First along path" = minimal inbound-field cost

Target selection: among in-range enemies (squared fixed-point distance), pick minimal inbound-field
cost at the enemy's current tile; tie-break by insertion order. Inbound cost is a ready-made,
already-deterministic "progress toward the treasury" measure, and it needs no new per-enemy state.
Note the pleasant consequence: returning carriers near the treasury have *low* inbound cost, so a
just-robbed carrier is naturally prioritized over fresh inbound enemies at the same range.

*Alternatives rejected:* accumulated travel distance (new hashed state per enemy for no behavioral
gain at this scope); nearest-to-tower (not "first", makes placement position less meaningful).

### D6 — Tick-order integration and hash coverage

New work slots into the Phase-1 tick loop exactly as ARCHITECTURE.md §7 prescribes; no reordering:

| Step | Addition |
|---|---|
| 2 Apply commands | place / remove commands, authoritative validation, treasury charge |
| 3 Removal timers / field rebuild | countdown advance, expiry refund + unblock; **commitment invalidation sweep after any rebuild** |
| 5 Movement | 80% carrier speed factor, integer math `(speed * 4) / 5` |
| 6 Arrival | treasury grab + flip; spawn escape despawn; sack pickup in insertion order |
| 7 Towers | fire-tick check, D5 targeting, hp decrement, tracer event |
| 8 Deaths | bounty credit, carrier sack drop, tombstone |

Every new field — tower array, sack array, removal countdowns, enemy `hp` / `state` / `carried`,
treasury — enters the canonical hash walk in this same change, per the deterministic-sim spec.

### D7 — Sacks: flat insertion-ordered array, merged per tile

Sacks live in a flat array like enemies. A carrier dying on a tile that already holds a sack merges
into it (amount adds) rather than creating a second sack — one sack per tile keeps pickup
resolution and rendering trivially deterministic with no sub-ordering questions.

### D8 — Rejection feedback rides the render-event channel

An apply-time rejection emits a `placementRejected { footprint }` render event on the same
sim→render event queue as tracers: drained by the renderer, never read back, excluded from the
hash. The UI plays the identical red flash for local red-ghost clicks without involving the sim, so
both paths converge on one feedback implementation in the renderer.

## Risks / Trade-offs

- [The one tower's numbers decide whether the gate is judgeable — too weak and tension collapses,
  too strong and theft never hurts] → all stats are `balance.json` knobs; tune to "kills a carrier
  sometimes on a good maze" before judging the gate, and treat tuning sessions as part of this
  phase's deliverable.
- [Speculative validation runs a Dijkstra rebuild up to 20×/s while hovering] → 600-tile bucket
  queue rebuilds are well under a millisecond (Phase-1 measurement); if it ever shows up in
  profiles, throttle preview re-evaluation, never weaken purity.
- [New state fields silently missed by the hash walk would void replay guarantees] → extend
  `replay.test.ts` golden hashes over a scripted Phase-2 session (build, remove, theft, kill,
  sack pickup) so any missed field diverges loudly.
- [Scope creep: "while we're adding one tower…"] → the Non-Goals fence; any addition beyond the
  single rapid-fire tower requires reopening the proposal.

## Open Questions

- Exact starting values for tower damage/range/interval, enemy hp, bounty, and the refund fraction
  — deliberately deferred to `balance.json` tuning during this phase; none change specs or tasks.
- Red-flash duration and styling — cosmetic, decided in implementation.
