# Design: add-energy-infrastructure

## Context

See proposal.md for motivation. The constraints that shape this design come from ARCHITECTURE.md: the sim is bit-deterministic fixed-point integer math at 20 Hz with a documented tick order; money is integer milli-gold; interest already accrues only during waves and only on positive balance; structures live in a blocked mask with placement validation and an 80-tick removal delay; the replay-hash test enforces all of it. Energy must slot into that machinery without adding floats, wall-clock reads, or unstable iteration.

## Goals / Non-Goals

**Goals:**
- Energy as a pure flow (per-tick rate), never a stored stock — matching the "capacity, not currency" concept.
- Every energy rule expressible in integer arithmetic that joins the existing state hash.
- Zero new UI paradigms: panel goes in the existing build palette, energy readout in the existing HUD.

**Non-Goals:**
- Storage, sell-back, variable output, enemy–panel interaction, player-set budgets (see proposal non-goals).
- Balancing the actual numbers — balance.json values are placeholders until the project's P3/P4 balance-authoring work; this change defines structure and mechanics.

## Decisions

### D-E1: Energy units are integer milli-energy; the tariff converts to milli-gold at load

Same rationale as milli-gold (ARCHITECTURE.md §5): per-tick quantities are small, and whole-unit integers would truncate sub-unit accrual to zero, silently deleting the mechanic. The bill per tick is `flooredMul(uncoveredDemand, tariff)` with one explicit floor, mirroring the interest computation. Authoring files may use readable floats (e.g. `energyTariff: 0.5` gold per unit); zod conversion to integers happens once at load, as the level schema already does for the interest rate.

*Alternative rejected:* whole energy units — dies by truncation, exactly the failure milli-gold exists to prevent.

### D-E2: Coverage is computed once per tick in the economy step and applied with a one-tick lag

There is a circularity: fire rate depends on available energy (brownout), but demand depends on shots fired. Resolving it inside one tick would need iteration or ordering tricks. Instead:

- During the tower step of tick T, towers use `coverage(T−1)` (a stored sim field, initialised to full).
- The economy step of tick T then computes actual demand (sum of idle loads + per-shot costs of shots actually fired at T), subtracts solar, buys the remainder from the grid up to `max(0, balance)`, and stores `coverage(T) = min(1, powered/demand)` as a fixed-point ratio.

One tick is 50 ms — the lag is imperceptible, the computation is a single pass, and determinism is trivial. This also makes the brownout scenario semantics exact: the tick after the treasury hits zero is the first degraded tick.

*Alternative rejected:* fixed-point iteration within the tick — complexity with no observable benefit at 20 Hz.

### D-E3: Brownout stretches fire intervals; it never uses randomness

When a tower fires at coverage c (fixed-point, scale 1024), its next shot is scheduled at `tick + ceil(fireIntervalTicks * 1024 / c)`; at `c = 0` the tower simply does not fire and re-checks each tick. This yields exactly the spec's "half coverage → half fire rate" with pure integer math and no PRNG draws (probabilistic shot-skipping was rejected: it adds replay-visible noise and reads as flaky, not weak).

Slow-tower degradation works the same way (slower reapplication); slow *duration* is untouched.

### D-E4: The panel is a third structure kind sharing the wall code path

`grid.ts` structures become `wall | tower | panel`. The panel reuses the wall's 1×1 placement, validation, and 80-tick removal path unchanged; its only new behavior is contributing `output` to the economy step's solar sum. Enemies need no changes at all — a blocked tile is a blocked tile. This keeps the change additive: no existing invariant moves.

### D-E5: Billing joins the existing economy step in the tick order

Tick order step 9 ("Economy: interest accrual, bankruptcy check") becomes "Economy: energy billing, then interest accrual, then bankruptcy check". Billing before interest means interest is earned on the post-bill balance — the conservative reading, and it makes the opportunity-cost comparison honest (gold spent on energy earns no interest that tick). The order is documented in ARCHITECTURE.md §7 as part of the determinism contract.

### D-E6: Brownout state is sim state, not a render event

The renderer and HUD read `coverage` from the snapshot like any other field (tower tint, HUD warning). Render-only events stay reserved for instantaneous things (shots); coverage is continuous state and belongs in the hash.

## Risks / Trade-offs

- [Panels obsolete walls — a panel is a wall that pays dividends] → Price panels several multiples of a wall in balance data; keep walls as the cheap emergency maze piece. Flagged as an explicit playtest question.
- [Brownout compounds the death spiral: theft → broke → towers weaken → more theft] → Accepted intentionally (it extends the existing spiral design), but the existing mitigation lever (flat per-wave stipend, never softening theft) now also rescues brownouts. Playtest gate: is a zero-balance brownout recoverable via bounties?
- [Hybrid demand makes the bill spiky and hard to read] → HUD shows a per-second rolling figure (20-tick window) rather than raw per-tick cost.
- [One-tick coverage lag] → Imperceptible at 50 ms; documented here so it is not "discovered" as a bug.
- [Replay golden hash changes] → Regenerating it is the deliberate act ARCHITECTURE.md §12 describes; do it once, in its own commit.

## Open Questions

- Does removing a panel refund anything? The project has not defined sell/refund values for any structure yet; panels inherit whatever rule that future decision sets.
- Exact numbers (idle loads, shot costs, panel cost/output, tariff) — deferred to balance authoring alongside all other placeholder values in balance.json.
