# Roadmap

Four phases, risk-first. See [ARCHITECTURE.md](ARCHITECTURE.md) for the decisions behind them and
[README.md](README.md) for the game design.

**Every phase is a vertical slice.** Each one ends with something that boots, runs end-to-end, and is
deployed to the live link — never a layer that only makes sense once the next layer arrives.

**Every phase ends at a gate**, which is a judgement call made by playing, not a checklist. A gate can
fail. Failing a gate early and cheaply is what this ordering is for.

---

## Phase ordering rationale

The two things that can invalidate the whole approach are **fixed-point determinism** and **the WebGL
pipeline**. Neither is a gameplay question, and both are expensive to discover late — a determinism
retrofit is a rewrite of `sim/`, and a renderer swap is a rewrite of `render/`. So Phase 1 proves both
together, with the minimum gameplay needed to make them observable.

Gameplay risk is then retired in the README's own priority order: the theft loop first, because if the
round trip is not fun, nothing layered on top of it will be.

| Phase | Retires the risk that… | Duration feel |
|---|---|---|
| 1 — Foundation | …the deterministic sim and 3D pipeline don't hold up | Longest setup, least visible output |
| 2 — Theft & Maze | …the core loop isn't fun | The real go/no-go |
| 3 — Combat | …the rock-paper-scissors doesn't read | Widest surface area |
| 4 — The Run | …a full session doesn't hold together | Mostly composition |

---

## Phase 1 — Foundation Spike

> **Prove the groundwork.** A deterministic fixed-point simulation, a three.js pipeline rendering the
> Kenney kit, the isometric camera, and the debug tooling to see inside all of it.

### Scope

**Project setup**
- `git init`, GitHub repo, GitHub Pages via Actions on push to `main`
- Vite 8 + TypeScript 7 + Vitest 4, strict mode, `base: '/td/'`
- The ~18 GLBs actually used copied into `public/models/` alongside `colormap.png`

**Sim core** (`sim/`)
- `fixed.ts` — `TILE = 1024`, helpers, the one permitted `Math.sqrt` normalisation
- `rng.ts` — seeded xoshiro128\*\*
- `hash.ts` — FNV-1a over canonical state
- Fixed 20 Hz accumulator loop with catch-up clamp
- Command queue applied at tick boundaries
- `grid.ts` — tile storage and blocked mask
- `flowfield.ts` — **both** fields, 8-connected, integer costs, corner-cutting prevented at build time
- One enemy type, spawning on a timer, steering waypoint-to-waypoint toward the treasury

**Render** (`render/`)
- GLB loading, one shared material from `colormap.png`
- 600 ground tiles merged to a single draw call
- Enemy meshes with procedural hover bob and yaw spin
- `prevPos`/`pos` interpolation against the accumulator alpha
- **The isometric camera** — fixed-yaw orthographic projection framing the whole board

**Debug** (`render/debug.ts`)
- `F1` flow-field arrows · `F2` enemy state and waypoints · `F4` tick / hash / ms-per-tick readout

**Data** — `level_01.json` with hand-placed terrain, one spawn, and a zod schema that validates it

**Tests** — `flowfield.test.ts`, `fixed.test.ts`, `replay.test.ts`

### Explicitly not in this phase

No placement, no towers, no theft, no economy, no waves, no HUD beyond the debug readout. Enemies
reaching the treasury simply despawn.

### Deliverable

A deployed link where enemies walk from spawn to treasury through a hand-authored maze. `F1` shows the
flow field. `F2` shows each enemy's committed waypoint. `F4` shows a state hash that is identical on
every reload with the same seed.

### Gate

- [ ] Same seed → identical state hash after 2 000 ticks, across reloads **and** across two machines
- [ ] `F1` shows zero diagonals cutting between two blocked tiles
- [ ] Movement is smooth at 60 fps display against a 20 Hz sim — interpolation is doing its job
- [ ] The kit renders correctly: one material, one atlas, no missing-texture warnings
- [ ] **The isometric view is legible** — 1-wide gaps, tower footprints (2×2 at the time; 1×1
      since Phase 3), and height differences all read at a glance — the first real read on POC
      goal #3
- [ ] Sim tick cost leaves ample headroom (target: well under 1 ms with 50 enemies)

