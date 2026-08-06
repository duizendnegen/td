## MODIFIED Requirements

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
