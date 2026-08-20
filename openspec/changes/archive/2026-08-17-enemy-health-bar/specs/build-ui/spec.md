# build-ui — delta for enemy-health-bar

## ADDED Requirements

### Requirement: Enemy health bar

An enemy that has taken any damage SHALL display a health bar above its model, purely
render-side and readable from the isometric camera. The bar SHALL be a full-width red track with a
green segment anchored at its left edge whose width is the enemy's remaining hp as a fraction of
its type's hp stat, so the red portion is revealed from the right as hp is lost. An enemy at full
hp SHALL show no bar. The bar SHALL be sized in proportion to the enemy's render scale — a larger
model carries a wider bar — SHALL follow the model, including its hover motion, SHALL face the
camera, and SHALL be drawn over any world geometry that would otherwise occlude it. The bar SHALL
be removed together with the enemy, whether it dies or leaks. Displaying the bar SHALL NOT change
simulation state or the state hash.

#### Scenario: A hit reveals the bar

- **WHEN** an enemy at full hp is hit for a quarter of its type's hp
- **THEN** a health bar appears above it, three-quarters green from the left with the remaining
  quarter red on the right

#### Scenario: Full hp shows nothing

- **WHEN** an enemy has not been damaged
- **THEN** it displays no health bar

#### Scenario: The bar shrinks with further damage

- **WHEN** a damaged enemy is hit again
- **THEN** its green segment shortens to the new remaining fraction and the red portion grows
  from the right, with the bar staying at the same width and position relative to the model

#### Scenario: The bar reads through a maze wall

- **WHEN** a damaged enemy flies through a wall canyon that would occlude it from the camera
- **THEN** its health bar remains visible

#### Scenario: Larger models carry wider bars

- **WHEN** a damaged tank and a damaged swarm enemy are side by side
- **THEN** the tank's bar is visibly wider than the swarm enemy's

#### Scenario: Death removes the bar

- **WHEN** a damaged enemy is killed or leaves the board
- **THEN** no bar remains where it was
