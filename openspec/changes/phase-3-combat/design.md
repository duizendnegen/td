# Design — Phase 3: Combat

## Context

Phase 2 delivered the substrate: placement/removal with atomic rejection, the theft loop, one
rapid-fire tower with first-along-path targeting (archived D5: minimal inbound-field cost, ties
by insertion order), bounties, sack drops, render events, and hash coverage over all of it. This
change differentiates that machinery — archetypes, upgrades, enemy variety — inside the same
determinism contract: integer state only, commands as the only input path, render strictly
read-only, every new field in the hash walk. Motivation and the two playtest verdicts (1×1
footprint, one-tower-beats-all) are in proposal.md; the full exploration trail is
`openspec/phase-3-exploration.md`.

## Goals / Non-Goals

**Goals:**

- Make the counter matrix judgeable: every archetype and enemy type distinct, mono-archetype
  defenses punishable, verified mechanically before being judged by feel.
- Keep each new archetype exactly one new mechanism (cascade / burst / status) on shared
  machinery — no per-archetype special cases beyond its stat block and priority.
- Make the 1×1 rework a simplification, not a parallel path: one footprint rule for all
  structures.

**Non-Goals:**

- Waves, interest, bankruptcy loss, multi-spawn activation — Phase 4. `sim/waves.ts` stays
  empty; the debug preset expander must not grow into a wave scheduler.
- A general status-effect system. Slow expiry is one field; carried-gold and slowed remain the
  only enemy statuses (ARCHITECTURE.md exclusion holds).
- Simulated projectiles. The area burst is hitscan on the firing tick; the lobbed arc remains
  deferred past the POC.

## Decisions

### D1 — All structures 1×1; towers are wall segments that shoot

Playtest verdict: mazes are built from 1×1 wall lines, and a 2×2 tower cannot be a segment of
one, so towers sat outside the game's core vocabulary. `footprintFor` returns a single tile for
every structure kind; the NW-anchor concept, multi-tile enemy-in-footprint checks, and the 2×
render scale (kit models are natively 1×1) are all deleted. Wall vs tower becomes purely
economic. The validation pipeline, removal, and refund logic are untouched.

*Alternatives rejected:* keeping 2×2 with cheaper pocket tools (fights the symptom, not the
vocabulary mismatch); mixed footprints per archetype (reintroduces the mismatch for some towers
and doubles ghost/validation surface).

### D2 — Explicit per-level stat tables; dual axes per archetype; cost matched to power

