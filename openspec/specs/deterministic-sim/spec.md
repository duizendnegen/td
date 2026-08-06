# deterministic-sim

## Purpose

A bit-deterministic, fixed-point integer simulation core: the same seed and the same commands
produce identical state on any machine, enforceable by hashing, so that co-op lockstep remains
possible later and replay tests can guard the contract from Phase 1 onward.

## Requirements

### Requirement: All simulation state is integer

The simulation SHALL store all state as integers: positions and velocities in 1/1024-tile units,
money in milli-gold, HP and timers as plain integers. Timers SHALL be absolute tick numbers, never
countdowns. No float value SHALL be stored in simulation state.

#### Scenario: No float leaks after sustained running

- **WHEN** the simulation has run 2 000 ticks with enemies steering through diagonal and orthogonal
  moves
- **THEN** every stored state field is an exact integer (`Number.isInteger` holds for all of them)

### Requirement: Same seed and commands produce identical state

Given the same seed, the same level, and the same command sequence, the simulation SHALL reach
bit-identical state after any number of ticks, across process restarts and across machines.
Wall-clock time, frame rate, rendering, and the rate at which ticks are driven SHALL have no
influence on simulation state.

#### Scenario: Replay reproduces the golden hash

- **WHEN** a fixed seed and a recorded command list are run for N ticks
- **THEN** the state hash equals the stored golden value

#### Scenario: Display rate does not affect state

- **WHEN** the same seed runs once stepped 1 tick at a time and once stepped 5 ticks at a time to
  the same tick count
- **THEN** both runs produce the same state hash

#### Scenario: Time controls do not affect state

- **WHEN** the same seed and commands are run once at normal rate and once with arbitrary pauses and
  fast-forwards interleaved, to the same tick count
- **THEN** both runs produce the same state hash

### Requirement: All randomness comes from the seeded PRNG

The simulation SHALL derive all randomness from a seeded PRNG owned by the simulation instance.
`Math.random`, `Date.now`, and any other ambient nondeterminism SHALL NOT be read inside the
simulation. The PRNG SHALL produce a known, portable sequence for a given seed.

#### Scenario: Same seed, same sequence

- **WHEN** two PRNG instances are created with the same seed
- **THEN** they produce identical output sequences

#### Scenario: PRNG matches reference vectors

- **WHEN** the PRNG is seeded with a published test vector's seed
- **THEN** its first outputs match the published reference values

### Requirement: Fixed 20 Hz tick with bounded catch-up

The simulation SHALL advance in fixed 50 ms ticks driven by an accumulator, regardless of display
frame rate. The rate at which real time is fed to that accumulator MAY be scaled by the
application's time controls, or reduced to zero while paused; the tick duration itself SHALL remain
fixed at 50 ms of simulation time in every case.

Catch-up after a stall SHALL be clamped so that a single frame cannot execute an unbounded number of
ticks, dropping the remainder of the accumulated backlog rather than spiralling. The clamp SHALL be
applied to the elapsed wall-clock gap, before any time-control scaling, so that it remains a stall
guard rather than a speed limit.

While paused, no time SHALL accumulate, so that resuming does not execute a burst of ticks
accumulated during the pause.

#### Scenario: Long frame does not spiral

- **WHEN** a single frame arrives 1 000 ms after the previous one
- **THEN** the executed tick count is bounded by the clamp rather than by the elapsed time

#### Scenario: A long pause does not burst on resume

- **WHEN** the game is paused for 30 seconds and then resumed
- **THEN** the first frame after resuming executes at most the ticks that frame's own elapsed time
  warrants

#### Scenario: Tick duration is rate-independent

- **WHEN** the same wave is run at normal rate and fast-forwarded
- **THEN** each executed tick represents 50 ms of simulation time in both, and the wave occupies the
  same number of ticks

### Requirement: The tick decomposes into commit and advance

