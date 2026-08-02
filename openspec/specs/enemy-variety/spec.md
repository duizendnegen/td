# enemy-variety

## Purpose

The three real enemy types whose stat blocks create the rock-paper-scissors pressure — each
punishing a missing tower archetype — plus typed spawning, debug burst presets to produce
gate-judgeable pressure on demand, and the counter-matrix balance contract enforced by a headless
harness.

## Requirements

### Requirement: Enemy types are stat blocks in balance data

The simulation SHALL support multiple enemy types — swarm, tank, and runner, plus a reserved
slow-immune type — each defined entirely by a balance-data stat block: `hp`, `speed`,
`carryCapacity`, `bounty`, `slowImmune`. All enemy behavior rules (movement, theft, combat)
SHALL read these stats; no enemy type SHALL have type-specific behavior code.

#### Scenario: Type differences are data differences

- **WHEN** a tank's hp or a runner's speed changes in balance data
- **THEN** simulation behavior follows the new values with no code change

#### Scenario: Slow-immune flag is honored

- **WHEN** a slow application targets an enemy whose stat block sets `slowImmune: true`
- **THEN** the enemy's speed and slow state are unchanged

### Requirement: Spawning is typed

Every spawn — timer-driven or debug-driven — SHALL name the enemy type to spawn, and the spawned
enemy SHALL carry that type's stat block. Spawn commands SHALL enter the simulation through the
ordinary command queue at tick boundaries.

#### Scenario: Typed spawn command

- **WHEN** a spawn command for a tank applies at a spawn tile
- **THEN** an enemy with the tank stat block enters the simulation that tick

### Requirement: Debug burst presets expand to ordinary commands outside the simulation

Authored burst presets — groups of `{type, count, spawnInterval}` — SHALL be expanded outside
the simulation into ordinary typed spawn commands issued at the scheduled tick boundaries. The
simulation SHALL hold no preset or schedule state: a recorded command stream SHALL reproduce a
burst identically without the preset mechanism present.

#### Scenario: Burst replay equivalence

- **WHEN** a burst preset spawns 10 swarms at 6-tick intervals and the session's command stream
  is replayed without the debug panel
- **THEN** both runs produce identical state hashes at every tick

### Requirement: Balance data satisfies the counter matrix

At equal treasury spend, shipped balance data SHALL satisfy the counter-matrix contract,
verified by automated headless simulation runs: a defense built from one damage archetype alone
SHALL leak a substantial fraction of stolen gold against the enemy type that punishes it (swarm
vs no area, tank vs no sniper, runner vs no slow), and a defense including the countering
archetype SHALL reduce that leakage below the harness's threshold. The harness's scripted
defenses, bursts, and thresholds SHALL live in versioned test data so a rebalance cannot
silently break the contract. Each spawn escape SHALL emit a render-only `goldLeaked` event
carrying the escaped amount — excluded from the state hash like all render events — which is
the harness's exact leak measure (and a hook for future leak feedback in the UI).

#### Scenario: Mono-archetype defense leaks against its punisher

- **WHEN** the harness runs a rapid-fire-only defense against a runner burst
- **THEN** leaked gold exceeds the mono-defense leak threshold defined by the harness

#### Scenario: The counter closes the leak

- **WHEN** the harness runs the same spend split between rapid fire and slow against the same
  runner burst
- **THEN** leaked gold falls below the countered leak threshold defined by the harness
