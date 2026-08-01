// Fixed-timestep accumulator
// See ARCHITECTURE.md §7
//
// Responsibilities:
//   - 20Hz, with catch-up clamped to 5 ticks per frame
//   - Passes alpha to the renderer for interpolation

import { TICK_MS } from '../sim/fixed';

/** Frame-delta clamp: at most 5 ticks of catch-up per frame; the rest is dropped. */
export const MAX_FRAME_MS = 5 * TICK_MS;

export interface LoopHooks {
  tick(): void;
  /** alpha ∈ [0, 1): fraction of the next tick already elapsed, for interpolation. */
  render(alpha: number, frameDtMs: number): void;
}

export function startLoop(hooks: LoopHooks): void {
  let last = performance.now();
  let accumulator = 0;
  const frame = (now: number): void => {
    accumulator += Math.min(now - last, MAX_FRAME_MS);
    const frameDt = now - last;
    last = now;
    while (accumulator >= TICK_MS) {
      hooks.tick();
      accumulator -= TICK_MS;
    }
    hooks.render(accumulator / TICK_MS, frameDt);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
