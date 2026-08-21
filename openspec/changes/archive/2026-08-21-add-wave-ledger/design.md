# Design: Wave Ledger

## Context

See proposal.md — Why. What the design has to work with:

- **Every treasury mutation is already at a known site.** Ten lines in the simulation move
  `treasuryMg`: the bill and the bonus in `sim.ts` step 9 / settlement; placement, upgrade and
  connection upgrade in `sim.ts` command handlers; the removal refund in `placement.ts`; the
  grab, bounty, interest and sack return in `economy.ts`. Each already has `state` in scope.
- **The tick's power figures are derived and overwritten every advance** (`PowerReadout`,
  `sim.power`): draw, solar, grid supply, coverage, bill. The draw is a single sum; the
  engaged/standby split exists only inside `preTargetTowers`' loop.
- **The per-wave precedents** are `Structure.waveDamage` (one field, reset in `applyStartWave`,
  read as "this wave" or "last wave" by the phase) and `lastWaveBonusMg` (a hashed snapshot
  written at settlement). The run totals `stolenMg`, `escapedMg`, `kills` are hashed and read
  by nothing in the sim — the category this change extends.
- **The standing rule for state**: every field added to `SimState` gets its hash line in the
  same commit, and the replay goldens are re-minted deliberately with the milestones as the
  evidence the trajectory held.
- **UI precedent**: `powermeter.ts` (a pure state derivation with tests under the node test
  environment) behind `powerhud.ts` (DOM, class-variant swaps, a content key to skip DOM writes
  when nothing changed). Tests have no DOM; DOM behaviour is checked in the browser.
- **No disclosure/dropdown exists anywhere in the HUD or the mockups.** The top bar is
  `pointer-events-auto` over a board that receives pointer events directly; the palette owns
  the only Escape handler (clears the tool).
- The user's decisions, recorded here so the artifacts agree: stats accumulate settlement to
  settlement; the panels flip at wave start; build-phase spending is shown as its own block
  during the build phase; connection upgrades are construction; energy reads in kWh to one
  decimal.

## Goals / Non-Goals

**Goals:**

- Two accumulator structs in hashed state, written at the ten sites that already exist, with
  both identities provable on every tick by a test.
- One derivation of "which period is shown" and one rounding routine that guarantees the
  displayed figures add up — both pure and unit-tested.
- A disclosure pattern the next top-bar panel can reuse unchanged.
- The battery change adds two accumulator fields and two rows and touches nothing else here.

**Non-Goals:**

- Any snapshotting beyond the one closed period; any time series.
- A runtime assertion in the sim. The identities are checked by tests over harness runs;
  production code does not spend a branch per tick on them.
- Theming or layout work beyond the mockups' existing vocabulary (recessed slots, mono
  figures, caps labels).

## Decisions

### D1: One struct, two slots, no nulls

```ts
interface WaveLedger {
  /** Wave number whose start fell in this period; 0 until one does. */
  waveNo: number;
  openingMg: number;
  bountiesMg: number; bonusMg: number; interestMg: number;
  constructionMg: number; // net: purchases − refunds; may go negative in a selling build phase
  billMg: number; stolenMg: number; recoveredMg: number;
  engagedMp: number; standbyMp: number; solarUsedMp: number;
  solarWastedMp: number; gridMp: number; unmetMp: number;
}
SimState.ledger: WaveLedger;      // the open period
SimState.lastLedger: WaveLedger;  // the closed period; waveNo 0 ⇒ none yet
```

Rows are stored as **magnitudes with a fixed direction each**, except construction, which is
net. The identity in those terms is
`openingMg + bountiesMg + bonusMg + interestMg − constructionMg − billMg − stolenMg + recoveredMg === treasuryMg`.

*Why magnitudes, not signed flows*: every writer adds a positive amount at a site whose
direction is fixed (a bounty is always income), which keeps each write a one-liner and keeps
`stolenMg` the same sign convention as the run total of the same name. Construction is the
one row with writers in both directions, so it is net by definition.

