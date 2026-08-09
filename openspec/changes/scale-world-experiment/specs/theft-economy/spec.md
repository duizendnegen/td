# theft-economy — delta for scale-world-experiment

## ADDED Requirements

### Requirement: Carriers are faster and visibly marked

An enemy carrying any gold SHALL move at a balance-data percentage of its base speed
(`carrierSpeedPer100`, default 130 — a boost, making escapes urgent), and SHALL display a clearly
readable carried-gold indicator. The carrier factor SHALL keep its pinned position in the enemy
speed-modifier order: applied first, before any slow effect. An enemy carrying nothing SHALL move
at full speed even when returning.

#### Scenario: Loaded carrier speeds up

- **WHEN** an enemy grabs gold at the treasury with default balance data
- **THEN** its per-tick movement becomes `trunc(base speed × 130 / 100)` and a gold indicator
  appears above it

#### Scenario: Empty-handed returner keeps base speed

- **WHEN** an enemy flips to returning with a zero grab
- **THEN** it moves at 100% of its base speed and shows no gold indicator

#### Scenario: Slow applies after the carrier boost

- **WHEN** a non-slow-immune carrier is inside an active slow effect
- **THEN** its speed is the slow percentage applied to its carrier-boosted speed —
  `trunc(trunc(base × carrierSpeedPer100 / 100) × slowSpeedPercent / 100)` — preserving the
  pinned modifier order

## REMOVED Requirements

### Requirement: Carriers are slower and visibly marked

**Reason**: The 80% carrier slowdown made dragging out return trips a free interest farm and made
carrier interception too reliable. The experiment flips carriers to a data-driven speed boost so
escapes are urgent and the panic window is real.

**Migration**: Replaced by "Carriers are faster and visibly marked". The hardcoded 4/5 factor
becomes balance data (`carrierSpeedPer100`, default 130); the visible carried-gold indicator and
the modifier-order contract carry over unchanged.

## MODIFIED Requirements

### Requirement: Unclaimed sacks return to the treasury at settlement

When a wave's end-of-wave settlement runs, every gold sack still on the ground SHALL be credited
to the treasury at the balance-data sack recovery fraction (`sackRecoveryPer1000`, default 700) —
floored per sack in milli-gold — and removed, in a deterministic order. The remainder SHALL be
permanently lost. Mid-wave sack pickup by enemies is unaffected and transfers full value.

#### Scenario: Ground gold comes home

- **WHEN** a wave ends with sacks of 30 and 20 on the ground and `sackRecoveryPer1000` is 700
- **THEN** settlement credits 21 + 14 = 35 to the treasury, removes both sacks, and the remaining
  15 is gone from play permanently

#### Scenario: Full recovery remains expressible

- **WHEN** `sackRecoveryPer1000` is 1000
- **THEN** settlement credits every sack in full, matching the previous behavior
