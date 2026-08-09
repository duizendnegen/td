# Tower Drag-Move

## Why

Between waves, re-optimizing a defense currently means dismantling towers (losing 50% of the investment once committed) and rebuilding them elsewhere — so players rarely reroute, and early layout mistakes calcify. The build phase is explicitly a planning board (provisional construction, instant between-wave selling, path preview all exist to support iteration); moving towers is the missing piece that makes layouts actually revisable.

## What Changes

- New `move` sim command: relocate an existing tower to any tile where placement would be legal, during the build phase only. Validation reuses the placement rules (buildable terrain, unoccupied, no enemy in footprint, never seals a spawn, never strands an enemy) but evaluates the destination **with the origin tile freed**, so a tower can slide along its own wall line or swap into the space it opens up.
- Moving is free and preserves the tower's identity: `paidMg`, level, and provisional/committed status carry over unchanged. Rerouting is the point of the feature; the dismantle penalty continues to apply only to taking money back out.
- Rejected moves are atomic — sim state and hash unchanged, the standard `placementRejected` feedback fires.
- The palette gains a **move tool**, a mode alongside the remove tool. Arming it is what makes towers liftable — with no tool armed, click/tap still selects for the inspector, and camera gestures are untouched, so the interaction adds zero conflicts with existing input.
- Desktop, move tool armed: pressing on a tower lifts it into a move ghost with valid/invalid tinting; drag and release on a legal tile commits, or click to lift and click again to drop. Esc, tool switch, or an illegal drop (standard red flash) leaves the tower where it was.
- Touch, move tool armed: tapping a tower lifts it into the same pending-ghost-plus-✓/✕ confirm flow as placement; one-finger drag adjusts the pending destination, two-finger gestures keep driving the camera, exactly as the existing gesture routing prescribes for an armed build tool.
- The move tool reads unavailable outside the build phase, in the same visual language as other blocked palette items.
- Path preview: while a tower is being dragged, the lane ribbon shows the projected reroute for "origin freed, destination blocked", including orphan shading — same treatment a candidate placement gets today.
- Renderer: structure meshes reposition when a structure's tile changes (today a mesh is positioned only at build time).
- Walls are out of scope: drag-move applies to towers only, matching the existing selection model (walls are cheap to sell and rebuild; extending drag to walls can be a follow-up).

## Capabilities

### New Capabilities

None — tower relocation extends existing capabilities.

### Modified Capabilities

- `structure-placement`: new requirement — a validated, atomic, build-phase-only move operation that can never seal a spawn or strand an enemy, evaluates the destination with the origin freed, is free of charge, and preserves the structure's investment and provisional status.
- `build-ui`: new requirements — a move tool in the palette (armed mode like remove, unavailable outside the build phase) and the lift/carry/drop interaction it enables, with ghost tinting from the authoritative move validation and uniform reject feedback for rejected moves.
- `touch-input`: new requirement — with the move tool armed, tapping a tower stages a pending move ghost with ✓/✕ confirmation, consistent with the placement gesture flow and the existing gesture routing for armed tools.
- `path-preview`: modified requirement — the lane ribbon also appears while the move tool is armed, and a lifted tower's candidate tile projects routes with the origin freed and the destination blocked.

## Impact

- **Sim**: `src/sim/commands.ts` (new `move` kind + drain order), `src/sim/sim.ts` (`applyMove`, preview variants for move), `src/sim/placement.ts` (validation with a freed origin tile). Structure `tx`/`ty` are already hashed; no new hashed fields, so golden replay hashes are unaffected.
- **UI**: `src/ui/palette.ts` (new `move` tool + phase-gated state), `src/ui/inputcore.ts` (lift state, move ghost, ribbon wiring), `src/ui/input.ts` (press/drag/release lifecycle while the move tool is armed), `src/ui/touch.ts` (pending move flow), hint text.
- **Render**: `src/render/towers.ts` (reposition same-id meshes on tile change), `src/render/fx.ts` ghost reuse.
- **Tests**: new move cases in `tests/placement.test.ts` (legality with freed origin, atomic rejection, identity preservation, phase gating); drag lifecycle via the existing stubbed-canvas pointer-event rig.
