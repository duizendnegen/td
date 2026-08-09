// See the camera-controls change: MouseCameraController (design D1/D3) —
// wheel-zoom steps and right-drag pan over the stubbed-canvas pattern from
// camera.test.ts
import { describe, expect, it } from 'vitest';
import { IsometricCamera, ZOOM_STEP_FACTOR } from '../src/render/cameras';
import { MouseCameraController } from '../src/ui/mousecam';

const BOARD = { width: 30, height: 20 };

const bounds = (c: IsometricCamera) => ({
  left: c.camera.left,
  right: c.camera.right,
  top: c.camera.top,
  bottom: c.camera.bottom,
});

interface Rig {
  cam: IsometricCamera;
  cancels: number;
  wheel: (deltaY: number, opts?: { deltaMode?: number; clientX?: number; clientY?: number }) => void;
  pointer: (
    type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel',
    e: { pointerId?: number; clientX?: number; clientY?: number; button?: number; pointerType?: string },
  ) => void;
}

function rig(): Rig {
  const handlers = new Map<string, (e: unknown) => void>();
  const canvas = {
    addEventListener: (t: string, h: (e: unknown) => void) => handlers.set(t, h),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }),
    setPointerCapture: () => {},
    clientWidth: 1280,
    clientHeight: 720,
  } as unknown as HTMLCanvasElement;
  const cam = new IsometricCamera(16 / 9, BOARD);
  const r: Rig = {
    cam,
    cancels: 0,
    wheel: (deltaY, opts = {}) =>
      handlers.get('wheel')!({
        deltaY,
        deltaMode: opts.deltaMode ?? 0,
        clientX: opts.clientX ?? 640,
        clientY: opts.clientY ?? 360,
        preventDefault: () => {},
      }),
    pointer: (type, e) =>
      handlers.get(type)!({
        pointerId: e.pointerId ?? 1,
        clientX: e.clientX ?? 0,
        clientY: e.clientY ?? 0,
        button: e.button ?? 2,
        pointerType: e.pointerType ?? 'mouse',
      }),
  };
  new MouseCameraController(canvas, cam, () => r.cancels++);
  return r;
}

describe('mouse camera controller', () => {
  it('one wheel notch up zooms in by exactly 1.1, about the cursor', () => {
    const r = rig();
    const before = bounds(r.cam);
    // Cursor at NDC (0.4, 0.4).
    const ndc = { x: 0.4, y: 0.4 };
    const viewX = (before.left + before.right) / 2 + (ndc.x * (before.right - before.left)) / 2;
    const viewY = (before.top + before.bottom) / 2 + (ndc.y * (before.top - before.bottom)) / 2;
    r.wheel(-100, { clientX: 896, clientY: 216 });
    expect(r.cam.zoom).toBe(Math.pow(ZOOM_STEP_FACTOR, 1));
    const after = bounds(r.cam);
    const viewX2 = (after.left + after.right) / 2 + (ndc.x * (after.right - after.left)) / 2;
    const viewY2 = (after.top + after.bottom) / 2 + (ndc.y * (after.top - after.bottom)) / 2;
    expect(viewX2).toBeCloseTo(viewX);
    expect(viewY2).toBeCloseTo(viewY);
  });

  it('a wheel notch down at the fit level is a no-op', () => {
    const r = rig();
    const fit = bounds(r.cam);
    r.wheel(100);
    expect(r.cam.zoom).toBe(1);
    expect(bounds(r.cam)).toEqual(fit);
  });

  it('trackpad pixel floods accumulate into whole notches', () => {
    const r = rig();
    for (let i = 0; i < 4; i++) r.wheel(-20);
    expect(r.cam.zoom).toBe(1); // 80px: not a notch yet
    r.wheel(-20);
    expect(r.cam.zoom).toBe(Math.pow(ZOOM_STEP_FACTOR, 1)); // 100px: exactly one
  });

  it('a scroll direction change resets the accumulated remainder', () => {
    const r = rig();
    r.wheel(60);
    r.wheel(-60); // flip: the +60 remainder must not eat into this
    r.wheel(-40); // -100 total since the flip: one step in
    expect(r.cam.zoom).toBe(Math.pow(ZOOM_STEP_FACTOR, 1));
  });

  it('line-mode wheels (notched hardware) step once per event', () => {
    const r = rig();
    r.wheel(-3, { deltaMode: 1 });
    expect(r.cam.zoom).toBe(Math.pow(ZOOM_STEP_FACTOR, 1));
  });

  it('right-drag past the slop pans the world and never fires the click', () => {
    const r = rig();
    r.wheel(-100);
    r.wheel(-100); // zoomed in: pan has room
    const before = bounds(r.cam);
    r.pointer('pointerdown', { clientX: 600, clientY: 300 });
    r.pointer('pointermove', { clientX: 700, clientY: 340 });
    r.pointer('pointerup', { clientX: 700, clientY: 340 });
    expect(bounds(r.cam)).not.toEqual(before);
    expect(r.cancels).toBe(0);
  });

  it('a sub-slop right click fires onRightClick and moves nothing', () => {
    const r = rig();
    r.wheel(-100);
    const before = bounds(r.cam);
    r.pointer('pointerdown', { clientX: 600, clientY: 300 });
    r.pointer('pointermove', { clientX: 603, clientY: 302 });
    r.pointer('pointerup', { clientX: 603, clientY: 302 });
    expect(r.cancels).toBe(1);
    expect(bounds(r.cam)).toEqual(before);
  });

  it('other pointers never drive or cancel an active right-drag', () => {
    const r = rig();
    r.wheel(-100);
    r.wheel(-100); // zoomed in: pan has room
    r.pointer('pointerdown', { clientX: 600, clientY: 300, pointerId: 1 });
    r.pointer('pointermove', { clientX: 700, clientY: 340, pointerId: 1 }); // past slop: panning
    const mid = bounds(r.cam);
    r.pointer('pointermove', { clientX: 900, clientY: 500, pointerId: 7 }); // stray pen/touch pointer
    expect(bounds(r.cam)).toEqual(mid);
    r.pointer('pointercancel', { pointerId: 7 }); // touch cancel must not kill the drag
    r.pointer('pointermove', { clientX: 720, clientY: 350, pointerId: 1 });
    expect(bounds(r.cam)).not.toEqual(mid);
    r.pointer('pointercancel', { pointerId: 1 }); // the owner's cancel does
    r.pointer('pointermove', { clientX: 900, clientY: 500, pointerId: 1 });
    const after = bounds(r.cam);
    r.pointer('pointerup', { clientX: 900, clientY: 500, pointerId: 1 });
    expect(bounds(r.cam)).toEqual(after);
    expect(r.cancels).toBe(0);
  });

  it('touch pointers and other buttons are ignored', () => {
    const r = rig();
    r.wheel(-100);
    const before = bounds(r.cam);
    r.pointer('pointerdown', { clientX: 600, clientY: 300, pointerType: 'touch' });
    r.pointer('pointermove', { clientX: 800, clientY: 400, pointerType: 'touch' });
    r.pointer('pointerup', { clientX: 800, clientY: 400, pointerType: 'touch' });
    r.pointer('pointerdown', { clientX: 600, clientY: 300, button: 0 });
    r.pointer('pointermove', { clientX: 800, clientY: 400, button: 0 });
    r.pointer('pointerup', { clientX: 800, clientY: 400, button: 0 });
    expect(bounds(r.cam)).toEqual(before);
    expect(r.cancels).toBe(0);
  });
});
