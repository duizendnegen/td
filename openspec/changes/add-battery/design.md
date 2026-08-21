# Design: add-battery

## Context

See proposal.md for motivation. What this builds on, as of `agent/energy-infrastructure`:

- **The storage slot exists by name.** `resolvePower(draw, solar, tierCapacity, treasury,
  tariff)` in `src/sim/power.ts` is a pure function whose doc comment reserves the slot between
  solar and grid; ARCHITECTURE D15 and the power-grid spec say the same. Step 7 of the tick
  runs the target pre-pass, calls `resolvePower`, publishes a derived `PowerReadout`
  (`sim.power`, unhashed, overwritten every tick, `IDLE_POWER` outside a wave), writes the
  ledger's six energy rows from the same figures, then fires at the resolved coverage. Step 9
  debits `power.billMg` — except on the settlement tick.
- **The panel is "a wall with an output".** `StructureKind = 'wall' | 'tower' | 'panel'`;
  the ground layer is `groundAt` (wall or panel, at most one per tile), the foundation lookup
  is `wallAt`. The literal `'panel'` appears in nine non-render places: two ground checks in
  `placement.ts`, the price branch in `applyPlace`, `solarOf`, the palette tool union and card,
  and the kind union itself. Everything else — validation, provisional/committed refund,
  between-wave-only removal, move — is kind-agnostic already.
- **The ledger is hashed state nothing reads.** `WaveLedger` has fifteen fields walked in
  declaration order by `mixLedger`; both slots are hashed unconditionally, so every new field
  moves both replay goldens. The ledger accumulates on the settlement tick too (towers drew on
  it) while step 9 bills nothing for it — documented, not corrected.
- **Energy presentation is settled:** one second of wave time is one hour, so kW·s reads as kWh
  (`KWH_PER_MP_TICK`, `formatKwh`, `formatTariff` in `src/ui/ledger.ts`). The balance panel's
  columns are reconciled to their displayed total by `reconcile`.
- **Data conversion pattern:** authored readable units → integer sim units once at load
  (`ratedPowerMp`, `panelOutputMp`, `tariffMgPer1000`), with `POWER`, `GOLD`, `TICK_HZ` in
  `src/sim/fixed.ts`.
- **Constraints carried over:** integer-only sim, every new state field hashed in the commit it
  lands, no clock, building allowed during waves, inform-don't-block.

## Goals / Non-Goals

**Goals:**

- Fill the slot without moving anything around it: `resolvePower` stays pure, the merit order's
  grid bounds are untouched, the ledger identity gains one term per side and nothing else.
- One new hashed integer; capacity derived, never stored.
- The battery reuses the panel's path by predicate, not by copy — the fourth kind costs a
  handful of kind checks, not a fourth branch through placement.

**Non-Goals (design-level; scope non-goals are in the proposal):**

- Per-battery state of any kind. A reserve policy. Any reading of the store by a rule other
  than the merit order (the store is a supply, not a resource the player spends).
- A kit asset for the battery — a primitive placeholder, like the panel's.

## Decisions

### D1: The battery is a fourth `StructureKind`, and the ground layer becomes a predicate

`StructureKind` gains `'battery'` (`STRUCTURE_KIND_ID.battery = 3`). The two
`kind === 'wall' || kind === 'panel'` checks in `placement.ts` and the move's
`there.kind === 'panel'` occupancy check become one `isGround(kind)` predicate
(`wall | panel | battery`) and one `isUtility(kind)` / "not a foundation" predicate
(`panel | battery`); `applyPlace` prices by kind; `Sim.laysGround` covers the new kind.
`wallAt` stays the foundation lookup and is unchanged.

*Why not reuse `'panel'` with a variant field:* the kind is the discriminator everywhere — the
hash, the mesh, `solarOf`, the palette — and `solarOf` must not count a battery. Overloading
`archetypeId` (−1 for ground structures today) to tell them apart would put meaning in a field
whose name says otherwise and leak into every `archetypeId` consumer. A fourth kind is the
honest shape; the predicate is what keeps it from being a fourth code path.

*Why not a non-spatial purchase like the grid tier:* the proposal's "battery without a panel
stores nothing" makes the battery the second purchase of a solar line, and a solar line costs
maze tiles by design (energy-infrastructure D7). A free-floating battery would be the only
infrastructure that does not compete with the maze.

### D2: One pooled store on `SimState`; capacity is `count(battery) × capacity`

