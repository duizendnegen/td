# tower-drag-move — tasks

## 1. Sim: move command and validation

- [ ] 1.1 Add the `move` command kind (`{ kind: 'move', tx, ty, toTx, toTy }`) to
  src/sim/commands.ts and insert it between `place` and `upgrade` in `KIND_ORDER`,
  renumbering the tail
- [ ] 1.2 Implement `validateMove` in src/sim/placement.ts: same-tile rejection, destination
  bounds/terrain/occupancy/enemy checks, dual mask edit (free origin + block destination),
  one scratch-field rebuild, spawn and enemy checks, mask restore; socket-destination
  fast-path that still accounts for a freed mask-blocked origin
- [ ] 1.3 Add `canMove(phase, structure)` and `moveOpenIn(phase)` guards in
  src/sim/placement.ts (build phase only, towers only)
- [ ] 1.4 Implement `Sim.applyMove` in src/sim/sim.ts: guard, validate, on accept apply both
  mask edits + `swapScratchFields()` + mutate `tx`/`ty` (treasury untouched, `paidMg`/
  `level`/`provisional` preserved); on reject emit `placementRejected` for the destination
- [ ] 1.5 Sim tests in tests/placement.test.ts: confirmed move updates mask and both fields in
  its tick; free + refund basis preserved; provisional survives a move; wall move rejected;
  non-build phases rejected (wave incl. provisional, settled-locked); freed origin makes a
  slide/reroute legal; seal, strand, enemy-in-footprint, occupied, same-tile rejections;
  socket matrix (dirt→socket, socket→dirt, socket→socket); atomic rejection by hash
- [ ] 1.6 Confirm tests/replay.test.ts golden hashes pass unchanged (KIND_ORDER renumbering
  and the new kind must not disturb existing replays)

## 2. Sim: speculative previews

- [ ] 2.1 Add `Sim.previewMove(from, to)` (verdict only) and an origin-freed variant of
  `previewRoutes` returning the existing `PlacementRoutes` shape
- [ ] 2.2 Tests: preview sweep over move candidates leaves the state hash unchanged; held
  results don't alias live field buffers; projected lanes include the freed origin tile;
  routing-independent rejections yield null lanes; orphan set populated for sealing moves

## 3. UI: move tool and lift state

- [ ] 3.1 Add `'move'` to `Tool` in src/ui/palette.ts with palette item, hotkey, and a
  phase-gated unavailable state wired through `refresh` (mirroring `removalAllowed`)
- [ ] 3.2 Add lift state to src/ui/inputcore.ts: `lifted` structure, `commitMove(tile)`
  (re-validate via `previewMove`, issue `move`, reject → `flashReject`, keep carrying),
  cancellation on tool switch/Esc/phase change, ghost + range ring at the candidate tile,
  ribbon driven by the origin-freed routes with the lifted id in the re-evaluation key
- [ ] 3.3 Desktop driver (src/ui/input.ts): with move tool armed, press on a tower lifts;
  release past slop drops at the release tile; sub-slop release keeps carrying and a second
  click drops; presses on walls/empty tiles with nothing lifted do nothing; update the hint
  line text
- [ ] 3.4 Touch driver (src/ui/touch.ts): with move tool armed, tap on a tower stages the
  pending move ghost with ✓/✕; drag/tap adjusts the destination; confirm issues one `move`;
  cancel/deselect dismisses; two-finger camera gestures unaffected
- [ ] 3.5 Driver tests with the stubbed-canvas rig (per tests/mousecam.test.ts): drag-drop
  emits one move command; click-click emits one; sub-slop vs past-slop distinction; Esc
  cancels with no command; failed drop keeps the lift

## 4. Render: reposition and lift treatment

- [ ] 4.1 Teach `StructureRenderer.sync` (src/render/towers.ts) to reposition a surviving
  mesh (and its provisional `buildMark`) when the structure's tile changes
- [ ] 4.2 Dim the lifted tower's origin mesh while carrying and restore it on drop/cancel

## 5. Verify

- [ ] 5.1 `npm run typecheck` and `npm test` pass in the workspace
- [ ] 5.2 Exploratory pass with the Playwright plugin: lift/carry/drop with reroute preview,
  invalid-drop flash, click-click carry, Esc cancel, wave-time tool lockout, touch pending
  flow, and a moved tower rendering at its new tile with its provisional mark
- [ ] 5.3 `openspec validate tower-drag-move --strict` passes
