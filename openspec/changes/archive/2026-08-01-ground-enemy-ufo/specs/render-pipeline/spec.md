## ADDED Requirements

### Requirement: Enemies read on their true tile

Rendered enemies SHALL sit on the ground plane, with at most a small fixed clearance (no more
than 0.1 world units above the ground surface), and cosmetic animation SHALL NOT displace an
enemy vertically beyond that clearance. Under the fixed orthographic camera, an enemy's
screen-space position SHALL correspond to its simulation position on the board within a tenth
of a tile.

#### Scenario: No projected offset from elevation

- **WHEN** a stationary enemy occupies a tile and the board is viewed through the fixed
  isometric camera
- **THEN** the enemy's rendered silhouette is centred over that tile, not shifted toward a
  neighbouring tile

#### Scenario: Cosmetic motion stays grounded

- **WHEN** an enemy's idle animation (wobble, spin) plays over any duration
- **THEN** the enemy neither clips below the ground surface nor rises beyond the fixed
  clearance above it

### Requirement: Enemies carry a ground contact marker

Each rendered enemy SHALL display a flat contact decal on the ground plane directly beneath its
interpolated position, so the point of ground contact is unambiguous despite the rounded hull.
The decal SHALL appear when the enemy spawns, follow it every frame, and be removed when the
enemy is removed.

#### Scenario: Decal tracks the enemy

- **WHEN** an enemy moves along its path
- **THEN** a ground-level decal remains centred beneath the enemy every frame

#### Scenario: Decal lifecycle matches the enemy

- **WHEN** an enemy dies or escapes and is removed from the simulation
- **THEN** its contact decal is removed from the scene in the same frame as its mesh
