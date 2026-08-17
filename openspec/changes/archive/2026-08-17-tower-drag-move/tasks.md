# tower-drag-move — tasks

## 1. Sim: move command and validation

- [x] 1.1 Add the `move` command kind (`{ kind: 'move', tx, ty, toTx, toTy }`) to
  src/sim/commands.ts and insert it between `place` and `upgrade` in `KIND_ORDER`,
  renumbering the tail
- [x] 1.2 Implement `validateMove` in src/sim/placement.ts: same-tile rejection, destination
  bounds/terrain/occupancy/enemy checks, dual mask edit (free origin + block destination),
  one scratch-field rebuild, spawn and enemy checks, mask restore; socket-destination
  fast-path that still accounts for a freed mask-blocked origin
- [x] 1.3 Add `canMove(phase, structure)` and `moveOpenIn(phase)` guards in
  src/sim/placement.ts (build phase only, towers only)
- [x] 1.4 Implement `Sim.applyMove` in src/sim/sim.ts: guard, validate, on accept apply both
  mask edits + `swapScratchFields()` + mutate `tx`/`ty` (treasury untouched, `paidMg`/
  `level`/`provisional` preserved); on reject emit `placementRejected` for the destination
- [x] 1.5 Sim tests in tests/placement.test.ts: confirmed move updates mask and both fields in
  its tick; free + refund basis preserved; provisional survives a move; wall move rejected;
  non-build phases rejected (wave incl. provisional, settled-locked); freed origin makes a
  slide/reroute legal; seal, strand, enemy-in-footprint, occupied, same-tile rejections;
  socket matrix (dirt→socket, socket→dirt, socket→socket); atomic rejection by hash
- [x] 1.6 Confirm tests/replay.test.ts golden hashes pass unchanged (KIND_ORDER renumbering
  and the new kind must not disturb existing replays)

## 2. Sim: speculative previews

- [x] 2.1 Add `Sim.previewMove(from, to)` (verdict only) and an origin-freed variant of
  `previewRoutes` returning the existing `PlacementRoutes` shape
- [x] 2.2 Tests: preview sweep over move candidates leaves the state hash unchanged; held
  results don't alias live field buffers; projected lanes include the freed origin tile;
  routing-independent rejections yield null lanes; orphan set populated for sealing moves

## 3. UI: move tool and lift state

- [x] 3.1 Add `'move'` to `Tool` in src/ui/palette.ts with palette item, hotkey, and a
  phase-gated unavailable state wired through `refresh` (mirroring `removalAllowed`)
- [x] 3.2 Add lift state to src/ui/inputcore.ts: `lifted` structure, `commitMove(tile)`
  (re-validate via `previewMove`, issue `move`, reject → `flashReject`, keep carrying),
  cancellation on tool switch/Esc/phase change, ghost + range ring at the candidate tile,
  ribbon driven by the origin-freed routes with the lifted id in the re-evaluation key
- [x] 3.3 Desktop driver (src/ui/input.ts): with move tool armed, press on a tower lifts;
  release past slop drops at the release tile; sub-slop release keeps carrying and a second
  click drops; presses on walls/empty tiles with nothing lifted do nothing; update the hint
  line text
- [x] 3.4 Touch driver (src/ui/touch.ts): with move tool armed, tap on a tower stages the
  pending move ghost with ✓/✕; drag/tap adjusts the destination; confirm issues one `move`;
  cancel/deselect dismisses; two-finger camera gestures unaffected
- [x] 3.5 Driver tests with the stubbed-canvas rig (per tests/mousecam.test.ts): drag-drop
  emits one move command; click-click emits one; sub-slop vs past-slop distinction; Esc
  cancels with no command; failed drop keeps the lift

## 4. Render: reposition and lift treatment

- [x] 4.1 Teach `StructureRenderer.sync` (src/render/towers.ts) to reposition a surviving
  mesh (and its provisional `buildMark`) when the structure's tile changes
- [x] 4.2 Dim the lifted tower's origin mesh while carrying and restore it on drop/cancel

## 5. Verify

