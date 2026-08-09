# Tasks — camera-controls

## 1. Camera: stepped zoom ladder

- [ ] 1.1 In `src/render/cameras.ts`, extract the body of `pinch()` (set zoom, keep the NDC
      anchor fixed, `apply()`) into a private helper both `pinch()` and the new entry point
      share
- [ ] 1.2 Add `stepZoom(direction: 1 | -1, ndcX: number, ndcY: number)` per design D2:
      recover the rung with `round(ln(zoom)/ln(1.1))`, clamp `n + direction` to
      `[0, MAX_WHEEL_STEPS]` (derived from `MAX_ZOOM`), set `zoomLevel = Math.pow(1.1, n')`,
      and skip the anchor adjustment entirely when the rung didn't change
- [ ] 1.3 Extend `tests/camera.test.ts`: k steps in / k steps out is bit-identical and step 0
      equals the fit framing exactly; clamping at both ends leaves zoom and pan untouched;
      the cursor NDC point stays fixed across a step; after a mid-rung pinch the next step
      snaps back onto the ladder

## 2. Mouse camera controller

- [ ] 2.1 Create `src/ui/mousecam.ts` with `MouseCameraController(canvas, camera,
      onRightClick)` per design D3: right-button drag (non-touch pointers, pointer capture,
      `SLOP_PX` click/drag split, pan via `panByPixels`, sub-slop release fires
      `onRightClick`)
- [ ] 2.2 Add the wheel handler (`passive: false`, `preventDefault`): normalize `deltaY` by
      `deltaMode`, accumulate with sign-flip reset, one `stepZoom(±1, cursor NDC)` per notch
- [ ] 2.3 Add a controller test beside `tests/camera.test.ts` using its stubbed-canvas
      pattern: wheel notch up zooms by exactly 1.1 about the cursor; right-drag past slop
      pans and does not fire `onRightClick`; sub-slop right click fires `onRightClick` and
      moves nothing; touch pointers are ignored

## 3. Wiring and handover

- [ ] 3.1 Remove the `button === 2` branch from `PointerDriver` (`src/ui/input.ts`), leaving
      its `contextmenu` suppression in place
- [ ] 3.2 In `src/app/game.ts`, instantiate `MouseCameraController` exactly where
      `pointerCapable` selects `PointerDriver`, wiring `onRightClick` to
      `palette.select(null)`
- [ ] 3.3 Update the stale comments that camera code carries about desktop never zooming
      (`src/render/cameras.ts` header, `game.ts` hybrid comment)

## 4. Verify

- [ ] 4.1 `npm run typecheck` and `npm test` pass in the workspace
- [ ] 4.2 Manual pass with `npm run dev`: wheel zooms about the cursor and clamps at both
      ends; right-drag pans clamped to the board; right click still cancels the active tool;
      left-click build/select unchanged; replay/state hash untouched by camera motion (F4
      readout)