**If this gate fails:** the failure is almost certainly the camera criterion, not the technical ones.
If occlusion behind tall objects or the diamond framing hurts maze legibility, steepen the pitch
toward top-down and re-judge — the isometric look is negotiable, legibility is not.

---

## Phase 2 — Theft & Maze

> **The core loop.** Build a maze, watch thieves take your money through it and carry it back out. The
> README's "watch the theft round-trip before building anything else" — and the phase that decides
> whether this game is worth making.

### Scope

**Placement** (`sim/placement.ts`)
- Wall (1×1) and tower-footprint (2×2 at the time; all structures 1×1 since Phase 3) placement,
  charged against the treasury
- Full validation: in bounds, unoccupied, **no enemy standing in the footprint**, every active spawn
  still reaches the treasury, **and every live enemy still reaches its current goal**
- Rejected placements revert the mask and restore the previous field with no allocation
- Removal **immediate and refused during a wave**: unblock, refund and drop in the command's tick
- Live re-pathing: fields rebuild on mask change, enemies re-read on their next waypoint

**Theft economy** (`sim/economy.ts`, `sim/enemy.ts`)
- `inbound` / `returning` state machine
- Treasury arrival: grab `min(carryCapacity, balance)`, flip to returning, path to nearest active spawn
- Carriers move at 80% speed
- Gold sacks on the ground; any enemy walking over one picks up to remaining capacity; an inbound
  enemy that picks up **immediately flips to returning**
- Gold escaping through a spawn is gone
- Treasury in milli-gold; spending blocked while `balance < 0`

**Minimal tower combat** (`sim/tower.ts`) — *scope raised 2026-08-01*
- Originally nothing in this phase could deal damage, which made the gate unjudgeable: maze length
  affected nothing and every theft was a guaranteed total loss. The scope was deliberately raised to
  pull **one minimal rapid-fire tower** forward from Phase 3: fixed stats from `balance.json`,
  hitscan on the firing tick, first-along-path targeting, render-only tracer
- Kill **bounties** credit the treasury — the economy's income side
- Killed carriers **drop their sack organically** where they die (replacing the planned debug-key
  sack spawner)
- No upgrades, no other archetypes, no enemy variety — those remain Phase 3

**Render**
- Kit-composed tower (square base + turret) and placeholder wall meshes at correct footprints
- Gold-sack meshes on the ground, carried-gold indicator above carriers
- Ghost placement preview tinted valid/invalid/debt, driven by the **real** validation function
- **Range ring** on the tower ghost and on a selected tower (pulled from Phase 3 — without it,
  tower placement is blind)

**UI** (`ui/`)
- Minimal HUD: treasury readout, build palette (wall + rapid-fire tower) with affordability and
  debt-warning states, remove tool locked during waves
- Pointer → ground raycast → tile → command

**Tests** — `placement.test.ts`, `theft.test.ts`, `tower.test.ts`

### Explicitly not in this phase

No waves, no interest, no upgrades. No second tower archetype, no targeting priorities beyond
first-along-path, no enemy variety, no status effects — the rapid-fire tower is deliberately the
*only* thing that can kill, and everything else combat-shaped stays in Phase 3.

### Deliverable

A deployed link where you build a maze with walls and one tower type, watch enemies re-route live,
watch them reach the treasury, steal, slow down, and carry your money back out through the gauntlet
you built — and sometimes die on the way, dropping the gold for the next thief. Sealing the maze is
impossible; removing a wall takes four seconds.

### Gate — the go/no-go

- [ ] **Does the theft round trip feel good?** Is watching a carrier walk back out through your maze
      tense, or merely a second walk animation?
- [ ] Does mazing feel expressive? Do 1-wide gaps between structure footprints create interesting
      shapes? *(Playtest verdict: not with 2×2 towers — they could not join wall lines, which led
      directly to the Phase-3 1×1 rework.)*
- [ ] Is re-pathing legible — can you see enemies react to a wall you just placed?
- [ ] Does money-as-health land emotionally, or does it just read as an abstract number?
- [ ] Sealing is genuinely impossible; the stranded-enemy case is caught

**If this gate fails, stop.** Every later phase is layered on top of this loop. Placing towers on a
round trip that isn't fun produces a more elaborate game that still isn't fun. This is the cheapest
place the project can be killed or redirected, and that is precisely why it is Phase 2.