The simulation SHALL expose its tick as two composable halves at a fixed seam in the documented
step order:

- **commit** — steps 1–3: snapshot previous positions, apply commands, rebuild flow fields for any
  mask change and sweep stale waypoint commitments. Everything here is reactive to commands.
- **advance** — steps 4–10: wave spawns, enemy movement, arrivals, tower firing, deaths, run
  progression, tombstone compaction and the tick increment. Everything here is time passing.

A full tick SHALL be exactly `commit(commands)` followed by `advance()`, and the existing tick entry
point SHALL remain that composition, so every existing caller is unchanged.

`commit` SHALL be safe to call any number of times before an `advance`, with the same result as one
`commit` carrying the concatenated commands in the same order.

#### Scenario: Composition equals the tick

- **WHEN** a run is stepped with the tick entry point and an identical run is stepped by calling
  commit then advance for every tick
- **THEN** both produce identical state hashes at every tick

#### Scenario: Repeated commits equal one batched commit

- **WHEN** commands A, B and C are committed one at a time with no advance between them, and the
  same three are committed together in that order in another run
- **THEN** both runs reach the same state, and advancing each produces the same hash

#### Scenario: Commit consumes no time

- **WHEN** commit runs with any command set
- **THEN** no enemy moves, no tower fires, no wave spawn occurs, no settlement runs, and the tick
  counter is unchanged

#### Scenario: A paused session and a replay converge

- **WHEN** a session commits several commands across a pause and then advances, and a replay applies
  the same commands in the same order at that tick
- **THEN** both report the same hash once the tick completes

### Requirement: State comparability is defined at tick boundaries

Simulation states SHALL be compared only at tick boundaries — after an advance completes. A state
that has been committed but not yet advanced is mid-tick, and its hash SHALL NOT be expected to
equal the hash of any completed tick.

Commit followed by advance SHALL be atomic with respect to comparison: any consumer comparing
hashes across machines or against a golden value SHALL do so on completed ticks.

#### Scenario: A pending commit is not a completed tick

- **WHEN** a command is committed while the game is paused, without advancing
- **THEN** the state hash differs from the hash of the last completed tick while the tick counter is
  unchanged, and this is correct rather than a determinism fault

#### Scenario: Gate checks are unaffected

- **WHEN** two machines run the same seed to the same tick without pausing
- **THEN** both report the same hash, as before this change

### Requirement: Commands apply only at tick boundaries in deterministic order

Player and debug input SHALL enter the simulation only as commands stamped into a queue, applied at
the start of a tick, ordered by command type then by issue sequence. The simulation SHALL never
read the pointer, keyboard, DOM, or clock directly.

#### Scenario: Mid-frame input is deferred

- **WHEN** a command is issued between two tick boundaries
- **THEN** its effect first appears in the state of the next tick, and the tick at which it applied
  is identical on every replay

### Requirement: Exhaustive canonical state hash

The simulation SHALL expose an FNV-1a hash computed by one canonical walk over **all** simulation
state: tick counter, full PRNG state, treasury, and every field of every live entity in insertion
order. Every field added to simulation state in any later change SHALL be added to the hash walk in
the same change. Render-only data (interpolation snapshots consumed by the renderer, visual
events) SHALL be excluded.

#### Scenario: Any state difference changes the hash

- **WHEN** two states differ in exactly one field â€” a waypoint, a timer, the PRNG state, or the
  treasury
- **THEN** their hashes differ

#### Scenario: Identical states hash identically across machines

- **WHEN** the same seed is run to the same tick on two different machines
- **THEN** the reported hashes are identical

### Requirement: Previous-tick positions are observable

For every moving entity the simulation SHALL retain the previous tick's position alongside the
current one, snapshotted at the top of each tick, so a consumer can interpolate between them.

#### Scenario: Snapshot precedes movement

- **WHEN** a tick moves an entity
- **THEN** the entity's previous-position field holds its position from immediately before that
  tick's movement