Each archetype's three levels are hand-authored integer rows in `balance.json` — nothing is
computed from a multiplier, because 20 Hz fire intervals are small integers where percentage
scaling is lumpy (8 → 6 → 5), and damage is tuned per row to hit the intended product. Scaling
axes per archetype: rapid = rate + damage, sniper = range + damage, area = range + damage,
slow = range + duration. Non-axis stats (rapid's range, burst radius, slow %) repeat verbatim
across rows so the schema stays uniform. Authoring guidance, not code: ~1.3× per stat, with the
cost row matched to the *compounded* power (~1.7×/level) so gold-per-output stays flat and
upgrade-vs-expand is a spatial choice (concentration vs coverage), not an economic dominant
strategy.

*Alternatives rejected:* formula-derived levels (rounding drift, untunable rows); 1.5× cost
against ~1.7× power (always-upgrade dominance the single-spawn Phase-3 playtests could not
detect — the counterweight, multi-spawn levels, only arrives in Phase 4).

### D3 — Refund base: total invested

Extends archived Phase-2 D3 by one word: 50% (the balance-data fraction) of base cost plus all
upgrade costs, credited at removal completion. Base-only refunds punish the upgrade-then-rework
loop the maze game wants; anything above 50% recreates the towers-as-vault problem the original
decision rejected.

### D4 — Slow: targeted shot, single global percentage, duration-scaling

Slow fires like any tower — first-along-path target on its fire interval — and sets
`slowUntil = max(slowUntil, tick + durationTicks)`, exactly the ARCHITECTURE.md one-liner. The
slow percentage is one global balance value across all levels; upgrades buy range and duration.
This keeps slow to a single hashed field per enemy (`slowUntil`); strength-scaling would demand
a second field plus a strongest-wins overlap rule — the status-effect system the Non-Goals
fence excludes. Speed composition order is fixed: apply the carrier factor first
(`(speed * 4) / 5`), then the slow percentage, each in integer math — pinned by test since the
two orders round differently.

*Alternatives rejected:* aura/field slow (a second application mechanism; the ROADMAP's stated
"First" priority already implies a targeted shot); per-level slow strength (see above).

### D5 — Sniper cascade: static keys only

Carriers (`carried > 0`, never the state flag — empty treasuries and debt produce zero-carry
returners in exactly the desperate moments that matter) by minimal *returning*-field cost
(closest to escaping); otherwise highest stat-block hp, then minimal *inbound*-field cost, then
insertion order. Every key is static over a target's in-range lifetime, so focus fire emerges
without target-persistence state — zero new hashed fields, stateless per firing tick like D5 in
the Phase-2 archive. The two flow fields become the two priorities: rapid/area/slow read the
inbound field, the sniper's carrier rule reads the returning field — the maze's two ends.

*Alternatives rejected:* current-hp "strongest" (oscillates between equal tanks, spreads damage,
kills nothing); most-gold carrier priority (a mid-maze rich carrier is not urgent; the one about
to escape is).

### D6 — Area burst: target position center, flat damage, instant

Target chosen by first-along-path, then flat damage to every enemy within `radiusSq` of the
target's fixed-point position — the same squared-distance idiom as range checks, no new
geometry. No falloff (legibility over tuning surface), no cosmetic arc (damage lands on the
firing tick; an arc would show enemies dying before the rock arrives). One `aoeBurst` render
event. Multi-kill ticks need no new rules: bounty credits are sums and same-tile carrier deaths
merge under the archived D7 sack rule — order-stable, not order-dependent.

### D7 — Within-tick firing: insertion order, skip the dead

Towers resolve in insertion order; selection sees only `hp > 0` at that tower's moment, so
corpses are never shot. Accepted consequence: build order is faintly gameplay-visible (the older
tower fires first). Pinned by test precisely because it is the kind of emergent tie-break a
refactor silently breaks, and every golden replay hash depends on it.

### D8 — Burst presets expand app-side

Presets (`{type, count, spawnInterval}` groups, deliberately shaped like Phase-4 wave groups)
are expanded by `app/` into ordinary typed spawn commands injected at future tick boundaries.
The sim holds no schedule state; replays record the commands and reproduce bursts without the
panel. Phase 4 decides where real waves live, unprejudiced.

### D9 — Leak-rate harness: the counter matrix as executable checks

Headless scripted runs: an authored defense layout at fixed spend versus an authored burst,
measuring gold leaked through spawns. Assertions are directional (mono-rapid vs runner burst
leaks above a threshold; rapid+slow at the same spend leaks below one), with layouts, bursts,
and thresholds versioned as test data. Thresholds are authored during tuning; the direction of
each assertion is the contract. This is the same move golden replay hashes made for
determinism, applied to balance.

### D10 — Migration and hash sequencing

Tower state gains `archetype` and `level`; enemies gain `type` and `slowUntil`; all enter the
canonical hash walk. Both this and the 1×1 change invalidate Phase-2 golden replay hashes, so
the sequence is: footprint change first, then state-shape changes, then re-author balance
against the harness, then regenerate golden hashes exactly once over a scripted session
exercising every new mechanic (typed spawns, all four archetypes, an upgrade, a multi-kill, a
slow, a removal refund with upgrades).

## Risks / Trade-offs

- [Two archetypes collapse into "the damage tower" at the gate] → the axis split is the
  structural defense (rapid never gains range, sniper never gains rate); the harness catches
  economic collapse, the gate judges feel — tune stat rows, not mechanisms.
- [Upgrade-as-height fails at 1×1 spire proportions] → segment heights are render-only
  cosmetics; adjust proportions freely, criterion re-judged at the gate.
- [The harness bakes in bad thresholds and calcifies wrong balance] → thresholds live in test
  data with the tuning sessions; directional assertions stay, numbers move.
- [Preset expander drifts toward a wave scheduler] → Non-Goals fence: it may only inject spawn
  commands; any wave state (active wave, wave index, interest hooks) is a Phase-4 reopening.
- [Golden-hash regeneration masks a real determinism break] → regenerate once, at the end, from
  a session that exercises every mechanic; any later divergence is a bug, never re-regenerated
  away.

## Open Questions

- Wall → tower swap friction: converting a wall now means remove (4 s) + place. Possibly good
  commitment friction, possibly worth a swap command — decided by playtesting, changes nothing
  in this change's specs or tasks.
- Exact stat rows, burst compositions, and harness thresholds — authored during tuning against
  D9; deliberately not fixed here.
- FX and status-icon styling — cosmetic, decided in implementation.