---

## Phase 3 — Combat

> **Rock-paper-scissors.** Four tower archetypes with three upgrade levels each, three enemy types, and
> the targeting priorities that make placement position meaningful.

### Scope

**Footprint rework** (`sim/placement.ts`) — *scope added 2026-08, from the Phase-2 gate*
- **All structures become 1×1** (breaking: placement spec + golden replay hashes). The Phase-2
  playtest verdict was that mazes are built from 1×1 wall lines and a 2×2 tower cannot be a
  segment of one — towers sat outside the game's core vocabulary. Towers are now wall segments
  that shoot; wall vs tower is purely an economic choice.

**Towers** (`sim/tower.ts`)
- Four archetypes with fixed targeting priorities — the rapid-fire baseline shipped minimally in
  Phase 2 (scope raise); Phase 3 adds the other three and retrofits upgrades onto rapid fire:

  | Tower | Role | Priority | Kit model |
  |---|---|---|---|
  | Rapid fire | Single-target DPS baseline | First along path | square + `weapon-turret` |
  | Sniper | Anti-armour, long range | **Carriers first**, then strongest | square + `weapon-ballista` |
  | Area damage | Anti-swarm | First | square + `weapon-catapult` |
  | Slow | Force multiplier, no kill power | First | round + `tower-round-crystals` |

- Hitscan resolution, damage on the firing tick, render-only tracer events (mechanism built in
  Phase 2; extended to the new archetypes here)
- Three upgrade levels per tower, dual-axis per archetype, with hand-authored stat rows and each
  level's cost matched to its compounded power (~1.7×) so upgrade-vs-expand stays a spatial
  choice rather than an economic one
- Slow does not stack — `slowUntil = max(...)`
- Kill bounties and carrier sack drops (built in Phase 2) extended across all archetypes

**Enemies**
- Swarm (punishes no AoE), Tank (punishes no sniper), Runner (punishes no slow)
- Stat blocks in `balance.json`: `hp, speed, carryCapacity, bounty, slowImmune`
- One slow-immune type reserved for later waves

**Render**
- **Modular tower composition** — upgrade level adds a segment, so towers visibly grow (spire
  proportions re-judged at the 1×1 footprint)
- Weapon head yaws toward its current target (cosmetic)
- Tracers, muzzle flashes, impact effects, AoE burst
- Status icons hovering above enemies: carrying gold, slowed
- `F3` debug: tower ranges and target lines

**UI**
- Full build palette with costs and affordability states (wall + rapid fire shipped in Phase 2)
- Tower inspector: level, stats, upgrade cost, remove-with-countdown
- Range preview on hover and on selection (shipped for rapid fire in Phase 2)

**Tests** — targeting priority selection, slow non-stacking, upgrade cost curve, bounty accounting

### Explicitly not in this phase

No waves — enemies still spawn on a debug timer. No interest, no bankruptcy, no level progression.

### Deliverable

A deployed link with the complete tactical layer. Build all four towers, upgrade them, watch them
visibly grow, and watch each enemy type punish the archetype you left out.

### Gate

- [ ] **Do the counters read without explanation?** Does a swarm burst visibly punish missing AoE?
- [ ] Does the sniper's carrier priority make treasury-side placement feel like a distinct role from
      spawn-side? This is the mechanic that gives the maze two meaningful ends
- [ ] **Do walls and towers compose into a single mazing vocabulary?** Does slotting a tower into
      a wall line feel like building one maze, not placing two kinds of object?
- [ ] Is the upgrade-as-height read strong in the isometric view — do taller towers read as more
      powerful at a glance?
- [ ] Do the four archetypes feel distinct, or do two of them collapse into "the damage tower"?
- [ ] Is the maze still defending twice — do returning carriers actually die on the way out?

---

## Phase 4 — The Run

> **A complete session.** Hand-authored waves, interest, the solvency gate, two levels, win and lose
> states. Everything already exists; this phase composes it into something you can sit down and play.

### Scope

**Waves** (`sim/waves.ts`)
- Wave loader from JSON: groups with `spawn`, `type`, `count`, `spawnInterval`, `delay`
- **Strictly sequential**: a wave is active until every enemy it spawned is dead or escaped
  (fleeing carriers included); the next starts only by player command
