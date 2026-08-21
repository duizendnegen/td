# Tasks: add-battery

> Groups 1–2 are data and the fourth kind on the ground path; 3–4 are the storage slot, the
> ledger rows and their tests; 5–6 are render/UI and docs. Both replay goldens regenerate once,
> in their own commit (4.6), after the sim work is complete. Numbers are placeholders shaped by
> design D9; tuning is balance authoring, not this change. Playtest in the browser with the
> Playwright plugin as the UI lands (config `apply` guidance).

## 1. Data & Schema

- [x] 1.1 `src/data/schema.ts`: balance `power.battery { cost, capacity }` — capacity a positive
      number in kWh; convert once at load into `GameData.batteryCostMg` and
      `batteryCapacityMpTick = round(capacity × POWER × TICK_HZ)` (design D7), beside
      `panelCostMg` / `panelOutputMp`; header comment lists the battery block
- [x] 1.2 `src/data/balance.json`: `power.battery` placeholder (`cost: 60, capacity: 12`) and a
      sentence in the `power.$note` on the sizing rule (one panel never fills it, two do)
- [x] 1.3 `tests/level.test.ts`: missing battery block / zero or negative capacity rejected
      naming the field; a float capacity converts to an integer; 10 kWh converts to
      `10 × POWER × TICK_HZ`

## 2. Sim — Battery Kind & Store State

- [x] 2.1 `src/sim/types.ts`: `StructureKind` gains `'battery'` (`STRUCTURE_KIND_ID.battery =
      3`); `SimState.storedMpTick` (initial 0) with a doc comment naming the unit;
      `WaveLedger.chargedMp` (usage) and `batteryMp` (source) with the identity in the interface
      comment updated; `openLedger` zeroes both. `src/sim/hash.ts`: mix `storedMpTick` after
      `gridTier`; `mixLedger` walks seventeen fields — same commit (standing rule)
- [x] 2.2 `src/sim/placement.ts`: `isGround(kind)` (wall | panel | battery) and the
      not-a-foundation predicate (panel | battery) replace the literal checks in `groundAt` and
      `validateMove`'s occupancy rule; `removeStructure` clamps `storedMpTick` to the remaining
      capacity after a battery leaves (design D5). `src/sim/sim.ts`: `laysGround` and
      `applyPlace` cover the battery at `batteryCostMg`; `pushStructure` comment lists it
- [x] 2.3 `src/sim/power.ts`: `storageCapacityOf(structures, data)` beside `solarOf`;
      `solarOf` unchanged (counts panels only)
- [x] 2.4 `tests/placement.test.ts`: battery seals → rejected; on a socket → not-buildable; on a
      wall and a wall on it → occupied; tower on it → `needs-wall`; provisional refund in full,
      committed at the fraction, refused during a wave; removing a battery clamps the store
      (16 → 10 with two 10 kWh batteries; 8 stays 8). `tests/movetool.test.ts`: a battery moves
      like a wall and the store is unchanged; nothing lands on a battery.
      `tests/hash.test.ts`: the store changes the hash; battery kind hashes distinctly

## 3. Sim — The Storage Slot

- [x] 3.1 `src/sim/power.ts`: `resolvePower` takes `storedMpTick` and `capacityMpTick` and
      returns `batterySupplyMp` and `chargedMp` alongside the existing fields, per design D3
      (`charged = min(surplus, room)`, `battery = min(deficit, stored)`, grid bounds on
      `deficit − battery` unchanged, zero-tariff reading unchanged); rewrite the merit-order doc
      comment — the slot is filled, no rate, no losses, no grid charging, levers in design.md
- [x] 3.2 `src/sim/sim.ts` step 7: pass the store and its capacity; apply
      `s.storedMpTick += chargedMp − batterySupplyMp` on every wave tick including settlement
      (design D4); `PowerReadout` / `IDLE_POWER` gain `batterySupplyMp`, `chargedMp`,
      `storedMpTick`, `storageCapacityMpTick` (the last two meaningful in any phase for the
      meter); ledger books `chargedMp`, `batteryMp`, `solarWastedMp = surplus − charged`,
      `unmetMp = draw − solarUsed − battery − grid`; update the identity comment and the
      settlement-tick note to cover the store
- [x] 3.3 ARCHITECTURE.md: §5 units — energy as mp·tick and the kWh convention for the store; §7
      step 7 "…power resolution (solar → store → grid), the store's delta applied here…";
      decision log D19 (pooled hashed store, capacity derived, eager clamp, settlement tick
      moves the store); D15's row notes the slot is now filled

## 4. Sim Tests

