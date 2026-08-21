# run-lifecycle

## Purpose

The session state machine that composes waves into a complete playable run: end-of-wave
settlement, the solvency gate that replaces a hard bankruptcy threshold, manual concession,
solvent-to-win, and the run summary.

## Requirements

### Requirement: End-of-wave settlement is a single deterministic sequence

When a wave's last enemy dies or escapes, the system SHALL run settlement in one deterministic
order within that tick: unclaimed gold sacks return to the treasury, the wave speed bonus is
credited, grid billing and interest accrual stop (neither runs on the settlement tick), and run
progression is then judged on the post-return, post-bonus balance (win check after the final
wave, solvency gate otherwise).

#### Scenario: Sack return precedes the solvency judgement

- **WHEN** a wave ends with the treasury at −30 and 50 gold lying in unclaimed sacks
- **THEN** settlement returns the 50 first and the run continues unlocked at +20

#### Scenario: The bonus can rescue solvency

- **WHEN** a wave ends with the treasury at −10 after sack return and the wave's speed bonus is
  15
- **THEN** the bonus is credited before the judgement and the run continues unlocked at +5

#### Scenario: No bill on the settlement tick

- **WHEN** the last enemy of a wave dies on a tick
- **THEN** that tick charges no grid bill and no interest, and the build phase that follows
  charges nothing

### Requirement: Wave speed bonus rewards finishing quickly

The system SHALL credit a wave speed bonus to the treasury during end-of-wave settlement. The
bonus amount SHALL be a deterministic function of the wave's duration (ticks from wave start to
the settlement tick) and of tuning parameters defined in balance data, SHALL be non-increasing
as the duration grows, and SHALL reach zero for sufficiently long waves — so stretching a wave
out is never more profitable than ending it. The credited bonus SHALL be part of hashed
simulation state and reflected in the treasury before the settlement judgement runs.

#### Scenario: Faster clear pays more

- **WHEN** the same wave is cleared once in 400 ticks and once in 900 ticks
- **THEN** the 400-tick clear's settlement credits a bonus greater than or equal to the
  900-tick clear's, and both amounts are fully determined by wave duration and balance data

#### Scenario: A stretched wave earns nothing

- **WHEN** a wave's duration exceeds the balance-data bonus window
- **THEN** settlement credits a bonus of zero

#### Scenario: Bonus is deterministic

- **WHEN** two runs replay the same seed and commands
- **THEN** both credit identical wave bonuses and produce identical state hashes

### Requirement: Starting a wave requires solvency

The start-wave command SHALL be accepted only while the treasury balance is ≥ 0. While the
balance is negative between waves, the run SHALL be wave-locked: immediate structure removal, with
its refund credited in the tick the removal command applies, remains available, and the resulting
refunds are the only income. Reaching balance ≥ 0 SHALL unlock the start-wave command with no
further condition.

#### Scenario: Negative settlement locks the next wave

- **WHEN** settlement completes with the balance at −40
- **THEN** start-wave commands are rejected until the balance is ≥ 0

#### Scenario: Selling defense unlocks the wave

- **WHEN** the run is wave-locked at −40 and the player removes structures refunding 45
- **THEN** the balance reaches +5 in the tick the last of those removals applies, and the
  start-wave command is accepted from that tick on

### Requirement: The run is lost only by concession

The system SHALL never end the run as lost automatically — not at any negative balance, and
not when recovery is impossible. A concede command SHALL be available throughout the run and
SHALL end it immediately in the lost state.

#### Scenario: Irrecoverable debt does not auto-lose

- **WHEN** the balance is negative and the sum of every remaining structure's refund value is
  less than the debt
- **THEN** the run remains in the wave-locked state until the player concedes

#### Scenario: Concede ends the run

- **WHEN** a concede command is applied at any point during a run
- **THEN** the run ends as lost and the run summary is produced

### Requirement: Winning requires surviving all waves solvent

After the final wave's settlement, the run SHALL be won immediately if the balance is ≥ 0. If
the balance is negative, the run SHALL enter the same wave-locked sell-to-recover state, and
the win SHALL fire at the moment the balance reaches ≥ 0. Concession remains available.

#### Scenario: Solvent finish wins at settlement

- **WHEN** the final wave's settlement completes with the balance at +120
- **THEN** the run ends as won in that tick

#### Scenario: Indebted finish must liquidate to claim victory

- **WHEN** the final wave's settlement completes with the balance at −60
- **THEN** the run is not yet won, and it ends as won in the same tick a removal command's refund
  brings the balance to ≥ 0

### Requirement: A wave's first advanced tick commits standing construction

The first tick the simulation advances while a wave is running SHALL commit every standing
structure, clearing its provisional state, before that tick's wave scheduling and combat run. The
start-wave decision is therefore the point at which the build phase's construction becomes
irreversible at full value.

#### Scenario: The wave begins against committed construction

- **WHEN** a player builds through a build phase and starts a wave
- **THEN** the wave's first advanced tick commits everything standing before any enemy spawns for
  that tick

#### Scenario: Starting a wave without advancing does not commit

- **WHEN** the start-wave command is committed but time has not advanced
- **THEN** standing structures are still provisional, and become committed on the first advance

### Requirement: Liquidation value accounts for the refund each structure would pay

Any calculation of the total value a player could raise by selling everything standing SHALL sum
each structure's own refund — full for provisional structures, the removal refund fraction for
committed ones — rather than applying one flat rate across all of them.

#### Scenario: A recoverable run is not declared dead

- **WHEN** the balance is negative and the standing structures include provisional ones whose full
  refunds would clear the debt, though half-refunds would not
- **THEN** the run is not reported as impossible to recover

#### Scenario: Provisional value cannot be extracted

- **WHEN** a provisional structure is placed and then removed
- **THEN** the treasury returns to its value before the placement, so the round trip raises nothing

### Requirement: Run summary accounting

The simulation SHALL deterministically accumulate, as part of hashed state: total gold grabbed
from the treasury, total gold escaped through spawns, total enemies killed, and expose them
with the final balance as the run summary when the run ends.

#### Scenario: Summary reflects the run

- **WHEN** a run ends in which enemies grabbed 300, escaped with 120, and 47 died
- **THEN** the run summary reports stolen 300, escaped 120, kills 47, and the final balance
