# render-pipeline

## ADDED Requirements

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

### Requirement: Walls are kit masonry, not placeholders

Walls SHALL render as a kit masonry model from the same family as the tower base segments, so
walls, towers, and socket bases read as one structural vocabulary. The phase-2 placeholder wall
mesh is retired.

#### Scenario: One masonry family

- **WHEN** a wall, a tower, and an occupied socket are on screen together
- **THEN** all three read as variants of the same masonry family at correct 1×1 footprints
