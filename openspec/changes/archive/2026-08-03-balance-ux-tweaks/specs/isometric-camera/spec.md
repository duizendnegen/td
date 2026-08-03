## MODIFIED Requirements

### Requirement: Isometric projection

The camera SHALL use an orthographic projection at a fixed 45° yaw and a fixed 30° pitch — the
classic 2:1 dimetric projection used by RollerCoaster Tycoon-era games. Its default framing
SHALL show the entire board, whatever the level's grid dimensions; on non-touch devices this
framing is fixed, while touch devices SHALL zoom and pan within board bounds per the touch
camera gestures requirement. At 30° pitch a ground tile SHALL project as an exact 2:1 diamond
(screen width twice screen height). A 1-tile gap SHALL measure identically anywhere on screen
at a given zoom level (no perspective distortion), keeping maze layout legible.

#### Scenario: Whole board visible and measurable by default

- **WHEN** the game is running at the default framing on any level
- **THEN** every tile of that level's grid is on screen and equal-sized gaps appear equal-sized
  regardless of board position

#### Scenario: Tiles project as 2:1 diamonds

- **WHEN** a ground tile is projected to screen space at any zoom level
- **THEN** its diamond is twice as wide as it is tall (within rounding), matching the classic
  dimetric tile shape
