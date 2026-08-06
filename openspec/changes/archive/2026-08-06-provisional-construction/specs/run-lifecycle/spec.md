## ADDED Requirements

### Requirement: A wave's first advanced tick commits standing construction

The first tick the simulation advances while a wave is running SHALL commit every standing
structure, clearing its provisional state, before that tick's wave scheduling and combat run. The
start-wave decision is therefore the point at which the build phase's construction becomes
irreversible at full value.

#### Scenario: The wave begins against committed construction

- **WHEN** a player builds through a build phase and starts a wave
- **THEN** the wave's first advanced tick commits everything standing before any enemy spawns for
  that tick

#### Scenario: Starting a wave without advancing does not commit

- **WHEN** the start-wave command is committed but time has not advanced
- **THEN** standing structures are still provisional, and become committed on the first advance

### Requirement: Liquidation value accounts for the refund each structure would pay

Any calculation of the total value a player could raise by selling everything standing SHALL sum
each structure's own refund — full for provisional structures, the removal refund fraction for
committed ones — rather than applying one flat rate across all of them.

#### Scenario: A recoverable run is not declared dead

- **WHEN** the balance is negative and the standing structures include provisional ones whose full
  refunds would clear the debt, though half-refunds would not
- **THEN** the run is not reported as impossible to recover

#### Scenario: Provisional value cannot be extracted

- **WHEN** a provisional structure is placed and then removed
- **THEN** the treasury returns to its value before the placement, so the round trip raises nothing