*Why `lastLedger` is a full struct and not `| null`*: the hash walks both slots
unconditionally with no presence flag, the UI reads one shape, and `waveNo === 0` already
says "empty". A fresh period is a constant object spread with `openingMg` set; closing is
`lastLedger = { ...ledger }` — a copy, never an alias.

*Alternative rejected — one struct reset at wave start* (`waveDamage`'s pattern): it would
book build-phase spending to the wave *before* it and show the previous wave's ledger
mutating while the player builds. The user chose the settlement boundary; it needs the second
slot.

### D2: The period boundary is the last thing settlement does

In `stepProgression`'s settlement branch, after `returnSacks`, the bonus and the progression
judgement: `s.lastLedger = { ...s.ledger }; s.ledger = openLedger(s.treasuryMg)`. Sack return
and the bonus are therefore booked to the wave that earned them (run-lifecycle delta), and
the opening balance of the next period is exactly the balance the judgement saw. The run's
first period opens in the `SimState` initialiser with the starting treasury.

`waveNo` is written in `applyStartWave` (`s.ledger.waveNo = s.waveIndex`), which is the only
place the open period learns it has a wave — the same site that resets `waveDamage`.

### D3: Writers live beside the mutation they mirror

Each of the ten treasury sites gains one line touching `state.ledger`, in the same function,
with the same value:

| Site | Row |
|---|---|
| `economy.ts` `resolveDeaths` bounty | `bountiesMg +=` |
| `economy.ts` `accrueInterest` | `interestMg +=` (the floored amount actually credited) |
| `economy.ts` `resolveArrivals` grab | `stolenMg +=` |
| `economy.ts` `returnSacks` | `recoveredMg +=` |
| `sim.ts` step 9 bill | `billMg += this.power.billMg` |
| `sim.ts` settlement bonus | `bonusMg +=` |
| `sim.ts` `pushStructure`, `applyUpgrade`, `applyUpgradeGrid` | `constructionMg +=` |
| `placement.ts` `removeStructure` | `constructionMg −=` refund |

*Why not a single `credit(state, row, mg)` helper that also moves the treasury*: it would be
the right abstraction if this were greenfield, but it means rewriting ten sites that are each
documented in place and covered by their own tests, for a change whose promise is "observes,
never alters". The one-line-beside approach keeps every diff hunk trivially reviewable as
"same number, one more destination". The identity test is what guarantees no site is missed.

### D4: The engaged/standby split is derived, and the energy buckets are computed once in step 7

`preTargetTowers` already knows per tower whether it engaged; it sums `engagedMp` alongside
`drawMp` and returns both on `TargetPass`. `PowerReadout` gains `engagedMp` (standby is
`drawMp − engagedMp`). Neither is hashed — they are the tick's derived figures, like the rest
of the readout.

Immediately after `resolvePower` in step 7, with `draw`, `solar`, `grid` in hand:

```
solarUsed = min(solar, draw)
wasted    = solar − solarUsed
unmet     = draw − solarUsed − grid
```

and the six energy rows accumulate. `grid` is `gridSupplyMp` exactly as resolved (tier- and
balance-bounded), so `unmet` is whatever the merit order left uncovered — the brownout, in
energy units. The identity `draw + wasted = solar + grid + unmet` follows algebraically from
these definitions (`draw + max(0, solar − draw) = max(draw, solar) = solar + draw − solarUsed`),
so it can only break if a writer is wrong — which is what the test is for. `solar` there is the
panels' whole output: in accumulator terms
`engagedMp + standbyMp + solarWastedMp = (solarUsedMp + solarWastedMp) + gridMp + unmetMp`, and
the energy panel's *Solar* source row is accordingly `solarUsed + solarWasted` (D9's 30.5
includes its 3.7 wasted).

The build phase and the settlement tick accumulate nothing: step 7's `else` branch sets
`IDLE_POWER` and skips the accumulation; step 9 bills nothing on the settlement tick, and the
energy accumulation for that tick ran in step 7 before settlement was known — which is
correct, because towers did draw on that tick (the killing shot fires in step 7; the death
that ends the wave lands in step 8). Consequence: the settlement tick's grid supply is in the
energy rows but not in the bill row — the power-grid spec bills nothing on that tick, and the
bill row records what was debited. One tick in a thousand; documented, not corrected.

