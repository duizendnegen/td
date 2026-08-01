## Why

The camera currently sits at the true-isometric pitch (arctan(1/√2) ≈ 35.26°), which projects ground
tiles as ~1.73:1 diamonds. The classic "RollerCoaster Tycoon" look — shared by Transport Tycoon and
most tycoon-era games — is the 2:1 dimetric projection, which reads flatter and wider and gives
tall objects stronger silhouettes. We want the board to read like those games.

## What Changes

- Camera pitch changes from arctan(1/√2) ≈ 35.26° to exactly 30° (yaw stays 45°). At 30° pitch a
  ground tile projects as an exact 2:1 diamond (diamond width:height = 1/sin(pitch)), matching the
  RCT-style 64×32 tile geometry.
- The `isometric-camera` spec is tightened: instead of "~30–35°, true isometric preferred", the
  pitch is pinned to 30° / 2:1 dimetric.
- Code comments in `src/render/cameras.ts` and the camera section of `ARCHITECTURE.md` are updated
  so docs match the projection actually used.
- No behavioral change beyond the projection: framing, resize re-fit, and all render code are
  untouched (the frustum fit derives from the projected bounding box and adapts automatically).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `isometric-camera`: the "Isometric projection" requirement changes from a pitch of ~30–35° with
  true isometric (≈35.26°) as the reference angle, to a fixed 30° pitch producing an exact 2:1
  dimetric projection. The height-legibility and resize-framing requirements are unaffected (the
  lower pitch only strengthens the height read; the accepted occlusion trade-off grows slightly and
  remains accepted).

## Impact

- `src/render/cameras.ts` — the `PITCH` constant and the file's header comment.
- `openspec/specs/isometric-camera/spec.md` — projection requirement wording (via this change's
  delta spec).
- `ARCHITECTURE.md` — the Camera section's description of the pitch.
- No dependency, API, or test impact: no tests reference the pitch, and nothing else in the repo
  reads the camera angles.
