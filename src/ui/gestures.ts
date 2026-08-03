// Touch gesture tracker: tap / drag / pinch over raw pointer events
// See the aether-ui-redesign touch-input spec and design D4
//
// Pure logic over (id, x, y, timeMs) tuples — no DOM, no gesture library —
// so the disambiguation rules are unit-testable. The driver feeds it
// pointerdown/move/up/cancel and routes the emitted gestures.
//
// Rules (design D4):
//   - tap: released within 8px of the start and within 250ms
//   - drag: starts when the pointer exceeds the 8px slop, or keeps holding
//     past 250ms (press-and-adjust)
//   - pinch: a second pointer always starts a pinch (camera gesture); when
//     it ends, the surviving pointer is inert until lifted — lifting one
//     finger of a pinch must not suddenly drag or tap

export const SLOP_PX = 8;
export const TAP_MS = 250;

export type GestureEvent =
  | { kind: 'tap'; x: number; y: number }
  | { kind: 'drag-start'; x: number; y: number }
  | { kind: 'drag-move'; x: number; y: number; dx: number; dy: number }
  | { kind: 'drag-end' }
  | { kind: 'pinch-start' }
  | {
      kind: 'pinch-move';
      /** Distance ratio against the previous pinch-move (1 = no zoom). */
      scale: number;
      centerX: number;
      centerY: number;
      /** Midpoint travel since the previous pinch-move. */
      dx: number;
      dy: number;
    }
  | { kind: 'pinch-end' };

interface PointerState {
  x: number;
  y: number;
  startX: number;
  startY: number;
  startT: number;
}

type Mode = 'idle' | 'pending' | 'drag' | 'pinch' | 'settling';

export class GestureTracker {
  private readonly pointers = new Map<number, PointerState>();
  private mode: Mode = 'idle';
  private pinchIds: [number, number] | null = null;
  private lastDist = 0;
  private lastMidX = 0;
  private lastMidY = 0;

  down(id: number, x: number, y: number, t: number): GestureEvent | null {
    this.pointers.set(id, { x, y, startX: x, startY: y, startT: t });
    if (this.pointers.size === 1) {
      this.mode = 'pending';
      return null;
    }
    if (this.pointers.size === 2 && (this.mode === 'pending' || this.mode === 'drag')) {
      const [a, b] = [...this.pointers.keys()] as [number, number];
      this.pinchIds = [a, b];
      this.measurePinch();
      this.mode = 'pinch';
      return { kind: 'pinch-start' };
    }
    // Third and later pointers are ignored (tracked only for bookkeeping).
    return null;
  }

  move(id: number, x: number, y: number, t: number): GestureEvent | null {
    const p = this.pointers.get(id);
    if (!p) return null;
    const prevX = p.x;
    const prevY = p.y;
    p.x = x;
    p.y = y;

    if (this.mode === 'pinch') {
      if (!this.pinchIds || (id !== this.pinchIds[0] && id !== this.pinchIds[1])) return null;
      const prevDist = this.lastDist;
      const prevMidX = this.lastMidX;
      const prevMidY = this.lastMidY;
      this.measurePinch();
      return {
        kind: 'pinch-move',
        scale: prevDist > 0 ? this.lastDist / prevDist : 1,
        centerX: this.lastMidX,
        centerY: this.lastMidY,
        dx: this.lastMidX - prevMidX,
        dy: this.lastMidY - prevMidY,
      };
    }
    if (this.mode === 'pending') {
      const dist = Math.hypot(x - p.startX, y - p.startY);
      if (dist > SLOP_PX || t - p.startT > TAP_MS) {
        this.mode = 'drag';
        return { kind: 'drag-start', x, y };
      }
      return null;
    }
    if (this.mode === 'drag') {
      return { kind: 'drag-move', x, y, dx: x - prevX, dy: y - prevY };
    }
    return null;
  }

  up(id: number, x: number, y: number, t: number): GestureEvent | null {
    const p = this.pointers.get(id);
    if (!p) return null;
    this.pointers.delete(id);

    if (this.mode === 'pinch') {
      if (this.pinchIds && (id === this.pinchIds[0] || id === this.pinchIds[1])) {
        this.pinchIds = null;
        this.mode = this.pointers.size === 0 ? 'idle' : 'settling';
        return { kind: 'pinch-end' };
      }
      return null;
    }
    if (this.mode === 'settling') {
      if (this.pointers.size === 0) this.mode = 'idle';
      return null;
    }
    if (this.mode === 'pending') {
      this.mode = 'idle';
      const dist = Math.hypot(x - p.startX, y - p.startY);
      if (dist <= SLOP_PX && t - p.startT <= TAP_MS) return { kind: 'tap', x, y };
      return null;
    }
    if (this.mode === 'drag') {
      this.mode = 'idle';
      return { kind: 'drag-end' };
    }
    return null;
  }

  /** Pointer cancelled by the browser: drop it like an up with no gesture. */
  cancel(id: number): GestureEvent | null {
    const p = this.pointers.get(id);
    if (!p) return null;
    this.pointers.delete(id);
    if (this.mode === 'pinch' && this.pinchIds && (id === this.pinchIds[0] || id === this.pinchIds[1])) {
      this.pinchIds = null;
      this.mode = this.pointers.size === 0 ? 'idle' : 'settling';
      return { kind: 'pinch-end' };
    }
    if (this.pointers.size === 0) {
      const wasDrag = this.mode === 'drag';
      this.mode = 'idle';
      return wasDrag ? { kind: 'drag-end' } : null;
    }
    return null;
  }

  private measurePinch(): void {
    if (!this.pinchIds) return;
    const a = this.pointers.get(this.pinchIds[0])!;
    const b = this.pointers.get(this.pinchIds[1])!;
    this.lastDist = Math.hypot(a.x - b.x, a.y - b.y);
    this.lastMidX = (a.x + b.x) / 2;
    this.lastMidY = (a.y + b.y) / 2;
  }
}
