## ADDED Requirements

### Requirement: Towers record the effective damage they deal

Every structure SHALL carry two integer damage counters as simulation state entering the
canonical hash walk: damage dealt in the current or most recent wave, and damage dealt in total
since placement. When a tower's hit reduces an enemy's hp, both counters SHALL increase by the
**effective** damage — the lesser of the tower's damage stat and the enemy's hp immediately before
the hit — so overkill is never counted. Every enemy struck by an area burst SHALL contribute its
own effective damage to the bursting tower's counters. Slow towers deal no damage and SHALL leave
their counters at zero; walls SHALL carry both counters at zero.

#### Scenario: A hit within the target's hp counts in full

- **WHEN** a tower with 10 damage hits an enemy with 130 hp
- **THEN** the tower's wave and total counters both increase by 10

#### Scenario: Overkill counts only what landed

- **WHEN** a tower with 60 damage hits an enemy with 8 hp remaining
- **THEN** the tower's wave and total counters both increase by 8, not 60

#### Scenario: An area burst counts each enemy it hits

- **WHEN** an area tower with 20 damage bursts over three enemies with 130, 130 and 5 hp
- **THEN** the tower's counters increase by 45 in that tick

#### Scenario: A slow tower records nothing

- **WHEN** a slow tower fires at an enemy over many ticks
- **THEN** its wave and total counters remain 0

#### Scenario: Both counters are hashed

- **WHEN** two otherwise identical states differ only in one tower's total damage counter
- **THEN** their state hashes differ

### Requirement: The wave damage counter resets when a wave starts

Every structure's wave damage counter SHALL reset to zero in the tick a wave-start command applies,
and at no other time. Between the end of one wave and the start of the next, the counter SHALL
therefore hold the most recent wave's figure. The total counter SHALL never reset.

#### Scenario: Wave start clears the wave figure but not the total

- **WHEN** a tower has dealt 340 damage during a wave that has since settled, and the next wave
  starts
- **THEN** in the tick the wave-start applies its wave counter is 0 and its total counter is
  still 340

#### Scenario: Settlement leaves the wave figure standing

- **WHEN** a wave settles and the run returns to the build phase
- **THEN** every tower's wave counter still holds what it dealt during that wave

#### Scenario: A tower placed mid-wave starts from zero

- **WHEN** a tower is placed while a wave is running and then fires
- **THEN** its wave counter counts only the damage it has dealt since placement

### Requirement: Upgrades and moves preserve damage counters

An upgrade SHALL leave both damage counters unchanged; damage dealt after the upgrade continues
to accumulate onto the same counters. A move SHALL carry both counters with the structure to its
new tile.

#### Scenario: An upgrade continues the totals

- **WHEN** a tower with a total of 500 damage is upgraded and then deals 17 more
- **THEN** its total counter is 517

#### Scenario: A move keeps the history

- **WHEN** a tower with a wave counter of 120 and a total of 900 is moved during the build phase
- **THEN** the tower on its new tile reports a wave counter of 120 and a total of 900
