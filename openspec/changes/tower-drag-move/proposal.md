# Tower Drag-Move

## Why

Between waves, re-optimizing a defense currently means dismantling towers (losing 50% of the investment once committed) and rebuilding them elsewhere — so players rarely reroute, and early layout mistakes calcify. The build phase is explicitly a planning board (provisional construction, instant between-wave selling, path preview all exist to support iteration); moving towers is the missing piece that makes layouts actually revisable.

## What Changes

- New `move` sim command: relocate an existing structure — tower or wall — to any tile where placing that kind would be legal, during the build phase only. Validation reuses the placement rules (terrain accepts the kind — sockets take towers only, unoccupied, no enemy in footprint, never seals a spawn, never strands an enemy) but evaluates the destination **with the origin tile freed**, so a tower can slide along its own wall line, a wall segment can shift a maze line, or either can swap into the space it opens up.
- Moving is free and preserves the structure's identity: `paidMg`, level, and provisional/committed status carry over unchanged. Rerouting is the point of the feature; the dismantle penalty continues to apply only to taking money back out.
- Rejected moves are atomic — sim state and hash unchanged, the standard `placementRejected` feedback fires.
- The palette gains a **move tool**, a mode alongside the remove tool. Arming it is what makes structures liftable — with no tool armed, click/tap still selects for the inspector, and camera gestures are untouched, so the interaction adds zero conflicts with existing input.
- Desktop, move tool armed: pressing on a structure lifts it into a move ghost of its kind with valid/invalid tinting; drag and release on a legal tile commits, or click to lift and click again to drop. Esc, tool switch, or an illegal drop (standard red flash) leaves the structure where it was. The structure's own tile reads as a legal drop, and dropping there simply puts it back down — a cancel, with no command and no flash.
- Touch, move tool armed: tapping a structure lifts it into the same pending-ghost-plus-✓/✕ confirm flow as placement; one-finger drag adjusts the pending destination, two-finger gestures keep driving the camera, exactly as the existing gesture routing prescribes for an armed build tool. Confirming with the ghost still on the structure's own tile puts it down with no command.
- The move tool reads unavailable outside the build phase, in the same visual language as other blocked palette items.
- Path preview: while a structure is being dragged, the lane ribbon shows the projected reroute for "origin freed, destination blocked", including orphan shading — same treatment a candidate placement gets today.
- Renderer: structure meshes reposition when a structure's tile changes (today a mesh is positioned only at build time).
- Walls move too: the same lift/carry/drop applies to walls, so a maze line can be nudged without selling and rebuilding it. A wall's destination follows wall placement rules (dirt only — never a socket), and a wall ghost carries no range ring.
- The tower inspector gains a **Move** action beside upgrade and dismantle: it arms the move tool and lifts the inspected tower in one step — leaving things exactly where selecting the tool and pressing on the tower would — so a player already looking at a tower needn't visit the palette. It follows the tool's build-phase gate and, like the inspector's remove action, names the wave when locked. On touch, the sheet's action stages the same pending move ghost at the tower's tile.

## Capabilities

### New Capabilities

None — tower relocation extends existing capabilities.

### Modified Capabilities

- `structure-placement`: new requirement — a validated, atomic, build-phase-only move operation for towers and walls that can never seal a spawn or strand an enemy, evaluates the destination with the origin freed under the moving kind's terrain rules, is free of charge, and preserves the structure's investment and provisional status.
- `build-ui`: new requirements — a move tool in the palette (armed mode like remove, unavailable outside the build phase) and the lift/carry/drop interaction it enables for towers and walls, with ghost tinting from the authoritative move validation, the origin tile reading as a legal put-down, and uniform reject feedback for rejected moves; and an inspector move action that arms the tool and lifts the inspected tower in one step, gated and reason-labelled like the inspector's remove action.
- `touch-input`: new requirement — with the move tool armed, tapping a structure stages a pending move ghost with ✓/✕ confirmation (confirming on the origin puts it down), consistent with the placement gesture flow and the existing gesture routing for armed tools; the inspector sheet's move action stages that same pending move.
- `path-preview`: modified requirement — the lane ribbon also appears while the move tool is armed, and a lifted structure's candidate tile projects routes with the origin freed and the destination blocked.

## Impact

- **Sim**: `src/sim/commands.ts` (new `move` kind + drain order), `src/sim/sim.ts` (`applyMove`, preview variants for move), `src/sim/placement.ts` (validation with a freed origin tile). Structure `tx`/`ty` are already hashed; no new hashed fields, so golden replay hashes are unaffected.
- **UI**: `src/ui/palette.ts` (new `move` tool + phase-gated state), `src/ui/inputcore.ts` (lift state, move ghost, ribbon wiring, the inspector's arm-then-lift), `src/ui/input.ts` (press/drag/release lifecycle while the move tool is armed), `src/ui/touch.ts` (pending move flow), `src/ui/inspector.ts` (Move action + `onMove` hook), hint text.
- **Render**: `src/render/towers.ts` (reposition same-id meshes on tile change), `src/render/fx.ts` ghost reuse.
- **Tests**: new move cases in `tests/placement.test.ts` (legality with freed origin, atomic rejection, identity preservation, phase gating, wall moves and the wall-on-socket rejection); drag lifecycle via the existing stubbed-canvas pointer-event rig, including the own-tile put-down, a wall lift, and the inspector's arm-then-lift route with its gate.
