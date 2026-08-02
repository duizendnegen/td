# tower-combat

## Purpose

The combat layer that makes the maze matter: four tower archetypes whose deterministic hitscan
kills turn maze length into interception chances, pay bounties into the treasury, and drop
carriers' sacks where they fall — with targeting priorities that give the maze's two ends
distinct tactical roles.

## Requirements

### Requirement: Four tower archetypes with stats from balance data

The simulation SHALL provide four tower archetypes — rapid fire, sniper, area damage, and slow —
whose stats are defined in balance data. Range checks SHALL compare squared fixed-point distances
from the tower's center. Rapid fire, area damage, and slow SHALL use first-along-path targeting;
the sniper SHALL use the carrier-first cascade.

#### Scenario: Archetype stats come from balance data

- **WHEN** any archetype's damage, range, fire interval, burst radius, slow percentage, or slow
  duration is changed in balance data
- **THEN** simulation behavior follows the new values with no code change

### Requirement: Deterministic first-along-path targeting

On any tick at or after its next-fire tick, a tower with at least one enemy in range SHALL select
the in-range enemy furthest along its path — the one whose current tile has the minimal
inbound-field cost — breaking ties by enemy insertion order. Target selection SHALL depend only on
simulation state, never on render or timing.

#### Scenario: Furthest-along enemy is chosen

- **WHEN** two enemies are in range and one stands on a tile with lower inbound-field cost
- **THEN** the tower targets the enemy on the lower-cost tile

#### Scenario: Tie broken by insertion order

- **WHEN** two in-range enemies stand on tiles of equal inbound-field cost
- **THEN** the earlier-inserted enemy is targeted, identically on every replay

### Requirement: Sniper carrier-first targeting cascade

On its firing tick, a sniper SHALL select among in-range enemies by: first, any enemy carrying
gold (`carried > 0`, regardless of state), choosing the minimal returning-field cost at the
enemy's current tile (closest to escaping), ties by insertion order; otherwise, the enemy with
the highest `hp` stat in its type's stat block, then minimal inbound-field cost, then insertion
order. The cascade SHALL depend only on simulation state.

#### Scenario: A laden carrier outranks everything

- **WHEN** a tank with high hp and a runner carrying 20 gold are both in range
- **THEN** the sniper targets the carrying runner

#### Scenario: Empty-handed returners are not carriers

- **WHEN** an enemy that grabbed nothing from an empty treasury walks back in returning state
  alongside an inbound tank
- **THEN** the sniper targets by the strongest rule, not the carrier rule

#### Scenario: The carrier closest to escaping dies first

- **WHEN** two carriers are in range and one stands on a tile with lower returning-field cost
- **THEN** the sniper targets the carrier on the lower-cost tile

#### Scenario: Equal tanks are focus-fired, not alternated

- **WHEN** two enemies of the same type and equal max hp are in range across several firing
  ticks
- **THEN** the sniper keeps targeting the one further along the inbound path until it dies or
  leaves range

### Requirement: Area damage bursts around the target position

On its firing tick, an area tower SHALL select a target by first-along-path, then reduce the hp
of every enemy whose squared fixed-point distance from the target's position is within the burst
radius by the tower's damage — flat, with no falloff — in that same tick. Each burst SHALL emit
a render-only burst event carrying the center and radius, excluded from the state hash like all
render events.

#### Scenario: The clump is hit flat

- **WHEN** three swarm enemies stand within the burst radius of the targeted enemy's position
- **THEN** all three lose exactly the tower's damage that tick

#### Scenario: Simultaneous carrier deaths merge sacks per tile

- **WHEN** one burst kills two carriers standing on the same tile
- **THEN** both bounties are credited and the tile holds a single sack containing both carried
  amounts

### Requirement: Slow is a timed status applied to a targeted enemy

On its firing tick, a slow tower SHALL select a target by first-along-path and set the target's
slow expiry to `max(current expiry, current tick + slow duration)`. While an enemy's slow is
unexpired, its movement speed SHALL be multiplied by the single global slow percentage from
balance data, compounding with the carrier speed factor in one fixed, documented integer
evaluation order. Slow SHALL never stack in strength, SHALL deal no damage, and the slow expiry
SHALL be simulation state entering the canonical hash walk.

#### Scenario: Re-application extends, never stacks

- **WHEN** an already-slowed enemy is slowed again
- **THEN** its expiry is the later of the two and its speed multiplier is unchanged

#### Scenario: A slowed carrier compounds both factors deterministically

- **WHEN** a carrying enemy is slowed
- **THEN** its speed reflects the carrier factor and the slow percentage applied in the
  documented order, producing the identical integer speed on every replay

#### Scenario: Slow expires on time

- **WHEN** an enemy's slow expiry tick is reached
- **THEN** the enemy moves at full (or carrier-factored) speed from that tick

### Requirement: Within a tick, towers fire in insertion order and skip the dead

Towers due to fire on a tick SHALL resolve in tower insertion order, and target selection SHALL
consider only enemies with `hp > 0` at the moment of that tower's selection — an enemy killed
by an earlier tower in the same tick SHALL NOT be targeted by a later one. This ordering SHALL
be identical on every replay.

#### Scenario: No shots are wasted on the dead

- **WHEN** an area burst kills a swarm enemy and a later-built rapid tower with only that enemy
  in range resolves in the same tick
- **THEN** the rapid tower holds fire and its next-fire tick does not advance

#### Scenario: Build order pins same-tick resolution

- **WHEN** two towers cover the same enemy and both fire on the same tick in two replayed runs
- **THEN** the earlier-built tower's damage lands first in both runs, with identical hashes

### Requirement: Hitscan damage lands on the firing tick

When a tower fires, the target's `hp` SHALL be reduced by the tower's damage in that same tick, and
the tower's next-fire tick SHALL advance by its fire interval. Each shot SHALL emit a tracer event
consumed only by the renderer: render events SHALL NOT feed back into simulation state and SHALL be
excluded from the state hash.

#### Scenario: Damage is immediate

- **WHEN** a tower fires at an enemy with 30 hp using 10 damage
- **THEN** the enemy has 20 hp in that tick's post-state

#### Scenario: Tracer events do not affect the hash

- **WHEN** the same seed and commands run once with the renderer draining events and once with
  events discarded
- **THEN** both runs produce identical state hashes

### Requirement: Deaths pay bounties and carriers drop their sacks

When an enemy's `hp` reaches 0 or below it SHALL be removed that tick, and its bounty (from
balance data) SHALL be credited to the treasury the same tick. If it was carrying gold, the carried
amount SHALL become a sack on the tile it died on.

#### Scenario: Killing a carrier drops the gold where it died

- **WHEN** a returning enemy carrying 50 is killed mid-maze
- **THEN** its bounty is added to the treasury and a 50-gold sack appears on its death tile that
  same tick

#### Scenario: Killing a non-carrier drops nothing

- **WHEN** an inbound enemy carrying nothing is killed
- **THEN** its bounty is credited and no sack is created
