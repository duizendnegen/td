## ADDED Requirements

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

## MODIFIED Requirements

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