### D5: The shown period is a pure function of the two slots

```
shown(ledger, lastLedger):
  ledger.waveNo > 0      → { period: ledger,     preparing: null }
  lastLedger.waveNo > 0  → { period: lastLedger, preparing: ledger }
  otherwise              → { period: null,       preparing: ledger }   // before wave 1
```

This single rule serves both panels and every phase, including the terminal ones: a run that
ended at a final settlement shows the closed final wave (`ledger.waveNo` is 0 again); a run
conceded mid-wave shows the open period, frozen. `preparing` carries the build-phase block:
its only nonzero row is construction (interest, the bill, bounties, theft and recovery are all
wave-gated), so the block is simply the open period's construction and closing balance.

*Why not key on `runPhase`*: the phase says "build", not "which period has the wave"; the
terminal phases would need their own cases; and `waveNo` is the fact being asked about.

### D6: Displayed figures are reconciled by largest-remainder rounding, per block and per column

The panels promise that a reader summing the displayed rows lands exactly on the displayed
closing. Flooring each milli-gold row independently breaks that promise by a gold or two. So
the presentation module owns one routine:

```
reconcile(parts: number[], total: number, scale): number[]
  // returns parts in display units such that Σ result === total (in display units),
  // each result within one unit of its own rounded value (largest-remainder)
```

used three times: gold rows against `floor(closing) − floor(opening)` in a block; usage rows
against the kWh total; source rows against the same kWh total. The opening, closing and
balance lines are never adjusted — the balance line is `floor(treasuryMg / GOLD)`, the same
arithmetic as the readout, so it matches by construction.

*Alternative rejected — show one decimal of gold*: it shrinks the error without removing it,
and puts decimals on a gold figure the rest of the HUD shows whole.

### D7: kWh is kW·s; one real second is one game hour

`kWh = Σmp / POWER / TICK_HZ` — the per-tick mp sums divided by the existing fixed-point
scale and the tick rate, i.e. kilowatt-seconds relabelled as kilowatt-hours. Rationale:

- The authored tariff (`level.power.tariff`) is gold per kW per **second**, converted once at
  load to `tariffMgPer1000` (energy-infrastructure design D8). Under this convention the
  header shows the authored number with the unit `g/kWh` — no second conversion, no rounding
  drift. Format from `tariffMgPer1000 × TICK_HZ / GOLD`; for the level as authored that is
  exactly 0.24.
- Harness waves land at roughly 11–72 kWh — household-daily magnitudes that read well at one
  decimal. The physical figure (÷3600) would show `0.0` on every row.
- Nothing already on screen contradicts it: the meter's kW is instantaneous and unaffected;
  its `g/s` is "gold per game hour" under the same reading.

The convention is one constant in the presentation module (`KWH_PER_MP_TICK`) and one
sentence in the README's Power section. It is presentation only, like the kW label (D8 of the
energy design).

### D8: One disclosure controller, two anchored panels

