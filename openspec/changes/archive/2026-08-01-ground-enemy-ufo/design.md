## Context

See proposal.md — Why. The relevant geometry: under the fixed orthographic camera at pitch
`atan(1/√2) ≈ 35.26°`, a world-Y elevation `h` projects to an up-screen shift of
`h·cos(pitch) ≈ 0.82·h`, toward the world diagonal away from the camera. The current
`HOVER_BASE = 0.35` therefore reads as ~0.29 tiles of displacement. Constraints that shape the
approach: debug overlays are flat decals at `GROUND_TOP_Y + 0.03`, so an enemy belly flush with
the ground would intersect them; the `enemy-ufo-*` GLBs have their origin at the bottom of the
hull (vertex min-Y = 0), so `y = GROUND_TOP_Y` is exact floor contact with no per-model offset.

## Goals / Non-Goals

**Goals:**
- Reduce the projected screen offset from ~29% of a tile to under ~5%.
- Keep the enemies visually alive without any vertical cosmetic motion.
- Give the round hull an explicit, grid-legible ground contact point.

**Non-Goals:**
- Real shadows (lighting-based); the contact decal is a flat quad, not a shadow system.
- Changes to other model types (towers, details) or to the camera.
- Any simulation-side change; this is render-layer only.

## Decisions

**Rest height 0.05 above `GROUND_TOP_Y`, not 0.** Flush contact would let the hull's lower rim
intersect the debug overlay plane at +0.03. A 0.05 clearance clears the decals and costs ~4% of
a tile in projected offset — imperceptible against the grid. Alternative considered: literal 0
with overlays raised instead; rejected because overlays are shared with selection/range decals
and their height is already tuned.

**Tilt wobble replaces the vertical bob.** Small oscillation of `rotation.x`/`rotation.z`
(desynced per enemy by the existing id-based phase) plus the existing yaw spin. Zero vertical
displacement by construction, so the offset cannot creep back. Alternatives considered:
one-sided bob `base = amplitude` (leaves a small oscillating offset and reads as bouncing);
`sin²` bob (smooth but reads as hopping); squash-stretch scale (fights the shared-material
flat-shaded look). A saucer tilting as it skims the floor keeps the "hover" fiction the
architecture wanted from the UFO models.

**Contact decal is a blob shadow, not the kit's selection quad.** A flat dark translucent
circle (shared `CircleGeometry` + `MeshBasicMaterial`, one instance per enemy) at the enemy's
interpolated x/z, just above the ground and below the debug-overlay plane. The `selection-a`
quad was tried first but reads as a selection indicator — a UI meaning the game will want for
actual selection later — while a soft dark blob reads as a shadow, which is the grounding cue
intended. The one-material invariant applies to the model kit; render-only FX (debug overlays,
this shadow) already carry their own materials, so a second material here breaks nothing. The
shadow material sets `depthWrite: false` to avoid transparency sorting artifacts against the
ground. Decal lifecycle mirrors the mesh map: created on first sight of an enemy id, removed
when the id disappears.

## Risks / Trade-offs

- [Grounded saucer reads as "landed" rather than hovering] → The tilt wobble plus yaw spin
  carries the motion; re-judge at the Phase-1 legibility gate alongside camera pitch. If it
  still reads dead, a subtle scale pulse can be added without reintroducing elevation.
- [Two scene objects per enemy instead of one] → At POC scale (dozens of enemies) this is
  negligible; InstancedMesh remains the documented escape hatch if swarms ever justify it.
- [Decal z-fighting with debug overlays at the same height] → The shadow sits at +0.02, below
  the overlay plane at +0.03, and writes no depth. Verify visually with the flow-field overlay
  enabled.
