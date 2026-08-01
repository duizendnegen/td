# render-pipeline

## Purpose

The 3D presentation layer: loads the Kenney kit's models and shared palette atlas, renders the
board and enemies smoothly against the 20 Hz simulation, and never influences simulation state.

## Requirements

### Requirement: Single shared material and atlas

All models SHALL render with one shared material sourced from the single palette atlas
(`colormap.png`). Loading the used model set SHALL produce no missing-texture warnings and no
per-model material duplicates.

#### Scenario: Kit renders correctly

- **WHEN** the level loads on the deployed site
- **THEN** all tiles and enemies render with correct palette colours and the console shows no
  texture or material warnings

### Requirement: Asset URLs respect the deployment base path

All runtime-fetched assets SHALL resolve relative to the configured deployment base path, so the
same build works both on the dev server root and hosted under a project subpath.

#### Scenario: Deployed under a subpath

- **WHEN** the built site is served from `/td/`
- **THEN** every model and texture request succeeds (no 404s)

### Requirement: Static ground is a single draw call

The level's static ground tiles SHALL be merged into a single geometry at level load and rendered
as one draw call, rebuilt only if terrain changes.

#### Scenario: Draw-call budget

- **WHEN** the 30Ã—20 board is rendered
- **THEN** the ground contributes exactly one draw call

### Requirement: Entity motion is interpolated

Rendered entity positions SHALL interpolate between the simulation's previous-tick and current-tick
positions using the accumulator's alpha, so 20 Hz simulation motion appears smooth at any display
rate.

#### Scenario: Smooth motion at 60 fps

- **WHEN** an enemy moves at constant speed and the display runs at 60 fps
- **THEN** its rendered position advances every frame without 20 Hz stepping artifacts

### Requirement: Render-only motion never touches simulation state

Cosmetic animation â€” enemy hover bob and yaw spin, and any future visual effects â€” SHALL be driven
by frame time within the render layer only. The render layer SHALL read simulation state
exclusively and SHALL never mutate it.

#### Scenario: Rendering does not perturb the hash

- **WHEN** the same seed is run to the same tick once headless and once fully rendered with
  animations
- **THEN** both report the same state hash