- [x] 4.1 `tests/power.test.ts` (`resolvePower`): surplus charges up to room, rest wasted; full
      store → all surplus wasted; no batteries → identical results to today for every existing
      case; deficit covered by the store before the grid, nothing billed; emptying store hands
      the rest to the grid under both bounds; broke tick with a charged store → full coverage,
      no bill; broke tick with an empty store and no solar → coverage 0; a tick never both
      charges and discharges
- [x] 4.2 Sim-level in `tests/power.test.ts` or `tests/tower.test.ts`: a charged store holds
      coverage at full through an over-capacity peak and drains by the deficit; the store
      persists across settlement and the build phase (no movement outside a wave); a battery
      placed mid-wave enlarges capacity from that tick; the settlement tick moves the store
- [x] 4.3 `tests/ledger.test.ts`: the identity test gains the two terms and a scripted run with
      a panel and a battery (charging and discharging ticks, a broke tick); the worked
      scenarios from the wave-ledger delta (30/40 with room 6; 50/20 with store 20 and grid
      10); a clamp on removal moves no row; build phase moves no row
- [x] 4.4 `tests/leak.test.ts` power-aware block: a run with one panel and one battery beside the
      existing panel-less runs — per-wave `chargedMp`, `batteryMp`, `solarWastedMp`, `billMg`,
      and the store at settlement join the `POWER_LOG` table; assert directionally that with
      the battery the bill and wasted both fall versus the same layout without it, the store
      never exceeds capacity, and it is non-zero at some settlement
- [x] 4.5 `tests/replay.test.ts` milestone assertions still hold before the re-mint (no scripted
      run places a battery, so balances/kills/phases are unchanged — only the hash moves)
- [x] 4.6 Re-mint both replay goldens deliberately, in their own commit (ARCHITECTURE.md §12),
      after 2.x–3.x land

## 5. Render & UI

- [x] 5.1 `src/render/towers.ts`: placeholder battery mesh from primitives beside the panel's
      (shared geometry/materials, translucent ghost variant) with a front gauge whose fill
      scales with `storedMpTick ÷ storageCapacityMpTick` from the snapshot each frame; not
      dimmed by brownout; provisional marking as any structure; the kind-to-mesh switch covers
      `'battery'`
- [x] 5.2 `src/ui/palette.ts`: `Tool` gains `'battery'`; card after Solar — label, icon, cost,
      tag `formatKwh(capacity)`; hotkey 7, Remove 8, Move 9; `toolStructure` / `costOf` learn
      it; the ground-tool branch (ghost tint, price badge, remove rules) covers it — no new
      branch. `src/ui/input.ts` / `inputcore.ts` / `keyhint.ts`: hotkey table and hint line
      follow the palette; touch driver needs no change beyond the tool
- [x] 5.3 `src/ui/powermeter.ts` / `powerhud.ts`: stored-energy line `a / b kWh` whenever a
      battery stands, in both phases; the live split includes the battery's share during a
      wave; no line when no battery stands; mobile compaction per the existing form-factor
      rule. `hud.css` as needed
- [x] 5.4 `src/ui/ledger.ts` / `ledgerhud.ts`: `energyBalance` adds `Charging` to the usage raw
      array (after Standby, before Wasted) and `Battery` to the sources (after Solar, before
      Grid); both columns still reconcile to `max`-side totals; the header comment's column
      list updated
- [x] 5.5 `src/render/debug.ts`: F4 supply line gains `battery` (discharge) and `charge`; a
      `stored a / b kWh` line whenever a battery stands, in any phase
- [x] 5.6 UI tests: `tests/panelui.test.ts` (battery card, tag, placement via the command path,
      removal under the wall's rules, hotkeys 7/8/9); `tests/powermeter.test.ts` (stored line
      present/absent, both phases, split includes battery); `tests/ledger-ui.test.ts` (the two
      rows, order, neither billed, columns total the same — the 43.0 scenario with 2.0
      charging and 1.5 battery)
- [x] 5.7 Browser check with the Playwright plugin: place panel + battery, run a wave, watch
      the gauge and the meter line rise and fall; sell a battery between waves and see the
      clamp; the energy balance shows the two rows

## 6. Docs

- [x] 6.1 README.md: Power section — a battery bullet (pooled store, charges from surplus,
      discharges before the grid, persists, clamps on sale, no rate/losses/grid charging), the
      merit-order bullet's parenthetical replaced, the meter bullet mentions the stored line,
      the Data bullet lists the battery block; Build Rules — "Solar panels and batteries build
      like walls…"; the energy-balance description lists the two rows
- [x] 6.2 ROADMAP.md: the battery leaves "Next up"; record the levers from design.md (rate limit
      as "shaving peaks is a capacity increase", grid charging, per-level tariff, round-trip
      loss) where the energy open questions live
- [x] 6.3 ARCHITECTURE.md test table: new/extended test files; §15 open question — does
      "infinite while charged" read wrong in play (the L1 trigger)
