## 1. Camera retune

- [ ] 1.1 In `src/render/cameras.ts`, change `PITCH` from `Math.atan(1 / Math.SQRT2)` to
      `Math.PI / 6` (30°) and update the file's header comment to describe the 2:1 dimetric
      projection instead of true isometric
- [ ] 1.2 Verify framing still holds: run the game (`npm run dev`) and confirm the whole 30×20
      board plus margin is on screen, tiles render as 2:1 diamonds, and resizing the window keeps
      the board framed without distortion

## 2. Documentation sync

- [ ] 2.1 Update the Camera section of `ARCHITECTURE.md` (~lines 439–450) to state the fixed 30°
      pitch / 2:1 dimetric projection and drop the "~30–35°, tuned by eye" wording, keeping the
      occlusion trade-off note
- [ ] 2.2 Run `npm run typecheck` and `npm test` to confirm nothing regresses
