# build-over-walls — tasks

## 1. Sim: tile lookups and the foundation rule

- [x] 1.1 In src/sim/placement.ts replace `structureAt` with `wallAt`, `towerAt`, and `topAt`
  (`towerAt ?? wallAt`); delete `structureAt` and fix every call site in src/sim/sim.ts and
  src/ui/inputcore.ts by intent (upgrade/inspector/range → `towerAt`; remove/lift → `topAt`)
- [x] 1.2 Add `'needs-wall'` to `PlacementVerdict`; add the tower foundation branch to
  `validatePlacement` (grass/rock → not-buildable; socket → occupied/ok by `towerAt`; dirt →
  needs-wall without a wall, occupied with a tower, else ok) returning before any mask work; wall
  occupancy reads `wallAt`
- [x] 1.3 `Sim.applyPlace`: a tower pushes the structure and charges its cost with no mask edit,
  no field swap, no `maskChanged`; walls unchanged. `previewRoutes` computes `rebuilt` from
  `kind === 'wall'` and the verdict; drop the socket special case
- [x] 1.4 Add tests/helpers.ts `mount(tx, ty, archetype)` → `[place('wall'), place('tower')]`
- [x] 1.5 Tests in tests/placement.test.ts: mounting on a bare wall charges the tower only and
  leaves mask, fields and hash-minus-treasury unchanged (no rebuild); needs-wall on bare dirt is
  atomic; occupied on a mounted wall and on a full socket; a second wall on a wall is occupied; a
  tower on a wall where a fresh wall would seal is confirmed; wall placement rejections unchanged;
  wall and tower keep separate `paidMg`/`provisional` (mount on a committed wall → tower
  provisional, wall committed); mid-wave mount on a committed wall is confirmed

## 2. Sim: removal peel

- [x] 2.1 `Sim.applyRemove` and `InputCore.commitRemove` resolve the target with `topAt`;
  `removeStructure` unblocks only for `kind === 'wall'` on non-socket terrain and never sets
  `removalUnblocked` for a tower
- [x] 2.2 Tests: remove on a stacked tile takes the tower (refund credited, wall stands, tile
  blocked, fields unchanged, no rebuild); a second remove takes the wall and unblocks; mid-wave a
  provisional tower comes off a committed wall with mask unchanged; mid-wave a committed tower on
  a wall is rejected and the wall untouched; socket removal unchanged; `liquidationTotalMg` sums
  both layers

## 3. Sim: stack moves

- [x] 3.1 Rework `validateMove` to take the origin stack `{ wall, tower }` and classify the
  destination: bare dirt → relocate (existing origin-freed/destination-blocked pipeline with the
  wall as mover, `needs-wall` when the stack has no wall); bare wall / empty socket → transfer
  (needs a tower in the stack, else occupied / not-buildable; no mask work); foundation with a
  tower → occupied; own tile → occupied
- [x] 3.2 `Sim.applyMove` collects the stack via `wallAt`/`towerAt`; relocate moves both
  structures' `tx/ty` and swaps fields; transfer moves the tower's only with no mask edit.
  `previewMove`/`previewMoveRoutes` follow; `rebuilt` is true only for the relocate branch
- [x] 3.3 Tests: relocate of wall+tower to bare dirt (both moved, origin walkable, destination
  blocked, fields rebuilt, treasury and both refund bases unchanged, both provisional flags
  preserved); transfer onto a neighbouring bare wall (tower moved, origin wall stays, fields
  unchanged, no rebuild); socket tower → bare wall, → empty socket, → bare dirt (needs-wall);
  bare wall → dirt as before, → socket not-buildable, → bare wall occupied; relocate seal /
  strand / enemy-in-footprint / freed-origin-carries-reroute; transfer onto a sealing position
  confirmed; occupied on a mounted destination; same-tile rejected; atomic rejection by hash;
  no moves outside the build phase

## 4. Sim: golden and fixtures

- [x] 4.1 Re-script tests/replay.test.ts so every tower has a wall (via `mount`) and re-mint
  `GOLDEN_SCRIPT_HASH` once; assert `GOLDEN_IDLE_HASH` is unchanged
- [x] 4.2 Update tests/tower.test.ts, upgrade.test.ts, economy.test.ts, tickseam.test.ts,
  time.test.ts, theft.test.ts and any other suite that places a tower on dirt to mount on a wall
- [x] 4.3 tests/leak.test.ts / leakData.ts: build each tower layout item as wall + tower; keep
  spend parity from actual spend; run the harness and record whether any directional assertion
  moved (report it — do not silently retune)
- [x] 4.4 tests/capture.test.ts and the wave-preview capture script: walls under the scripted
  towers; confirm the capture still renders

## 5. UI: ghost, palette, selection

- [x] 5.1 `GhostPreview.show` gains an on-foundation option that raises the tower ghost by the
  wall model's height, and a stack option that draws the wall mesh beneath the raised tower
- [x] 5.2 `InputCore.updateBuildGhost` passes on-foundation for a tower tool over a wall or
  socket; `needs-wall` tints invalid and projects no ribbon routing (verify
  `previewRoutes` returns null lanes for it)
- [x] 5.3 `InputCore.selectAt` uses `towerAt`; the inspector's remove issues the same command
  and the peel takes the tower; verify the inspector closes and the wall stays
- [x] 5.4 Palette: tower items carry an "on wall" caption; desktop hint line
  (src/ui/input.ts `buildHintLine`) says towers go on walls
- [x] 5.5 Tests via the existing stubbed-canvas rig: tower tool click on bare dirt flashes and
  issues nothing; on a bare wall issues one place; selection on a stacked tile inspects the tower

## 6. UI: lift the tile

- [x] 6.1 `InputCore.liftAt` lifts via `topAt` (id of the top structure) and passes the origin
  tile's structure ids to `StructureRenderer.setLifted(ids)`; `updateMoveGhost` shows the top's
  kind, raised on a foundation destination, wall + raised tower on a bare-dirt destination
- [x] 6.2 Verify the lift lifecycle ends on both branches (transfer moves the top's tile;
  relocate moves both), the origin put-down and Esc/tool-switch cancel dim every structure back,
  and the inspector's Move action lifts the tower's tile
- [x] 6.3 Ribbon: bare-dirt candidate projects routing with the origin freed; foundation
  candidate and own tile show current lanes only; no stale routing across the switch
- [x] 6.4 Tests: drag a stack to bare dirt issues one move and both structures land; drop on a
  bare wall issues one move and only the tower lands; bare wall lift as before; carrying is
  hash-neutral; touch pending move for a stacked tile confirms through the same path

## 7. Render

- [x] 7.1 `StructureRenderer.build`: a tower on dirt starts at the wall's height and omits its
  base segment; on a socket keeps base + middles + head; renderer receives an `isSocket(tx, ty)`
  predicate at construction
- [x] 7.2 Provisional marks: suppress a wall's mark while a provisional tower on the same tile
  shows one; `setLifted` dims a list of ids
- [x] 7.3 Visual check in the running game (Playwright): wall-mounted vs socket tower same
  silhouette per level, no doubled base, removing a tower leaves the wall, lifted stack dims
  together, raised ghost over a wall, composite ghost over dirt during a stack move

## 8. Docs and wrap-up

- [x] 8.1 README: towers stand on walls (design bullet, socket wording as "built-in
  foundation", controls section); ARCHITECTURE.md D6 note and §7 placement summary
- [x] 8.2 `npm run typecheck`, `npm test`, `npm run build` green; `openspec validate
  build-over-walls` clean
