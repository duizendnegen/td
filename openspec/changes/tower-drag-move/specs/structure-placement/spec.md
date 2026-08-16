# structure-placement — delta for tower-drag-move

## ADDED Requirements

### Requirement: Structures move by command during the build phase, free of charge

The system SHALL support moving a placed structure — tower or wall — to a new tile via a move
command applied at a tick boundary, during the build phase only. A confirmed move SHALL take full
effect in its applying tick: the origin tile is unblocked (unless it is terrain-blocked socket
ground), the destination footprint is blocked (unless the destination is a socket), and both flow
fields reflect the new mask that same tick.

A move SHALL NOT change the treasury, and SHALL preserve the structure's identity: its kind,
archetype, level, total invested cost, and provisional flag carry over unchanged, so a later
removal refunds exactly what it would have refunded before the move, and starting a wave commits a
moved structure exactly as it commits an unmoved one.

A move command SHALL be rejected in every phase other than the build phase — during a wave, in
the settled-locked state, and after the run ends — including for provisional structures.

#### Scenario: A confirmed move reroutes in its tick

- **WHEN** a valid move command for a tower applies at a tick boundary
- **THEN** in that same tick the origin tile is walkable, the destination tile is blocked, and
  both flow fields reflect the new mask

#### Scenario: Moving is free and preserves the refund basis

- **WHEN** a committed tower that cost 50 and received a 90-cost upgrade is moved and later
  removed
- **THEN** the move changes the treasury by nothing, and the removal credits 50% of 140 — the
  same refund an unmoved tower would return

#### Scenario: A provisional tower stays provisional across a move

- **WHEN** a tower placed this build phase is moved before any wave starts
- **THEN** it is still provisional after the move, and removing it still refunds in full

#### Scenario: A wall moves like a tower

- **WHEN** a valid move command for a wall applies at a tick boundary during the build phase
- **THEN** in that same tick the wall stands on the destination, its origin tile is walkable, the
  destination is blocked, both flow fields reflect the new mask, and the treasury and the wall's
  refund basis are unchanged

#### Scenario: No moves while a wave runs

- **WHEN** a move command applies while a wave is running, even for a provisional structure
- **THEN** the command is rejected

### Requirement: Move validation evaluates the destination with the origin freed

Before confirming a move the system SHALL verify, in simulation state at the applying tick, the
same conditions placement validation verifies for the moving structure's kind — destination in
bounds, destination terrain accepts that kind (dirt takes walls and towers, socket tiles towers
only), destination unoccupied, no enemy's current tile inside the destination footprint, every
declared spawn retains a finite-cost path to the treasury, and every live enemy's current tile
retains finite cost in its matching field — with one difference: the path and enemy checks SHALL
be evaluated against the mask with the origin tile freed and the destination blocked, both applied
together. A destination equal to the structure's current tile SHALL be rejected — a same-tile
move is not a move, and the interaction layer treats such a drop as a cancel rather than issuing
it.

A move whose destination is a socket tile SHALL skip path and enemy validation for the
destination — the tile was never navigable — while the origin still frees; freeing a tile can
only lower path costs, so such a move can never seal or strand. A move off a socket tile SHALL
validate exactly as a placement at the destination would, the origin being terrain-blocked
either way.

#### Scenario: A tower slides along its own wall line

- **WHEN** a tower in a wall line moves one tile sideways into a gap that is only legal because
  its origin tile opens in the same evaluation
- **THEN** the move is confirmed

#### Scenario: The freed origin can carry the reroute

- **WHEN** a move's destination blocks the only current route, but the freed origin tile itself
  restores a finite-cost path for every spawn and enemy
- **THEN** the move is confirmed

#### Scenario: A sealing move is rejected

- **WHEN** a move's destination would leave any declared spawn — active or dormant — with no
  path to the treasury even with the origin freed
- **THEN** the move is rejected

#### Scenario: A stranding move is rejected

- **WHEN** a move would leave every spawn connected but trap one live enemy with no path to its
  current goal
- **THEN** the move is rejected

#### Scenario: Occupied and enemy-held destinations are rejected

- **WHEN** a move targets a tile holding another structure, or a tile an enemy currently stands
  on
- **THEN** the move is rejected

#### Scenario: Moving a tower onto a socket needs no path checks

- **WHEN** a tower on dirt moves to an unoccupied socket tile
- **THEN** the move is confirmed, the origin tile is walkable in both flow fields that tick, and
  no seal or strand rejection is possible

#### Scenario: A wall cannot move onto a socket

- **WHEN** a move command targets a socket tile with a wall as the moving structure
- **THEN** the move is rejected as not buildable, exactly as a wall placement on that tile would
  be

### Requirement: A rejected move leaves simulation state unchanged

A rejected move SHALL have no observable effect on simulation state: the structure stays at its
origin, no blocked-mask change, no flow-field change, no treasury change, and an unchanged state
hash relative to the same tick without the attempt.

#### Scenario: Move rejection is atomic

- **WHEN** a move command is rejected during validation
- **THEN** the post-tick state hash is identical to the hash the same tick produces when the
  command is never issued
