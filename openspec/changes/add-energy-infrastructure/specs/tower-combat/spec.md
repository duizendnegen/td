# tower-combat — delta for add-energy-infrastructure

## ADDED Requirements

### Requirement: Fire cadence scales with the tick's power coverage

Each wave tick, before any tower fires, the system SHALL determine every tower's target once and
derive the tick's power coverage from the engaged draw (power-grid). A tower that fires on that
tick SHALL schedule its next shot at its fire interval divided by the coverage (integer
ceiling); at coverage zero a due tower SHALL hold its fire and its next-fire tick SHALL NOT
advance. Targeting, insertion-order resolution, skipping the dead, and hitscan timing are
otherwise unchanged; a target selected in the pre-pass that has died to an earlier tower in
the same tick SHALL be treated exactly as the existing skip-the-dead rule prescribes.

#### Scenario: Full coverage is today's cadence

- **WHEN** coverage is 1 on a tick and a rapid tower fires
- **THEN** its next shot is due after exactly its level's fire interval

#### Scenario: Reduced coverage stretches the interval

- **WHEN** coverage is below 1 on a tick and a tower fires
- **THEN** its next shot is due after its interval divided by the coverage, rounded up to a
  whole tick

#### Scenario: Zero coverage holds fire without losing the due tick

- **WHEN** coverage is zero and a tower is due to fire with a target in range
- **THEN** it does not fire, its next-fire tick does not advance, and it fires on the first later
  tick with non-zero coverage

#### Scenario: Slow towers stretch their reapplication, not their duration

- **WHEN** coverage is below 1 and a slow tower fires
- **THEN** the applied slow lasts its full authored duration and the tower's next application
  is due after its stretched interval
