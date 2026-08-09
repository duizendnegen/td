# Camera controls (desktop mouse pan + zoom)

## Why

Touch devices can already zoom into the board and pan around it, but desktop is locked to the
fixed whole-board framing — mouse players cannot lean in to read a tight maze corner or check a
diagonal gap up close. The camera machinery (clamped zoom + pan, render-side only) already
exists; desktop just has no way to drive it.

## What Changes

- **Right-mouse drag pans the camera** ("drag the world": the board follows the cursor), using
  the existing clamped pan so the view never leaves the board plus its margin. Left button is
  untouched — it stays the one-click build/select model. A right *click* (no drag) still
  cancels the active tool, as today.
- **Mouse wheel zooms**: scroll up zooms in, scroll down zooms out, anchored at the cursor so
  the world point under the mouse stays put. Each step multiplies the zoom by exactly 1.1 (or
  its inverse). The zoom level is always computed as an integer power of 1.1 — never by
  accumulated multiplication — so `n` steps in followed by `n` steps out lands on the
  bit-identical framing, and step 0 is exactly the fit-to-board framing.
- **Limits**: zoom is clamped between the fit-to-board level (1×) and the existing `MAX_ZOOM`
  ceiling shared with touch; pan is clamped to the fit extents exactly as touch pan is.
- Explicitly out of scope: keyboard camera controls and on-screen camera buttons.
- Camera motion remains render-side only: no commands, no sim state, replay hashes unaffected.
- Touch behavior is unchanged; on hybrid devices wheel/right-drag coexist with pinch/drag.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `isometric-camera`: the "on non-touch devices the framing is fixed" clause is replaced by a
  mouse camera-controls requirement (right-drag pan, wheel zoom in exact ×1.1 steps, same
  clamps as touch, render-side only).

## Impact

- `src/render/cameras.ts` — new stepped-zoom entry point on `IsometricCamera` that snaps the
  zoom onto the exact 1.1ⁿ ladder; existing `pinch`/`panByPixels`/clamping reused as-is.
- `src/ui/` — a small mouse camera controller (wheel + right-drag with click/drag slop),
  sibling of `TouchCameraController`; `PointerDriver` hands right-button handling over to it.
- `src/app/game.ts` — wire the controller wherever `PointerDriver` is chosen (desktop and
  hybrid).
- `tests/camera.test.ts` (zoom-ladder exactness) and a new controller test alongside
  `tests/gestures.test.ts`-style DOM stubbing.
- No data, sim, or dependency changes.
