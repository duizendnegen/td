# isometric-camera

## Purpose

A single fixed isometric view over the scene: an orthographic projection that keeps maze layout
measurable while its low pitch lets height read — POC goal #3 (isometric camera view).

## Requirements

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

### Requirement: Height legibility

The pitch SHALL be low enough that objects of different heights are visibly distinguishable by
silhouette. Occlusion of tiles directly behind tall objects is accepted, not avoided.

#### Scenario: Height reads

- **WHEN** two objects of different heights stand on the board
- **THEN** the taller object is visibly taller on screen

### Requirement: Resize-stable framing

On viewport resize the frustum SHALL re-fit so that, at the default zoom, the entire board plus
margin stays visible at any aspect ratio, without distortion. While zoomed in on a touch
device, a resize SHALL preserve the view center and re-clamp to board bounds.

#### Scenario: Window resized

- **WHEN** the viewport aspect ratio changes at the default framing
- **THEN** the entire board remains on screen and tiles keep their proportions

#### Scenario: Resize while zoomed

- **WHEN** the viewport resizes while the camera is zoomed in on a touch device
- **THEN** the view center is preserved, tiles keep their 2:1 proportions, and the view remains
  within board bounds

### Requirement: Touch camera gestures

On touch devices the camera SHALL support pinch-to-zoom between the fit-to-board level and a
maximum zoom suitable for reliable single-tile taps, and pan while zoomed in. Zoom and pan
SHALL be clamped so the view never travels beyond the board plus its margin. Camera gestures
SHALL be render-side only: they never enter the command queue and never affect simulation
state.

#### Scenario: Pinch zooms toward the gesture

- **WHEN** the player pinches outward on the board
- **THEN** the view zooms in centered on the gesture, and the projection remains orthographic
  2:1 dimetric at every zoom level

#### Scenario: Pan is clamped to the board

- **WHEN** the player pans while zoomed in
- **THEN** the view stops at the board edge plus margin and never shows unbounded empty space

#### Scenario: Gestures do not touch the simulation

- **WHEN** a run replays the same seed and commands with and without camera gestures
- **THEN** both runs produce identical state hashes