- 10 hand-authored waves per level, curve-designed to teach the counters — runners introduced around
  wave 3, a tank check around wave 5, a swarm check around wave 7
- Multi-spawn activation by wave: a second front opening mid-run reshapes the maze problem;
  placement validation protects dormant spawns' paths from tick 0
- Build phase with **no timer**; building during waves allowed and instant

**Economy completion**
- Theft **overdraws** the treasury: a grab is always full carry capacity, so raids drive the
  balance negative — killing the carrier and settling the wave brings the gold home
- Interest accrual — during waves only, on positive balance only
- End-of-wave settlement: unclaimed sacks return, interest stops, progression is judged
- **Solvency gate instead of a bankruptcy threshold**: starting the next wave requires balance ≥ 0;
  wave-locked recovery runs on structure refunds alone; **no automatic loss** — the player concedes,
  and the UI flags when liquidation cannot cover the debt
- Win: survive all 10 waves **and end solvent** — an indebted finish must liquidate to ≥ 0 to claim it

**Terrain palette**
- Four authored kinds via char-map: dirt (navigable, buildable), grass and rock (scenery),
  socket (towers only, validation-free — a level-authoring balance knob)

**Levels**
- `level_01` — one spawn, teaches the loop
- `level_02` — two spawns with the second activating mid-run, slow-immune brute in the back half

**UI**
- Wave counter and preview of what is coming, marking newly activating spawns
- Start-wave control with the solvency lock; concede control with the impossible-recovery notice
- Win / lose screens with a run summary — gold stolen, gold escaped, kills, final balance

**Tests** — `economy.test.ts`, `waves.test.ts`, `level.test.ts`, placement terrain cases,
regenerated golden replays

### Deliverable

The complete POC. A shareable link where someone who has never seen it can play two levels of ten
waves each, from first wall to victory or concession.

### Gate

- [ ] Does a full 10-wave run hold together, with tension that builds rather than plateaus?
- [ ] Does the wave curve teach the rock-paper-scissors without a tutorial?
- [ ] Does the second spawn opening genuinely reshape the maze problem, or is it just more enemies?
- [ ] **Does uncapped interest self-balance?** Does hoarding-versus-defending feel like a real
      decision, or does one strategy dominate?
- [ ] Is going negative a recoverable warning rather than a formality before losing?
- [ ] Can a newcomer play unaided?

---

## What the POC answers

Mapped back to the README's four goals:

| Goal | Answered by |
|---|---|
| 1. Dynamic maze-building with live re-pathing | Phase 2 gate |
| 2. Treasury/theft economy — money is health | Phase 2 gate (feel), Phase 4 gate (balance) |
| 3. Isometric camera view | Phase 1 gate (legibility), Phase 3 gate (upgrade-as-height read) |
| 4. Four towers vs three enemies, RPS pressure | Phase 3 gate |

Note that goal #3 is judged twice and is the cheapest goal to compromise on — if the isometric look
ever conflicts with legibility, the pitch steepens and the look loses. It is the only goal the README
itself already marks as cosmetic for now.

---

## Deferred past the POC

Not gaps — deliberate exclusions, recorded in [ARCHITECTURE.md §14](ARCHITECTURE.md#14-explicitly-out-of-scope).

The largest is **co-op**. No transport is built, but the groundwork is: bit-deterministic simulation,
commands as the only input path, and a render layer that never mutates state. Adding a networked
command source replaces `app/`, and neither `sim/` nor `render/` changes.

The second is **simulated projectiles**. Hitscan was chosen for the POC's small deterministic surface;
adding a real lobbed arc for the area-damage tower is additive — one entity array and one step in the
tick order — and is the one place travel time would carry genuine balance weight.

---

## Open questions carried into playtesting

Answered by playing, not by argument. Full list in
[ARCHITECTURE.md §15](ARCHITECTURE.md#15-open-questions).

1. Does free re-mazing between waves flatten the difficulty curve, or is the 50% refund brake enough?
2. Does turn-around penalisation become necessary, or does the no-selling-during-a-wave rule alone
   kill juggling?
3. Does uncapped interest self-balance?
4. Is a flat per-wave stipend needed against the death spiral? (Only if testing demands it — never by
   softening theft itself.)