`src/ui/disclosure.ts`: a small class owning *the* open panel (at most one), given
`(control: HTMLElement, panel: HTMLElement)` pairs. It sets `role="button"`, `tabindex="0"`,
`aria-expanded` and `aria-controls` on each control; toggles on `click` and on Enter/Space
`keydown`; closes on `Escape` (document `keydown`, only while open, so the palette's Escape is
unaffected when nothing is open) and on a document-level `pointerdown` in **capture** phase
whose target is outside the open control and panel — without `preventDefault` or
`stopPropagation`, so the same pointer-down proceeds to the board (build-ui delta: "still
reaches the board"). The panel element is `pointer-events-auto`, positioned under its control
on desktop (`absolute`, `top-full`, right-aligned to the slot) and as a full-width strip under
the compact top bar on mobile (`mobile:fixed mobile:inset-x-0`), `z-50` above the bar.

`hud.ts` (`TreasuryHud`) and `powerhud.ts` (`PowerHud`) each expose their slot element as the
control; `ledgerhud.ts` builds the two panels, reads `shown(...)` every frame, formats via
the pure module, and writes the DOM only when a content key changes (the inspector's pattern).
Panels keep refreshing while open; closed panels skip their DOM work entirely.

*Why not `<details>`*: no control over one-open-at-a-time, outside-click or Escape without
script anyway, and its summary styling fights the recessed-slot look.

### D9: Layout of the panels

Gold ledger (mono figures, right-aligned; sign glyphs on the rows; caps labels):

```
WAVE 4                     ← or "WAVE 3" + a PREPARING WAVE 4 block beneath
Opening              412
Bounties           + 180
Wave bonus          + 25
Interest             + 6
Construction       − 140
Energy              − 13
Stolen              − 40
Recovered           + 30
─────────────────────────
Closing              460   ← "Balance" on the last block, equals the readout
```

Energy balance (two columns; header carries the period and the tariff):

```
WAVE 4 · 0.24 g/kWh
USAGE          kWh    SOURCES          kWh
Engaged       31.2    Solar           30.5
Standby        8.1    Grid (billed)   12.5
Wasted         3.7    Unmet            0.0
──────────────────    ────────────────────
              43.0                    43.0
```

Before the first wave: the gold ledger is the preparing block alone (`Opening`,
`Construction`, `Balance`); the energy balance shows a single line, "No wave has run yet".
Labels use `Standby` — the sim's word — and `Energy` for the bill row in the gold ledger, as
the exploration decided. A percent column is a recorded lever, not built.

### D10: Tests

- `tests/ledger.test.ts` — per-row accumulation through each writer (place/remove nets to
  zero, a connection upgrade is construction, the bill equals the debit); the period close
  and the opening carry (D2); `waveNo` set at start and cleared by the close; the build phase
  accumulates no energy; and the two identity checks run **on every tick** of the leak
  harness's power-aware scripts (reuse `powerRun`'s driver or lift it into `helpers.ts`).
- `tests/ledger-ui.test.ts` (pure module) — `shown(...)` across all phase shapes; `reconcile`
  on cases where floors do not sum; kWh and tariff formatting, including the harness
  magnitudes.
- `tests/replay.test.ts` — both goldens re-minted once with a dated note, milestones
  untouched (`GOLDEN_IDLE_HASH` moves this time, and the note says why).
- `tests/hash.test.ts` — the ledger fields participate in the hash (flip one, the hash moves).
- Browser: the disclosure behaviours from the build-ui delta, both form factors, checked with
  the Playwright plugin during apply.

## Risks / Trade-offs

- **[A writer is missed or double-counted]** → the every-tick identity test over the harness
  scripts fails on the first tick it happens; the scripts cover every site (placement,
  upgrade, removal, grid upgrade, theft, brownout, settlement).
- **[Floored interest and bill per tick vs. a reader's mental arithmetic]** → rows are the
  debited/credited amounts, never recomputed from rates; the panel reconciles to what moved,
  and the tariff in the header is explicitly a valuation aid, not a recomputation of the bill.
- **[Hash re-mint hides a real trajectory change]** → the replay milestones (balances, kills,
  phases at known ticks) are the control; a re-mint is only accepted with all of them green
  and the idle run's move explained by the new unconditional fields.
- **[The outside-click capture listener interferes with the board or the palette]** → it
  only runs while a panel is open, never cancels the event, and the palette's Escape is
  unaffected when nothing is open; exploratory testing covers clicking a tile with a panel
  open.
- **[Mobile top bar is crowded; a full-width strip may cover the wave counter]** → the strip
  sits *below* the bar, not over it; a tap on the control closes it; verify in the mobile
  viewport before calling the UI done.
- **[The kWh fiction confuses a player who does the physics]** → the tariff header is in the
  same units, so the arithmetic a player can do (kWh × g/kWh ≈ bill) comes out right, which is
  the only arithmetic the panel invites.

## Open Questions

- Whether the preparing block also wants a derived "of which refundable" memo (the
  provisional structures' `paidMg`). Cheap, honest, and deferrable without touching state.
- Exact dropdown widths and the figure column alignment on the narrowest mobile viewport —
  decide against the live layout during apply.
