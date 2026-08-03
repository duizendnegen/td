# level-progression

## Purpose

The ordered level sequence and the flow that carries a winning player from one level into the
next, so a run's victory screen is a doorway rather than a dead end.

## Requirements

### Requirement: Levels form an ordered sequence

The game SHALL define an ordered sequence of levels (`level_01`, then `level_02`). Each level
in the sequence except the last SHALL know its successor. Direct selection of a specific level
(e.g. via the `?level=` URL parameter) SHALL remain available and unaffected by the sequence.

#### Scenario: Sequence order

- **WHEN** the game resolves the successor of `level_01`
- **THEN** it is `level_02`, and `level_02` has no successor

#### Scenario: Direct selection still works

- **WHEN** the game is opened with `?level=2`
- **THEN** `level_02` loads directly, exactly as before

### Requirement: Winning a non-final level offers advancing to the next

When a run on a level with a successor ends in the won state, the run summary SHALL present a
next-level action alongside the summary. Activating it SHALL start a fresh run of the successor
level — new simulation state built from that level's data, with no state carried over from the
finished run. When the won level has no successor, no next-level action SHALL be shown.

#### Scenario: Next level from the win screen

- **WHEN** the player wins `level_01` and activates the next-level action
- **THEN** a fresh run of `level_02` starts with `level_02`'s starting treasury, terrain, and
  waves, and nothing from the `level_01` run persists into it

#### Scenario: Final level win has no next action

- **WHEN** the player wins `level_02`
- **THEN** the run summary appears without a next-level action

#### Scenario: Losing offers no advance

- **WHEN** a run on `level_01` ends in the lost state
- **THEN** no next-level action is presented
