# Design — tower-damage-stats

## Context

See proposal.md for motivation. Relevant current state:

- Every point of damage in the game is applied inside `fireTowers` (`src/sim/tower.ts`, tick
  step 7), with the firing tower `t` in scope at all three sites: the rapid/sniper single hit
  (`target.hp -= stats.damage`), and the area burst's per-enemy loop. Slow applies a status and no
  damage. Target selection and the burst loop both skip enemies with `hp <= 0`, so at every hit
  the victim's pre-hit hp is strictly positive.
- `Structure` (`src/sim/types.ts`) already carries tower-only fields that walls hold at a fixed
  value — `level: 0`, `nextFireTick: 0`, `archetypeId: -1` — and every field is walked by
  `hashState` (`src/sim/hash.ts`). The standing rule D-P1-2 in `types.ts` requires a new field
  and its hash line to land in the same commit.
- `SimState` already holds hashed run-summary counters that no simulation rule reads —
  `kills`, `stolenMg`, `escapedMg`, `lastWaveBonusMg` — consumed only by the end screens.
- `applyStartWave` (`src/sim/sim.ts`) is the single wave-start point; `applyPlace` initialises
  every `Structure` field; `applyUpgrade` mutates `level` and `paidMg` in place; `applyMove`
  mutates `tx`/`ty` in place on the same record.
- `InspectorUI` (`src/ui/inspector.ts`) re-resolves the selected structure by id every frame,
  and re-renders its DOM only when a `contentKey` string changes. `statRows()` returns
  label/value pairs into one container that lays out as rows on desktop and as side-by-side
  label-over-value columns on mobile (`mobile:flex-row`).
- `tests/replay.test.ts` holds two goldens: `GOLDEN_SCRIPT_HASH` (a full scripted run) and
  `GOLDEN_IDLE_HASH` (an empty-command run that never places a structure). Prior changes that
  altered `Structure`'s shape re-minted only the first, and the header documents each.

## Goals / Non-Goals

**Goals:**

- Record damage at its one source, as hashed state, with no new iteration and no new step in
  the tick order.
- One field for the phase-dependent wave figure; no copy-at-settlement, no second rollover site.
- A panel that a later "other views" change can read from without touching the sim again.

**Non-Goals:**

- Kills, gold recovered, slow metrics, derived figures, other views (proposal Non-Goals).
- Any consultation of the counters by a simulation rule. They are recorded, never read, in
  `sim/`.

## Decisions

### D1 — Counters are hashed `Structure` fields, not a UI accumulator

`Structure` gains `waveDamage: number` and `totalDamage: number`, both plain integers, both mixed
into the canonical walk immediately after `provisional`. Walls carry `0` for both.

*Why sim state.* The project's own precedent is decisive: `kills` and the theft totals are
already hashed counters that no rule reads. ARCHITECTURE.md §4 frames the hash as a history
fingerprint, and damage-dealt is history. Every downstream view — this inspector, and later a
wave summary or an end-screen MVP — becomes a read of state.

*Alternative rejected — accumulate in `ui/` from render events.* The `tracer` and `aoeBurst`
events carry geometry, not damage; the burst event would need per-hit amounts (the sim knows
which enemies it hit, the event does not). The UI would also need to observe `runPhase`
transitions for the rollover, duplicating logic the sim already has at `applyStartWave`. And the
figures would not survive a replay or a lockstep peer joining late — the exact scenario
determinism exists for. More plumbing for a weaker result.

*Alternative rejected — a `SimState`-level map keyed by structure id.* Splits the record from
its owner and needs its own cleanup on removal; the fields on `Structure` are removed with it for
free and hashed in the same loop that already walks structures.

### D2 — Effective damage: `min(hp, damage)` at each hit

At each of the three damage sites, `dealt = Math.min(victim.hp, stats.damage)` is computed
before the subtraction and added to both of `t`'s counters. Because selection and the burst loop
already exclude `hp <= 0`, `victim.hp` is positive at that point and `dealt` is in
`[1, damage]` — no branch, no clamp.

*Why effective.* Balance magnitudes make raw counting misleading: a swarm has 50 hp against a
sniper's 60 damage, so every sniper-on-swarm kill overkills by 10 and a swarm wave inflates the
sniper's raw figure by ~20% for damage that did nothing. Area bursts on half-dead clumps are
worse. The panel exists to answer "was this tower worth it"; raw damage answers "how big are its
numbers", which the static stats already show.

