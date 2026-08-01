## MODIFIED Requirements

### Requirement: Isometric projection

The camera SHALL use an orthographic projection at a fixed 45° yaw and a fixed 30° pitch — the
classic 2:1 dimetric projection used by RollerCoaster Tycoon-era games — framing the entire board.
At 30° pitch a ground tile SHALL project as an exact 2:1 diamond (screen width twice screen
height). A 1-tile gap SHALL measure identically anywhere on screen (no perspective distortion),
keeping maze layout legible.

#### Scenario: Whole board visible and measurable

- **WHEN** the game is running
- **THEN** all 30×20 tiles are on screen and equal-sized gaps appear equal-sized regardless of
  board position

#### Scenario: Tiles project as 2:1 diamonds

- **WHEN** a ground tile is projected to screen space
- **THEN** its diamond is twice as wide as it is tall (within rounding), matching the classic
  dimetric tile shape
