# debug-tooling — delta for scale-world-experiment

## ADDED Requirements

### Requirement: Balance tuning dials override balance data at load

The system SHALL accept URL query parameters that override balance and level-economy values once
at load, before fixed-point conversion: `rangeScale` and `hpScale` as multipliers on authored
values; `waveScale` as a multiplier on every wave group's `count` and `delay` (rounded once,
count clamped to at least 1) that leaves `spawnInterval` unchanged, so a wave lasts about
`waveScale`× longer at the same spawned hp per tick — groups authored with `count` 1 keep a
count of 1 and only their delay scales; `carrierSpeedPer100`, `wallCost`, `interestRatePpm`,
`startingTreasury`, `bonusGraceTicks`, `bonusDecayTicks`, `sackRecoveryPer1000`, and
`refundPer1000` as absolute overrides. Dialed
values SHALL flow through the same schema validation as authored data and SHALL act as
deterministic simulation inputs. Absent parameters SHALL leave authored values untouched. An
invalid dial value SHALL fail the load with a visible error, never silently fall back. Map size
SHALL NOT be a dial.

#### Scenario: A dialed run is deterministic

- **WHEN** two sessions load with `?rangeScale=2&hpScale=3` and replay identical command streams
- **THEN** both produce identical state hashes

#### Scenario: waveScale stretches a wave without stacking its set-piece spawn

- **WHEN** the game loads with `?waveScale=5` on a wave with a six-enemy group at interval 10
  and a separate single-enemy group
- **THEN** the six-enemy group spawns thirty enemies at the same interval, its delay is five
  times the authored value, and the single-enemy group still spawns exactly one enemy

#### Scenario: Absent dials mean authored values

- **WHEN** the game loads with no tuning parameters
- **THEN** the simulation behaves exactly per the authored balance and level data

#### Scenario: Invalid dials fail loudly

- **WHEN** the game loads with a dial value that fails validation (e.g. a negative `hpScale`)
- **THEN** the load fails with a visible error naming the offending parameter