- [x] 5.1 `npm run typecheck` and `npm test` pass in the workspace
- [x] 5.2 Exploratory pass with the Playwright plugin: lift/carry/drop with reroute preview,
  invalid-drop flash, click-click carry, Esc cancel, wave-time tool lockout, touch pending
  flow, and a moved tower rendering at its new tile with its provisional mark
- [x] 5.3 `openspec validate tower-drag-move --strict` passes

## 6. Iteration: walls move, own-tile drop puts the structure down

- [x] 6.1 Sim: collapse the gate to `moveOpenIn(phase)` alone (drop `canMove`; every structure
  kind moves in the build phase) and make `validateMove` apply the mover's terrain rule — a
  wall bound for a socket is `not-buildable`; update applyMove / previewMove /
  previewMoveRoutes call sites
- [x] 6.2 Sim tests: replace "walls cannot move" with a wall move (mask + fields + free +
  refund basis) and a wall→socket rejection; keep the same-tile rejection
- [x] 6.3 InputCore: `liftAt` lifts any structure; the ghost takes the mover's kind with a
  range ring for towers only; `updateMoveGhost` reports the origin tile as valid;
  `commitMove(origin)` puts the structure down — `cancelLift`, no command, no flash — and
  returns true so touch dismisses the pending ghost
- [x] 6.4 Driver tests: the drag-back-to-origin case becomes a put-down (no flash, no command,
  lift cleared); second click on the origin puts down; a wall lifts and drops with one move
  command; the "presses on walls do nothing" case narrows to empty tiles
- [x] 6.5 Docs and comments: input.ts / touch.ts / inputcore.ts / palette headers, hint line
  if it names towers
- [x] 6.6 `npm run typecheck`, `npm test`, `openspec validate tower-drag-move --strict`;
  Playwright pass: lift and drop a wall, drop a tower back on its own tile (green ghost, no
  flash, lift ends), touch ✓ on the origin dismisses

## 7. Iteration: the inspector's Move action

- [x] 7.1 InputCore: `liftInspected(s)` — arm the move tool through `palette.select('move')`,
  then `liftAt` on the tower's tile; a refused arming lifts nothing; wire `inspector.onMove`
  to it at construction; add the `onLift(origin)` driver hook, fired only from this route
- [x] 7.2 Inspector: Move action between upgrade and remove, `onMove` hook, gated per frame
  by `moveOpenIn(state.runPhase)` with a locked face naming the wave (design D9)
- [x] 7.3 Touch driver: `core.onLift` anchors the pending ghost at the origin so the ✓/✕ pair
  appears as after a tap; pointer driver needs nothing (no press standing = click-click carry)
- [x] 7.4 Driver tests: the inspector route arms, deselects the inspector, lifts, fires
  `onLift`, issues nothing, and the next click drops with one command; the second click on
  the origin puts down; a gated palette leaves everything untouched
- [x] 7.5 `npm run typecheck`, `npm test`, `openspec validate tower-drag-move --strict`;
  Playwright pass: desktop Move from the inspector then click-drop, wave-time locked face,
  mobile sheet Move staging the ✓/✕ pair at the tower

## 8. Iteration: the inspector's move is one-shot

- [x] 8.1 InputCore: `toolArmedForLift` set by `liftInspected`, cleared on any tool change;
  `endLift()` as the one exit for a lift that ran its course (sweep + `cancelLift`), which
  disarms the tool via `palette.select(null)` when the flag is set; a failed drop leaves both
  the lift and the tool (design D9)
- [x] 8.2 Driver tests: after the inspector lift, an applied move / origin put-down / cancel
  each leave no tool armed; a failed drop keeps carrying and keeps the tool; a palette-armed
  lift after an inspector move keeps the mode; palette-route tests pin that drops and
  put-downs keep the tool
- [x] 8.3 `npm run typecheck`, `npm test`, `openspec validate tower-drag-move --strict`;
  Playwright pass: desktop inspector Move → drop → no tool armed; put-down on origin → no
  tool; mobile sheet Move → ✓ → no tool, ✕ → no tool; palette Move keeps the mode

