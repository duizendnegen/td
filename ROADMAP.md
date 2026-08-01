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
> Kenney kit, both cameras, and the debug tooling to see inside all of it.

### Scope

**Project setup**
- `git init`, GitHub repo, GitHub Pages via Actions on push to `main`
- Vite 8 + TypeScript 7 + Vitest 4, strict mode, `base: '/peptd/'`
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
- **Both cameras** — ortho architect and perspective commander — with the eased toggle

**Debug** (`render/debug.ts`)
- `F1` flow-field arrows · `F2` enemy state and waypoints · `F4` tick / hash / ms-per-tick readout

**Data** — `level_01.json` with hand-placed terrain, one spawn, and a zod schema that validates it

**Tests** — `flowfield.test.ts`, `fixed.test.ts`, `replay.test.ts`

### Explicitly not in this phase

No placement, no towers, no theft, no economy, no waves, no HUD beyond the debug readout. Enemies
reaching the treasury simply despawn.

### Deliverable

A deployed link where enemies walk from spawn to treasury through a hand-authored maze. `F1` shows the
flow field. `F2` shows each enemy's committed waypoint. Tab swaps between the architect and commander
views. `F4` shows a state hash that is identical on every reload with the same seed.

### Gate

- [ ] Same seed → identical state hash after 2 000 ticks, across reloads **and** across two machines
- [ ] `F1` shows zero diagonals cutting between two blocked tiles
- [ ] Movement is smooth at 60 fps display against a 20 Hz sim — interpolation is doing its job
- [ ] The kit renders correctly: one material, one atlas, no missing-texture warnings
- [ ] **Both camera views are legible and feel meaningfully different** — the first real read on POC
      goal #3
- [ ] Sim tick cost leaves ample headroom (target: well under 1 ms with 50 enemies)

**If this gate fails:** the failure is almost certainly the camera criterion, not the technical ones.
If the commander view adds nothing, cut it to a single ortho camera and reclaim the time — do not
spend Phase 4 polishing a view nobody uses.

---

## Phase 2 — Theft & Maze

> **The core loop.** Build a maze, watch thieves take your money through it and carry it back out. The
> README's "watch the theft round-trip before building anything else" — and the phase that decides
> whether this game is worth making.

### Scope

**Placement** (`sim/placement.ts`)
- Wall (1×1) and tower-footprint (2×2) placement, charged against the treasury
- Full validation: in bounds, unoccupied, **no enemy standing in the footprint**, every active spawn
  still reaches the treasury, **and every live enemy still reaches its current goal**
- Rejected placements revert the mask and restore the previous field with no allocation
- Removal with the **4.0 s / 80-tick delay**, tile staying blocked throughout
- Live re-pathing: fields rebuild on mask change, enemies re-read on their next waypoint

**Theft economy** (`sim/economy.ts`, `sim/enemy.ts`)
- `inbound` / `returning` state machine
- Treasury arrival: grab `min(carryCapacity, balance)`, flip to returning, path to nearest active spawn
- Carriers move at 80% speed
- Gold sacks on the ground; any enemy walking over one picks up to remaining capacity; an inbound
  enemy that picks up **immediately flips to returning**
- Gold escaping through a spawn is gone
- Treasury in milli-gold; spending blocked while `balance < 0`

**Render**
- Placeholder tower blocks and wall meshes at correct footprints
- Gold-sack meshes on the ground, carried-gold indicator above carriers
- Ghost placement preview tinted valid/invalid, driven by the **real** validation function

**UI** (`ui/`)
- Minimal HUD: treasury readout, build palette (wall + one placeholder tower), removal countdown
- Pointer → ground raycast → tile → command

**Tests** — `placement.test.ts`, `theft.test.ts`

### Explicitly not in this phase

No tower weapons and no damage — nothing can be killed yet. No waves, no interest, no upgrades. Gold
sacks appear only via a debug key, since killing carriers is what normally drops them.

### Deliverable

A deployed link where you build a maze with walls, watch enemies re-route live, watch them reach the
treasury, steal, slow down, and carry your money back out through the gauntlet you built. Sealing the
maze is impossible; removing a wall takes four seconds.

### Gate — the go/no-go

- [ ] **Does the theft round trip feel good?** Is watching a carrier walk back out through your maze
      tense, or merely a second walk animation?
- [ ] Does mazing feel expressive? Do 1-wide gaps between 2×2 footprints create interesting shapes?
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

