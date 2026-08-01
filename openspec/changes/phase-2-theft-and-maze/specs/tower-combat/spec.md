# tower-combat

## Purpose

The minimal combat layer that makes the maze matter: one rapid-fire tower whose deterministic
hitscan kills turn maze length into interception chances, pay bounties into the treasury, and drop
carriers' sacks where they fall.

## ADDED Requirements

### Requirement: One rapid-fire tower with fixed stats

This phase SHALL provide exactly one tower type — rapid fire — with damage, range, and fire
interval defined in balance data. Enemies SHALL carry an integer `hp` stat from balance data.
Range checks SHALL compare squared fixed-point distances from the tower's center.

#### Scenario: Stats come from balance data

- **WHEN** the rapid-fire tower's damage, range, or fire interval is changed in balance data
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