*Alternative rejected — raw `stats.damage` per hit.* Simpler to reason about and common
elsewhere, but rewards misallocation and is derivable by the player from shots × damage.

### D3 — One wave field, reset in `applyStartWave`

`waveDamage` is zeroed for every structure in `applyStartWave`, in the same tick the wave-start
command applies. Nothing else writes it to zero. Between settlement and the next start it
therefore *is* the previous wave's figure, and the inspector picks the label from `runPhase`:
"This wave" while `'wave'`, "Last wave" in `build`, `settled-locked`, `won` and `lost`.

```
   build ──startWave──▶ wave ──settlement──▶ build ──startWave──▶ wave
     │                    │                    │                    │
   Last wave: 340      This wave: 0…        Last wave: 512      This wave: 0…
     ▲                    ▲                    ▲                    ▲
     └── same field ──────┴── reset here ──────┴────────────────────┘
```

*Alternative rejected — `thisWave` and `lastWave`, copied at settlement in step 9.* Buys the
ability to show both during a wave, which the proposal explicitly does not want, at the cost of a
second hashed field per structure and a second rollover site to keep in step with the first.

*Why the command, not step 9.* Reset belongs to the event the player triggers — the start — and
`applyStartWave` is the single place that event lands, already guarded by the solvency gate. A
tower placed during a wave initialises at zero and never sees a reset until the next start, which
is exactly "damage since placement, this wave".

### D4 — Upgrade and move need no code

`applyUpgrade` and `applyMove` mutate the same `Structure` record in place; the counters ride
along. The spec pins this as a requirement so a future refactor that rebuilt the record on move
would fail a test rather than silently zero a tower's history.

### D5 — The inspector's Performance block

A second container below the stat rows, using the same `STAT_ROW` / `STAT_LABEL` /
`STAT_VALUE` class variants so it reads as the same instrument, separated by the same
`border-surface-bright` rule the header uses. On mobile it is its own flex row rather than
extending the stat container's `mobile:flex-row`, so the sheet gains a line instead of a sixth
column.

Rows, for every archetype except `slow`:

| Label | Value |
|---|---|
| `This wave` / `Last wave` (by `runPhase`) | `waveDamage`, or `—` when `runPhase !== 'wave' && totalDamage === 0` |
| `Total` | `totalDamage` |

Plain integers, no unit — damage is a bare integer everywhere else in the game. The `contentKey`
gains `waveDamage` and `totalDamage`; without that the panel would refresh only incidentally
(the treasury changes every tick under positive-balance interest) and not at all in the build
phase.

*The dash rule needs no extra state.* The UI cannot distinguish "placed this phase, never
fought" from "fought a whole wave and dealt 0" — both show `—` outside a wave and both read
correctly that way. Tracking `placedWave` on the structure to tell them apart was rejected as a
hashed field bought for a label.

### D6 — Golden re-mint, one deliberately

`GOLDEN_SCRIPT_HASH` re-mints once, with a header note in `tests/replay.test.ts` matching the
convention of the `provisional` and `removalCompleteTick` notes: two mixed fields per structure,
trajectory unchanged, every milestone (kills included) still holds. `GOLDEN_IDLE_HASH` must not
move — that run places nothing, so the walk never reaches structure fields. If it moves, the
change reached past `Structure`.

## Risks / Trade-offs

- **[The counters look like they should influence something]** → They never do. `sim/` writes
  them and never reads them; the design's Non-Goals say so and no `sim/` function takes them as
  input. A reviewer seeing a rule keyed on `totalDamage` should treat it as a design change.
- **[Panel churn during a wave]** → The content key already changes every tick under interest;
  adding counters that change a few times a second per tower is no worse. If it ever matters, the
  refresh can be rate-limited in the UI without touching the sim.
- **[Effective damage under-reports towers whose job is finishing]** → Accepted: a finisher's
  value is the kill, which is the deferred kills-per-tower metric, not damage. The proposal
  records that as the next step, not a gap.
- **[Two more int32 mixes per structure per hash]** → The hash is computed on demand (F4
  readout, tests), never per tick. Negligible.
