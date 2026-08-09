# Design — camera-controls

## Context

See proposal.md for motivation. What shapes the approach:

- `IsometricCamera` (`src/render/cameras.ts`) already does everything but desktop input:
  continuous `zoomLevel` clamped to `[1, MAX_ZOOM]`, pan clamped to the fit extents in
  `apply()`, `pinch(scale, ndcX, ndcY)` keeps an NDC anchor fixed while zooming, and
  `panByPixels()` converts a screen-pixel drag into camera-space pan. All render-side.
- Input is split on capability (`(hover: hover) and (pointer: fine)`): `PointerDriver` owns
  non-touch pointers (left click commits, right *press* currently cancels the tool),
  `TouchCameraController` owns touch pointers on hybrids, `TouchDriver` owns everything on
  touch-primary devices — including mouse pointers, which its gesture tracker already pans
  with.
- `tests/camera.test.ts` asserts zoom-1 framing stays bit-identical after a pinch round-trip;
  the desktop guarantee to preserve is that step 0 of the new wheel ladder is that same exact
  framing.

## Goals / Non-Goals

**Goals:**

- Desktop pan/zoom driving the *existing* clamp and anchor machinery — no second camera model.
- Wheel zoom that is drift-free by construction: the zoom is a pure function of an integer
  step count, never an accumulated product.
- One owner per mouse button: left stays `PointerDriver`'s, right moves wholesale to the new
  controller (drag = pan, sub-slop click = the existing tool-cancel).

**Non-Goals:**

- Keyboard camera controls, on-screen camera buttons (explicitly deferred by the proposal).
- Any change to touch behavior, `GestureTracker`, or `TouchDriver`.
- Mouse support on touch-primary devices (a mouse plugged into a tablet already pans via
  `TouchDriver`'s tracker; it just gets no wheel zoom — accepted).

## Decisions

### D1 — Right button drags the world

Left button is the one-click build/select commit; giving it a drag role would force slop-based
disambiguation into the placement path and delay the game's primary interaction. The right
button already belongs to "meta" input (tool cancel) and gains the drag role instead.
Consequence: the cancel fires on right-*up* below the slop threshold (reusing `SLOP_PX = 8`
from `gestures.ts`) instead of on right-down — an imperceptible timing change. Drag direction:
the world follows the cursor, i.e. the same sign convention `panByPixels` already implements
for touch drags.

*Alternative rejected:* left-drag pan (conflicts with one-click commit); middle button (user
asked for left or right).

### D2 — Zoom is an integer ladder: `zoom = 1.1^n`, n ∈ [0, MAX_WHEEL_STEPS]

Repeated `zoom *= 1.1` / `zoom *= 1/1.1` drifts (`1.1 * (1/1.1) === 1.0000000000000002`), so
the camera gets a stepped entry point that never accumulates:

```
stepZoom(direction: 1 | -1, ndcX, ndcY):
  n  = round(ln(zoomLevel) / ln(1.1))        // current rung; exact recovery from any 1.1^n
  n' = clamp(n + direction, 0, MAX_WHEEL_STEPS)
  zoomLevel = Math.pow(1.1, n')              // pure function of n' — same n' ⇒ same float
  … same NDC-anchor pan adjustment and apply() as pinch()
```

- `Math.pow(1.1, 0) === 1` exactly, so step 0 reproduces the fit framing bit-identically —
  the invariant the existing round-trip test pins.
- `MAX_WHEEL_STEPS` is the largest n with `1.1^n ≤ MAX_ZOOM` (= 14 for `MAX_ZOOM` 4,
  `1.1^14 ≈ 3.80`), derived in code from `MAX_ZOOM`, not hard-coded, so the touch and wheel
  ceilings can't diverge.
- A clamped step (already at a limit) leaves both zoom *and* pan untouched — compute the
  anchor adjustment only when the rung actually changes.
- On hybrids a pinch can leave `zoomLevel` between rungs; the next wheel step's `round()`
  snaps to the nearest rung (≤ ~5% jump) and the ladder is exact again from there.
- The anchor math is shared with `pinch()` by extracting its "set zoom, keep NDC point fixed,
  apply" body into one private helper both call.

*Alternative rejected:* storing n as separate camera state — a second source of truth that a
pinch immediately invalidates.

### D3 — A `MouseCameraController`, sibling of `TouchCameraController`

New `src/ui/mousecam.ts`, constructed with the canvas, the camera, and an `onRightClick`
callback. It owns:

- `wheel` (registered `passive: false`, `preventDefault()`): normalize `deltaY` by
  `deltaMode` (lines ≈ 33 px, pages treated as one notch), accumulate, and emit one
  `stepZoom(±1, cursor NDC)` per 100 px notch; the accumulator resets on sign flip so a
  direction change never has to pay off the opposite remainder. Cursor NDC comes from the
  same `getBoundingClientRect` mapping `InputCore.pickTile` uses.
- Right-button pointer events (non-touch pointers only, same filter as `PointerDriver`):
  `setPointerCapture` on right-down so the drag survives leaving the canvas; below `SLOP_PX`
  it is a click → `onRightClick()`; past it, each move pans via `panByPixels`.

`PointerDriver` drops its `button === 2` branch; `game.ts` wires `onRightClick` to
`core.palette.select(null)` and instantiates the controller exactly where `pointerCapable`
selects `PointerDriver` (desktop and hybrid — on hybrids it coexists with
`TouchCameraController`, which filters to touch pointers, so no double-driving).

*Alternative rejected:* folding wheel/right-drag into `PointerDriver` — that driver is a thin
front-end over `InputCore` (sim commands); camera motion is render-side and belongs beside
`TouchCameraController`, mirroring the touch split.

## Risks / Trade-offs

- [Trackpads fire pixel-granular wheel floods] → the 100 px accumulator turns them into
  discrete rungs; worst case a step lags a few pixels of scroll, never over-zooms.
- [`Math.pow(1.1, n)` is not bit-specified across JS engines] → irrelevant here: consistency
  is within a session (same n ⇒ same float in one engine); nothing persists zoom.
- [Right-drag now also pans while a build tool is active] → intended: camera motion and the
  hover ghost compose; the ghost re-picks on the next pointermove. Cancel still works — it's
  the sub-slop case of the same gesture.
- [`preventDefault` on wheel swallows browser ctrl+wheel page zoom over the canvas] →
  accepted, standard for game canvases; the rest of the page keeps native zoom.

## Migration Plan

No persisted state, no data changes. Deploy is a normal build; rollback is a revert. The
only observable regression risk on unchanged paths is desktop framing, pinned by the existing
bit-identical fit test.
