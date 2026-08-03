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
### Requirement: Terrain kinds render as distinct tiles in one static draw call

The ground SHALL render each terrain kind distinctly — dirt as the dirt tile, grass as the
grass tile, rock as the rock tile, and socket as a grass tile with a masonry socket base on
top — while remaining a single merged mesh built once at level load. Player-built structures
SHALL NOT repaint the ground: dirt stays dirt beneath walls and towers, so the ground mesh
never rebuilds during play.

#### Scenario: The palette reads at a glance

- **WHEN** a level with all four terrain kinds loads
- **THEN** dirt, grass, rock, and socketed tiles are visually distinct and the ground renders
  as one draw call

#### Scenario: Placement leaves the ground alone

- **WHEN** the player places or removes structures during a run
- **THEN** the ground mesh is not rebuilt and no tile changes appearance

### Requirement: Enemy grounding shadows

Every enemy SHALL render a shadow on the terrain directly beneath it, anchored to the enemy's
board position rather than its hover-bob height, so the tile an enemy occupies is legible at a
glance. The shadow SHALL follow the enemy's interpolated position every frame, SHALL be removed
with the enemy's mesh, and SHALL be render-side only — it never affects simulation state or the
state hash.

#### Scenario: Shadow marks the occupied tile

- **WHEN** an enemy hovers and bobs above the board
- **THEN** its shadow stays flat on the terrain beneath it, tracking its board position, and
  the shadow's screen position identifies the enemy's tile

#### Scenario: Shadow lifecycle matches the enemy

- **WHEN** an enemy dies or escapes and its mesh leaves the scene
- **THEN** its shadow leaves the scene in the same frame

#### Scenario: Shadows are cosmetic

- **WHEN** a run replays the same seed and commands with shadows enabled and disabled
- **THEN** both runs produce identical state hashes

### Requirement: Walls are kit masonry, not placeholders

Walls SHALL render as a kit masonry model from the same family as the tower base segments, so
walls, towers, and socket bases read as one structural vocabulary. The phase-2 placeholder wall
mesh is retired.

#### Scenario: One masonry family

- **WHEN** a wall, a tower, and an occupied socket are on screen together
- **THEN** all three read as variants of the same masonry family at correct 1×1 footprints
