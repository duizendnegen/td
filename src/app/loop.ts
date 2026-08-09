// Fixed-timestep accumulator
// See ARCHITECTURE.md §7 and the time-controls change (design D2, D8)
//
// Responsibilities:
//   - 20Hz, with catch-up clamped to 5 ticks' worth of real time per frame
//   - Passes alpha to the renderer for interpolation
//   - Scales real time by the time control's rate, and freezes at rate 0
//
// The rate lives here and nowhere else. The simulation has no clock and no
// notion of pause: pause is simply this loop not calling `advance()`.

import { TICK_MS } from '../sim/fixed';
import type { TimeControl } from './time';

/**
 * Frame-delta clamp: at most 5 ticks' worth of wall-clock catch-up per frame;
 * the rest is dropped. Applied before the rate scales it, so fast-forward can
 * run up to 5 × rate ticks in one frame.
 */
export const MAX_FRAME_MS = 5 * TICK_MS;

export interface LoopHooks {
  /** Advance one simulation tick — commit then advance. */
  tick(): void;
  /**
   * Absorb queued player intent without consuming time. Called every frozen
   * frame, so a paused game responds to building immediately, and so entities
   * hold still: the commit re-snapshots each `prevPos` onto its `pos`.
   */
  commit(): void;
  /** alpha ∈ [0, 1): fraction of the next tick already elapsed, for interpolation. */
  render(alpha: number, frameDtMs: number): void;
}

export function startLoop(time: TimeControl, hooks: LoopHooks): void {
  let last = performance.now();
  let accumulator = 0;
  const frame = (now: number): void => {
    const frameDt = now - last;
    last = now;
    const rate = time.rate;
    // The clamp guards against a stall spiral, so it applies to the elapsed
    // wall-clock gap — before the rate scales it. Scaling after keeps
    // MAX_FRAME_MS a stall guard rather than a speed limit.
    accumulator += Math.min(frameDt, MAX_FRAME_MS) * rate;

    if (rate === 0) {
      // Frozen: no time accumulates, so resuming never bursts. Intent still
      // lands, at once, on a still board.
      hooks.commit();
    } else {
      while (accumulator >= TICK_MS) {
        hooks.tick();
        accumulator -= TICK_MS;
      }
    }

    // A stopped simulation displays what IS, not an interpolated guess.
    hooks.render(rate === 0 ? 1 : accumulator / TICK_MS, frameDt);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
