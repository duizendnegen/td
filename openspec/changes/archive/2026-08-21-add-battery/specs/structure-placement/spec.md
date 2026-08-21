## ADDED Requirements

### Requirement: A battery is a ground structure on the panel's rules

The system SHALL support placing a battery as a fourth structure kind. Wherever this
capability's requirements name the solar panel — placement by command and charge to the
treasury, seal and strand validation, terrain (dirt only; never a socket), the ground layer
(never on a wall, and no wall on it), not a foundation (`needs-wall` for a tower, occupied for
a move onto it), the build-phase move of the tile's stack, the provisional/committed refund, and
the refusal to remove committed structures while a wave runs — the battery SHALL be accepted
exactly where a panel is accepted and refused with the same verdict exactly where a panel is
refused. The battery's cost SHALL come from balance data. The ground structures that block a
tile SHALL be walls, panels and batteries, on dirt, and nothing else.

#### Scenario: Confirmed battery placement

- **WHEN** a valid battery placement command applies at a tick boundary
- **THEN** the target tile is blocked, the treasury is reduced by the battery cost, both flow
  fields reflect the new mask that same tick, and the battery is provisional until a wave tick
  runs

#### Scenario: Battery placement that seals is rejected

- **WHEN** a battery placement would leave an active spawn with no path to the treasury
- **THEN** the placement is rejected and simulation state is unchanged

#### Scenario: Battery on a socket is rejected

- **WHEN** a battery placement command targets a socket tile
- **THEN** the placement is rejected as not-buildable

#### Scenario: A battery is not a foundation

- **WHEN** a tower placement command targets a tile holding a battery
- **THEN** the placement is rejected with the `needs-wall` verdict and simulation state is
  unchanged

#### Scenario: A battery shares a tile with nothing

- **WHEN** a battery placement command targets a tile holding a wall or a panel, or a wall or
  panel placement command targets a tile holding a battery
- **THEN** the placement is rejected as occupied

#### Scenario: A battery moves like a wall

- **WHEN** a valid move command for a tile holding a battery targets bare dirt during the build
  phase
- **THEN** in that same tick the battery stands on the destination, its origin tile is walkable,
  the destination is blocked, both flow fields reflect the new mask, and the treasury, the
  battery's kind and its refund basis are unchanged

#### Scenario: Nothing lands on a battery

- **WHEN** a move command for a tile holding a wall and a tower, or for a tower on a socket,
  targets a tile holding a battery
- **THEN** the move is rejected as occupied

#### Scenario: Batteries refund like panels

- **WHEN** a provisional battery and a committed battery are removed between waves
- **THEN** the provisional one refunds its full cost and the committed one the configured
  fraction, and a committed battery cannot be removed while a wave runs
