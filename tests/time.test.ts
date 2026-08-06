// Time controls — the rate model and the loop's accumulator.
// See the time-controls change (design D1, D4, D8, D10)
//
// ENFORCES the deterministic-sim delta's timing guarantees, which are pure
// logic and so testable here rather than by playing: the clamp stays a stall
// guard rather than a speed limit, a long pause never bursts on resume, and a
// frozen frame renders committed state instead of an interpolated guess.
//
// The transport buttons themselves are verified by playing, per the project's
// render/ + ui/ test policy.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_FRAME_MS, startLoop } from '../src/app/loop';
import { TimeControl } from '../src/app/time';
import { TICK_MS } from '../src/sim/fixed';

/** Drives startLoop off a controlled clock instead of the display. */
function harness(time: TimeControl) {
  let clock = 0;
  let rafCb: ((t: number) => void) | null = null;
  vi.stubGlobal('performance', { now: () => clock });
  vi.stubGlobal('requestAnimationFrame', (cb: (t: number) => void) => {
    rafCb = cb;
    return 0;
  });

  const counts = { ticks: 0, commits: 0 };
  const alphas: number[] = [];
  startLoop(time, {
    tick: () => void counts.ticks++,
    commit: () => void counts.commits++,
    render: (alpha) => void alphas.push(alpha),
  });

  return {
    counts,
    alphas,
    /** Advance the wall clock by `dtMs` and run one frame. */
    frame(dtMs: number): void {
      clock += dtMs;
      rafCb!(clock);
    },
    lastAlpha: (): number => alphas[alphas.length - 1]!,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('rate model', () => {
  it('is the two-by-two of play/pause and the fast-forward override', () => {
    const time = new TimeControl(4);
    expect(time.rate).toBe(1); // playing, not held

    time.setFastForward(true, 'key');
    expect(time.rate).toBe(4); // playing, held

    time.setFastForward(false, 'key');
    time.setPaused(true);
    expect(time.rate).toBe(0); // paused, not held

    // The cell that makes a paused game scrubbable: FF overrides pause.
    time.setFastForward(true, 'key');
    expect(time.rate).toBe(4);

    // ...and releasing returns to frozen, not to playing.
    time.setFastForward(false, 'key');
    expect(time.rate).toBe(0);
    expect(time.paused).toBe(true);
  });

  it('tracks holds per source, so one release cannot cancel the other', () => {
    const time = new TimeControl(4);
    time.setFastForward(true, 'key');
    // A click anywhere fires a global pointer-up; it must not drop the key hold.
    time.setFastForward(false, 'pointer');
    expect(time.ffHeld).toBe(true);

    time.setFastForward(false, 'key');
    expect(time.ffHeld).toBe(false);
  });

  it('releases every hold at once when the window is lost', () => {
    const time = new TimeControl(4);
    time.setFastForward(true, 'key');
    time.setFastForward(true, 'pointer');
    time.releaseFastForward();
    expect(time.ffHeld).toBe(false);
  });
});

describe('loop accumulator', () => {
  it('drives ticks in proportion to the rate', () => {
    const time = new TimeControl(4);
    const h = harness(time);

    h.frame(TICK_MS);
    expect(h.counts.ticks).toBe(1);

    time.setFastForward(true, 'key');
    h.frame(TICK_MS);
    expect(h.counts.ticks).toBe(5); // 50ms × 4 = 4 more
  });

  it('clamps the wall-clock gap, not the scaled result', () => {
    // MAX_FRAME_MS is a stall guard. At 1× a huge frame yields the clamp's
    // worth of ticks; at 4× the same stall yields four times that, because the
    // clamp bounds elapsed time rather than speed.
    const atNormal = harness(new TimeControl(4));
    atNormal.frame(10_000);
    expect(atNormal.counts.ticks).toBe(MAX_FRAME_MS / TICK_MS);

    const ff = new TimeControl(4);
    ff.setFastForward(true, 'key');
    const atSpeed = harness(ff);
    atSpeed.frame(10_000);
    expect(atSpeed.counts.ticks).toBe((MAX_FRAME_MS / TICK_MS) * 4);
  });

  it('accumulates no time while paused, so resuming never bursts', () => {
    const time = new TimeControl(4);
    const h = harness(time);
    time.setPaused(true);

    for (let i = 0; i < 20; i++) h.frame(1_000); // 20 seconds paused
    expect(h.counts.ticks).toBe(0);

    time.setPaused(false);
    h.frame(TICK_MS);
    expect(h.counts.ticks).toBe(1); // one frame's worth, not 400
  });

  it('commits every frozen frame and ticks on none of them', () => {
    const time = new TimeControl(4);
    const h = harness(time);
    time.setPaused(true);

    h.frame(16);
    h.frame(16);
    expect(h.counts.commits).toBe(2);
    expect(h.counts.ticks).toBe(0);

    // Running frames tick and never commit — the two paths are exclusive.
    time.setPaused(false);
    h.frame(TICK_MS);
    expect(h.counts.commits).toBe(2);
    expect(h.counts.ticks).toBe(1);
  });

  it('renders committed positions while frozen and interpolates while running', () => {
    const time = new TimeControl(4);
    const h = harness(time);

    h.frame(TICK_MS / 2); // mid-tick
    expect(h.lastAlpha()).toBeCloseTo(0.5);

    time.setPaused(true);
    h.frame(16);
    expect(h.lastAlpha()).toBe(1);

    time.setPaused(false);
    h.frame(0);
    expect(h.lastAlpha()).toBeCloseTo(0.5); // the held fraction resumes
  });

  it('scrubs while paused: time advances only during a hold', () => {
    const time = new TimeControl(4);
    const h = harness(time);
    time.setPaused(true);

    h.frame(100);
    expect(h.counts.ticks).toBe(0);

    time.setFastForward(true, 'pointer'); // feather the button
    h.frame(100); // 100ms × 4 = 400ms = 8 ticks
    expect(h.counts.ticks).toBe(8);

    time.setFastForward(false, 'pointer');
    h.frame(100);
    expect(h.counts.ticks).toBe(8); // frozen again on release
  });
});
