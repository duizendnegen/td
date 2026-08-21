## MODIFIED Requirements

### Requirement: End-of-wave settlement is a single deterministic sequence

When a wave's last enemy dies or escapes, the system SHALL run settlement in one deterministic
order within that tick: unclaimed gold sacks return to the treasury, the wave speed bonus is
credited, grid billing and interest accrual stop (neither runs on the settlement tick), run
progression is then judged on the post-return, post-bonus balance (win check after the final
wave, solvency gate otherwise), and finally the open ledger period closes on that balance and a
fresh period opens (wave-ledger spec) — so the sack return and the bonus are booked to the wave
that earned them, and the build phase that follows starts a clean period.

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

#### Scenario: The period closes last

- **WHEN** a wave ends with 50 returned from sacks and a speed bonus of 15, settling at 460
- **THEN** the closed period records recovered 50 and bonus 15, and the period that opens for
  the next build phase has an opening balance of 460