`SimState.storedMpTick` (integer energy units: power units × ticks, the same product the
ledger's rows sum), initial 0, hashed immediately after `gridTier`. Capacity is
`storageCapacityOf(structures, data)` in `power.ts`, derived each time it is needed like
`solarOf`. The board shows every battery at `stored ÷ capacity`.

*Rejected:* per-battery charge. It reads prettily (columns at different levels) but needs a
fill order and a drain order, a per-structure hashed field, and move/sell semantics per
structure — for no rule that could tell the difference. The pool is what the merit order
consumes; the pool is the state.

### D3: `resolvePower` grows two inputs and two outputs, and stays pure; the sim applies the delta

```
resolvePower(drawMp, solarMp, storedMpTick, capacityMpTick, tierCapacityMp, treasuryMg, tariffMgPer1000)
  surplus  = max(0, solar − draw)
  charged  = min(surplus, capacity − stored)          // 0 when no batteries
  deficit  = max(0, draw − solar)
  battery  = min(deficit, stored)
  grid     = min(deficit − battery, tierCapacity, affordable)   // bounds exactly as today
  supplied = min(draw, solar) + battery + grid
  coverage = draw === 0 ? SCALE : min(SCALE, floor(supplied × SCALE / draw))
  bill     = floor(grid × tariff / 1000)
  → { batterySupplyMp: battery, chargedMp: charged, gridSupplyMp, coverage, billMg }
```

`surplus` and `deficit` cannot both be positive, so a tick charges or discharges, never both,
without a rule saying so. The sim applies `storedMpTick += charged − battery` in step 7, the
tick the order resolves, and publishes both figures on `PowerReadout`. No rate term: `min`
against the whole store is the "no rate limit" decision in one line, and a rate lever later is
one more argument to the same two `min`s.

*Why mutate in step 7 and not step 9 like the bill:* the bill is gold and step 9 is where the
treasury moves; the store is energy and step 7 is where energy resolves. Carrying a pending
delta to step 9 would buy nothing and add a field. It also settles the settlement tick for
free (D4).

### D4: The store moves on the settlement tick; the bill still does not

The settlement tick's supply resolution is real — towers fired at its coverage and the ledger
already books it — so the store charges or discharges on it like any wave tick. The step-9
bill exemption is unchanged: it is a gold rule about the tick the wave "is over", and the
ledger's existing note ("accumulates here too; documented, not corrected") now describes the
store as well. Net effect: the ledger's `charging` and `battery` rows and the store's actual
movement agree tick for tick, which a reserve of one exempt tick would have broken.

### D5: Capacity shrink clamps eagerly, in the removal path

`removeStructure` (the one place a battery leaves the board) clamps
`storedMpTick = min(storedMpTick, newCapacity)` after the structure is gone. Moves never
change the count. Placement never shrinks capacity.

*Rejected:* lazy clamp at the next power step. It would let hashed state exceed capacity for
the whole build phase — the meter would read "16 of 10 kWh" — and the clamp would then land
in a wave tick where the ledger's identity wants every change accounted for. Eager, the loss
happens outside any wave tick and is no row's business (wave-ledger delta).

### D6: Ledger gains `chargedMp` (usage) and `batteryMp` (source), nothing else

Two fields appended to `WaveLedger` in the positions the ROADMAP named; `mixLedger` walks
seventeen. Step 7 books `chargedMp += charged`, `batteryMp += battery`, and `solarWastedMp`
becomes `surplus − charged`; `unmetMp` is `draw − solarUsed − battery − grid`. The identity
`engaged + standby + charging + wasted = solar + battery + grid + unmet` holds by construction
(both sides equal `max(draw, solar)`); the existing identity test gains the two terms and a
battery in its scripted run. `energyBalance` in `src/ui/ledger.ts` adds the rows to the raw
arrays it already reconciles — the presentation module needs no new concept.

### D7: Capacity authored in kWh under the ledger's convention

`balance.power.battery { cost, capacity }`, capacity in kWh; at load
`batteryCapacityMpTick = round(capacity × POWER × TICK_HZ)` — one kWh is one power unit for
one second, i.e. `POWER` mp for `TICK_HZ` ticks. The palette card, the meter and F4 present
the store through the same `formatKwh`. A 10 kWh battery therefore fills in ten seconds of a
1 kW surplus and empties in ten seconds of a 1 kW deficit, which is what the harness's load
curves are measured in.

*Rejected:* a new unit (kJ, "seconds at rated power"). The ledger already made the kWh call;
two conventions for one quantity is how the HUD stops being legible.

### D8: HUD — one card, one meter line, two ledger rows, one gauge

- **Palette:** `Tool` gains `'battery'`; the card slots after Solar with hotkey 7; Remove and
  Move shift to 8 and 9, the same shift the panel card made. Tag reads the capacity in kWh.
- **Meter:** while any battery stands, a stored-energy line `6.0 / 10.0 kWh` in both phases
  (the reserve is a planning read, like the rated total), and the battery's share in the live
  split during a wave. No battery, no line — the meter does not grow for players who have not
  bought one.
- **Board:** a primitive placeholder in `src/render/towers.ts` beside the panel's — a cabinet
  with a front gauge whose fill scales with `stored ÷ capacity` read from the snapshot each
  frame. Shared geometry and materials like the panel's; the ghost gets the translucent
  variant the panel already has. Not dimmed by brownout (towers only), marked provisional like
  any structure.
- **F4:** `battery ±x kW` in the supply line during a wave; `stored a / b kWh` whenever a
  battery stands.

### D9: Balance placeholders shaped by the proposal's intent

`battery { cost: 60, capacity: 12 }` as the starting point: below the panel (90), three walls'
worth; twelve kWh is roughly one panel's quiet-tick surplus over a wave and a half against the
harness's authored defense, so one panel never fills it and two do. The harness's power-aware
block gains a run with a panel and a battery next to the existing panel-less ones; the
assertions are directional (bill and wasted both fall; the store never exceeds capacity; the
store is non-zero at some settlement). Tuning is balance authoring.

## Levers (recorded, not shipped)

- **L1 Rate limit — "shaving peaks is a capacity increase".** A per-battery `power` figure,
  `charged = min(surplus, N × power, room)` and `battery = min(deficit, N × power, stored)`;
  the meter's ceiling becomes *grid + solar + battery power (while charged)*. Turns
  bill-shaving into ceiling-raising and makes a second battery matter even when the first is
  never full. Two `min` arguments and a data field.
- **L2 Grid charging.** On a tick with spare tier capacity and a positive balance, buy into
  the store at the tariff. No gold saved at a flat tariff; shaves capacity peaks without solar.
  Contradicts "stores what would be wasted" — consider only with L1.
- **L3 Per-level tariff** (energy-infrastructure L4) — the knob that makes storage dominant on
  an "energy crisis" level. Data only.
- **L4 Round-trip loss.** A per-1000 efficiency on `charged`. One multiplication; the
  ledger's `charging` row would then exceed what the store gains, and a `lost` row would be
  needed to keep the identity — which is why it is not free.

## Risks / Trade-offs

- [Without a rate limit, a charged store covers any deficit, so a brownout cannot begin until
  the store is empty] → intended for now: the store is small and only surplus fills it; the
  meter shows it draining, and L1 is the designed answer if "infinite while charged" reads
  wrong in play.
- [A battery bought before any panel does nothing, and the palette does not say so] → the
  card's capacity tag and the meter's `0.0 / 12.0 kWh` line make the empty store visible;
  inform-don't-block. A hint on the card ("charges from surplus solar") is UI copy, not a
  rule.
- [The store's gold value at the current tariff is small (a full 12 kWh ≈ 3 g)] → the pitch
  is ceiling and UPS, the bill is the bonus; the ledger's `battery` row makes the energy
  visible where the gold is not. L3 is the knob.
- [Both replay goldens change — store plus two ledger fields] → one deliberate re-mint commit
  after the sim work, as the ledger did; the milestone assertions (balances, kills, phases)
  must hold unchanged since no scripted run places a battery.
- [Hotkey shift: Remove and Move move again] → the same shift the panel made; the keyhint line
  and the palette labels come from one table.
- [A third ground kind tempts a third copy of panel logic in the UI (ghost tint, badges,
  remove rules)] → the UI already branches on "ground tool" for the panel; the battery joins
  that branch, not a new one — the task list names each site.

## Open Questions

- Whether the meter's stored line belongs inside the existing meter block or as a second
  compact row on mobile — decide against the mockups during UI implementation; either is one
  element.
- The placeholder mesh's shape (cabinet vs. a tank) — visual, decide in the render task.
- Exact numbers — balance authoring against the harness, guided by D9 and the proposal's
  intent.
