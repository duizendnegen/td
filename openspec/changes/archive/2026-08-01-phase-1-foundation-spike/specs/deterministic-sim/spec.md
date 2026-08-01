# deterministic-sim

## Purpose

A bit-deterministic, fixed-point integer simulation core: the same seed and the same commands
produce identical state on any machine, enforceable by hashing, so that co-op lockstep remains
possible later and replay tests can guard the contract from Phase 1 onward.

## ADDED Requirements

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
Wall-clock time, frame rate, and rendering SHALL have no influence on simulation state.

#### Scenario: Replay reproduces the golden hash

- **WHEN** a fixed seed and a recorded command list are run for N ticks
- **THEN** the state hash equals the stored golden value

#### Scenario: Display rate does not affect state

- **WHEN** the same seed runs once stepped 1 tick at a time and once stepped 5 ticks at a time to
  the same tick count
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
frame rate. Catch-up after a stall SHALL be clamped to at most 5 ticks per frame, dropping the
remainder of the accumulated backlog rather than spiralling.

#### Scenario: Long frame does not spiral

- **WHEN** a single frame arrives 1 000 ms after the previous one
- **THEN** at most 5 ticks execute before the next render

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

- **WHEN** two states differ in exactly one field — a waypoint, a timer, the PRNG state, or the
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
