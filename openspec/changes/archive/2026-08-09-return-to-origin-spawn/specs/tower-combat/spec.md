## MODIFIED Requirements

### Requirement: Sniper carrier-first targeting cascade

On its firing tick, a sniper SHALL select among in-range enemies by: first, any enemy carrying
gold (`carried > 0`, regardless of state), choosing the minimal cost at the enemy's current tile
in **that enemy's origin spawn's** returning field (closest to escaping through its own exit),
ties by insertion order; otherwise, the enemy with the highest `hp` stat in its type's stat
block, then minimal inbound-field cost, then insertion order. The cascade SHALL depend only on
simulation state.

#### Scenario: A laden carrier outranks everything

- **WHEN** a tank with high hp and a runner carrying 20 gold are both in range
- **THEN** the sniper targets the carrying runner

#### Scenario: Empty-handed returners are not carriers

- **WHEN** an enemy that grabbed nothing from an empty treasury walks back in returning state
  alongside an inbound tank
- **THEN** the sniper targets by the strongest rule, not the carrier rule

#### Scenario: The carrier closest to escaping dies first

- **WHEN** two carriers from different spawns are in range, and one stands on a tile with lower
  cost in its own origin field than the other has in its own
- **THEN** the sniper targets the carrier whose own-field cost is lower

#### Scenario: Equal tanks are focus-fired, not alternated

- **WHEN** two enemies of the same type and equal max hp are in range across several firing
  ticks
- **THEN** the sniper keeps targeting the one further along the inbound path until it dies or
  leaves range