**Towers** (`sim/tower.ts`)
- Four archetypes with fixed targeting priorities:

  | Tower | Role | Priority | Kit model |
  |---|---|---|---|
  | Rapid fire | Single-target DPS baseline | First along path | square + `weapon-turret` |
  | Sniper | Anti-armour, long range | **Carriers first**, then strongest | square + `weapon-ballista` |
  | Area damage | Anti-swarm | First | square + `weapon-catapult` |
  | Slow | Force multiplier, no kill power | First | round + `tower-round-crystals` |

- Hitscan resolution, damage on the firing tick, render-only tracer events
- Three upgrade levels per tower, each ~1.5× the previous cost
- Slow does not stack — `slowUntil = max(...)`
- Kill bounties straight to the treasury; killing a carrier drops its sack

**Enemies**
- Swarm (punishes no AoE), Tank (punishes no sniper), Runner (punishes no slow)
- Stat blocks in `balance.json`: `hp, speed, carryCapacity, bounty, slowImmune`
- One slow-immune type reserved for later waves

**Render**
- **Modular tower composition** — upgrade level adds a segment, so towers visibly grow: ~2.4 → 3.4 →
  4.4 units tall
- Weapon head yaws toward its current target (cosmetic)
- Tracers, muzzle flashes, impact effects, AoE burst
- Status icons hovering above enemies: carrying gold, slowed
- `F3` debug: tower ranges and target lines

**UI**
- Full build palette with costs and affordability states
- Tower inspector: level, stats, upgrade cost, remove-with-countdown
- Range preview on hover and on selection

**Tests** — targeting priority selection, slow non-stacking, upgrade cost curve, bounty accounting

### Explicitly not in this phase

No waves — enemies still spawn on a debug timer. No interest, no bankruptcy, no level progression.

### Deliverable

A deployed link with the complete tactical layer. Build all four towers, upgrade them, watch them
visibly grow, and watch each enemy type punish the archetype you left out.

### Gate

- [ ] **Do the counters read without explanation?** Does a swarm wave visibly punish missing AoE?
- [ ] Does the sniper's carrier priority make treasury-side placement feel like a distinct role from
      spawn-side? This is the mechanic that gives the maze two meaningful ends
- [ ] Is the upgrade-as-height read strong in the commander view, and is that view now earning its
      keep?
- [ ] Do the four archetypes feel distinct, or do two of them collapse into "the damage tower"?
- [ ] Is the maze still defending twice — do returning carriers actually die on the way out?

---

## Phase 4 — The Run

> **A complete session.** Hand-authored waves, interest, bankruptcy, two levels, win and lose states.
> Everything already exists; this phase composes it into something you can sit down and play.

### Scope

**Waves** (`sim/waves.ts`)
- Wave loader from JSON: groups with `spawn`, `type`, `count`, `spawnInterval`, `delay`
- 10 hand-authored waves per level, curve-designed to teach the counters — runners introduced around
  wave 3, a tank check around wave 5, a swarm check around wave 7
- Multi-spawn activation by wave: a second front opening mid-run reshapes the maze problem
- Build phase with **no timer**; building during waves allowed and instant

**Economy completion**
- Interest accrual — during waves only, on positive balance only
- Unclaimed sacks return to the treasury at end of wave
- Bankruptcy: cannot spend below 0, **lose at −100**
- Win: survive all 10 waves

**Levels**
- `level_01` — one spawn, teaches the loop
- `level_02` — two spawns with the second activating mid-run

**UI**
- Wave counter and preview of what is coming
- Start-wave control
- Win / lose screens with a run summary — gold stolen, gold escaped, kills, final balance

**Tests** — `economy.test.ts`, `level.test.ts`, wave scheduling

### Deliverable

The complete POC. A shareable link where someone who has never seen it can play two levels of ten
waves each, from first wall to victory or bankruptcy.

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
| 3. Asymmetric camera views | Phase 1 gate (legibility), Phase 3 gate (does it earn its keep) |
| 4. Four towers vs three enemies, RPS pressure | Phase 3 gate |

Note that goal #3 is judged twice and can be cut after either. It is the cheapest thing to abandon and
the only goal the README itself already marks as cosmetic for now.

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

1. Is 4.0 s the right removal delay?
2. Does turn-around penalisation become necessary, or does the removal delay alone kill juggling?
3. Does uncapped interest self-balance?
4. Is a flat per-wave stipend needed against the death spiral? (Only if testing demands it — never by
   softening theft itself.)
5. Does anyone actually use the commander camera?
