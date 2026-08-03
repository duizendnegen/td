// See the aether-ui-redesign touch-input spec and design D4
import { describe, expect, it } from 'vitest';
import { GestureTracker, SLOP_PX, TAP_MS } from '../src/ui/gestures';

describe('gesture tracker', () => {
  it('a quick still release is a tap', () => {
    const g = new GestureTracker();
    expect(g.down(1, 100, 100, 0)).toBeNull();
    expect(g.up(1, 103, 102, 120)).toEqual({ kind: 'tap', x: 103, y: 102 });
  });

  it('a release beyond the slop is not a tap', () => {
    const g = new GestureTracker();
    g.down(1, 100, 100, 0);
    expect(g.up(1, 100 + SLOP_PX + 1, 100, 100)).toBeNull();
  });

  it('a release after the tap window is not a tap', () => {
    const g = new GestureTracker();
    g.down(1, 100, 100, 0);
    expect(g.up(1, 100, 100, TAP_MS + 1)).toBeNull();
  });

  it('crossing the slop starts a drag and streams moves until the end', () => {
    const g = new GestureTracker();
    g.down(1, 100, 100, 0);
    expect(g.move(1, 104, 100, 50)).toBeNull(); // within slop
    expect(g.move(1, 112, 100, 80)).toEqual({ kind: 'drag-start', x: 112, y: 100 });
    expect(g.move(1, 120, 105, 110)).toEqual({ kind: 'drag-move', x: 120, y: 105, dx: 8, dy: 5 });
    expect(g.up(1, 120, 105, 150)).toEqual({ kind: 'drag-end' });
  });

  it('holding past the tap window turns the next move into a drag (press-and-adjust)', () => {
    const g = new GestureTracker();
    g.down(1, 100, 100, 0);
    expect(g.move(1, 102, 101, TAP_MS + 50)).toEqual({ kind: 'drag-start', x: 102, y: 101 });
  });

  it('a second pointer starts a pinch; moves report scale and midpoint travel', () => {
    const g = new GestureTracker();
    g.down(1, 100, 100, 0);
    expect(g.down(2, 200, 100, 30)).toEqual({ kind: 'pinch-start' });
    // Spread from 100px apart to 150px apart, midpoint drifts +5 in x.
    const ev = g.move(2, 255, 100, 60);
    expect(ev?.kind).toBe('pinch-move');
    if (ev?.kind === 'pinch-move') {
      expect(ev.scale).toBeCloseTo(1.55);
      expect(ev.centerX).toBeCloseTo(177.5);
      expect(ev.dx).toBeCloseTo(27.5);
      expect(ev.dy).toBe(0);
    }
  });

  it('a pinch never falls back to a tap or drag mid-gesture', () => {
    const g = new GestureTracker();
    g.down(1, 100, 100, 0);
    g.down(2, 200, 100, 20);
    expect(g.up(2, 200, 100, 60)?.kind).toBe('pinch-end');
    // The surviving finger is inert until lifted: no drag, no tap.
    expect(g.move(1, 160, 140, 80)).toBeNull();
    expect(g.up(1, 160, 140, 100)).toBeNull();
    // …and the tracker is clean for the next gesture.
    g.down(3, 50, 50, 200);
    expect(g.up(3, 50, 50, 260)).toEqual({ kind: 'tap', x: 50, y: 50 });
  });

  it('a drag in progress upgrades to a pinch when a second finger lands', () => {
    const g = new GestureTracker();
    g.down(1, 100, 100, 0);
    g.move(1, 120, 100, 50); // drag-start
    expect(g.down(2, 200, 100, 80)).toEqual({ kind: 'pinch-start' });
  });

  it('a third finger is ignored', () => {
    const g = new GestureTracker();
    g.down(1, 100, 100, 0);
    g.down(2, 200, 100, 20);
    expect(g.down(3, 300, 100, 40)).toBeNull();
    expect(g.move(3, 310, 100, 60)).toBeNull();
    expect(g.up(3, 310, 100, 80)).toBeNull();
    // The original pinch pair still works.
    expect(g.move(1, 90, 100, 100)?.kind).toBe('pinch-move');
  });

  it('pointercancel aborts without emitting a tap', () => {
    const g = new GestureTracker();
    g.down(1, 100, 100, 0);
    expect(g.cancel(1)).toBeNull();
    // Clean afterwards.
    g.down(2, 50, 50, 100);
    expect(g.up(2, 50, 50, 150)).toEqual({ kind: 'tap', x: 50, y: 50 });
  });
});
