## ADDED Requirements

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
