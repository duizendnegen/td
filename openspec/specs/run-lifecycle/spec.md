# run-lifecycle

## Purpose

The session state machine that composes waves into a complete playable run: end-of-wave
settlement, the solvency gate that replaces a hard bankruptcy threshold, manual concession,
solvent-to-win, and the run summary.

## Requirements

### Requirement: End-of-wave settlement is a single deterministic sequence

When a wave's last enemy dies or escapes, the system SHALL run settlement in one deterministic
order within that tick: unclaimed gold sacks return to the treasury, interest accrual stops,
and run progression is then judged on the post-return balance (win check after the final wave,
solvency gate otherwise).

#### Scenario: Sack return precedes the solvency judgement

- **WHEN** a wave ends with the treasury at −30 and 50 gold lying in unclaimed sacks
- **THEN** settlement returns the 50 first and the run continues unlocked at +20

### Requirement: Starting a wave requires solvency

The start-wave command SHALL be accepted only while the treasury balance is ≥ 0. While the
balance is negative between waves, the run SHALL be wave-locked: structure removal (with its
normal delay and refund) remains available, and the resulting refunds are the only income.
Reaching balance ≥ 0 SHALL unlock the start-wave command with no further condition.

#### Scenario: Negative settlement locks the next wave

- **WHEN** settlement completes with the balance at −40
- **THEN** start-wave commands are rejected until the balance is ≥ 0

#### Scenario: Selling defense unlocks the wave

- **WHEN** the run is wave-locked at −40 and the player completes removals refunding 45
- **THEN** the balance reaches +5 and the start-wave command is accepted again

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
- **THEN** the run is not yet won, and it ends as won in the tick a completed removal's refund
  brings the balance to ≥ 0

### Requirement: Run summary accounting

The simulation SHALL deterministically accumulate, as part of hashed state: total gold grabbed
from the treasury, total gold escaped through spawns, total enemies killed, and expose them
with the final balance as the run summary when the run ends.

#### Scenario: Summary reflects the run

- **WHEN** a run ends in which enemies grabbed 300, escaped with 120, and 47 died
- **THEN** the run summary reports stolen 300, escaped 120, kills 47, and the final balance
