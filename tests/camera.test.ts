// See the aether-ui-redesign isometric-camera spec and design D5, and the
// camera-controls change (wheel-zoom ladder, design D2)
import { describe, expect, it } from 'vitest';
import { IsometricCamera, MAX_WHEEL_STEPS, MAX_ZOOM, ZOOM_STEP_FACTOR } from '../src/render/cameras';
import { TouchCameraController } from '../src/ui/touch';

const BOARD = { width: 30, height: 20 };

const bounds = (c: IsometricCamera) => ({
  left: c.camera.left,
  right: c.camera.right,
  top: c.camera.top,
  bottom: c.camera.bottom,
});

describe('isometric camera zoom + pan', () => {
  it('zoom 1 framing is bit-identical after a pinch round-trip', () => {
    const cam = new IsometricCamera(16 / 9, BOARD);
    const fit = bounds(cam);
    cam.pinch(2, 0.5, -0.3);
    cam.panByPixels(120, -40, 1280, 720);
    cam.pinch(1 / MAX_ZOOM / 2, 0, 0); // clamps back down to exactly 1
    expect(cam.zoom).toBe(1);
    expect(bounds(cam)).toEqual(fit);
  });

  it('zooming divides the view extents and preserves the aspect', () => {
    const cam = new IsometricCamera(16 / 9, BOARD);
    const fit = bounds(cam);
    cam.pinch(2, 0, 0);
    const zoomed = bounds(cam);
    expect(zoomed.right - zoomed.left).toBeCloseTo((fit.right - fit.left) / 2);
    expect((zoomed.right - zoomed.left) / (zoomed.top - zoomed.bottom)).toBeCloseTo(16 / 9);
  });

  it('zoom clamps to [1, MAX_ZOOM]', () => {
    const cam = new IsometricCamera(16 / 9, BOARD);
    cam.pinch(0.01, 0, 0);
    expect(cam.zoom).toBe(1);
    cam.pinch(1000, 0, 0);
    expect(cam.zoom).toBe(MAX_ZOOM);
  });

  it('pan is clamped so the view never leaves the fit extents', () => {
    const cam = new IsometricCamera(16 / 9, BOARD);
    const fit = bounds(cam);
    cam.pinch(2, 0, 0);
    cam.panByPixels(1e6, -1e6, 1280, 720); // absurd drag: pin to a corner
    const b = bounds(cam);
    expect(b.left).toBeGreaterThanOrEqual(fit.left - 1e-9);
    expect(b.right).toBeLessThanOrEqual(fit.right + 1e-9);
    expect(b.top).toBeLessThanOrEqual(fit.top + 1e-9);
    expect(b.bottom).toBeGreaterThanOrEqual(fit.bottom - 1e-9);
  });

  it('pan at zoom 1 is a no-op (fit already fills the frustum)', () => {
    const cam = new IsometricCamera(16 / 9, BOARD);
    const fit = bounds(cam);
    cam.panByPixels(300, 200, 1280, 720);
    expect(bounds(cam)).toEqual(fit);
  });

  it('pinching about a midpoint keeps that view point fixed', () => {
    const cam = new IsometricCamera(16 / 9, BOARD);
    const ndc = { x: 0.4, y: -0.2 };
    const before = bounds(cam);
    const viewX = (before.left + before.right) / 2 + (ndc.x * (before.right - before.left)) / 2;
    const viewY = (before.top + before.bottom) / 2 + (ndc.y * (before.top - before.bottom)) / 2;
    cam.pinch(1.7, ndc.x, ndc.y);
    const after = bounds(cam);
    const viewX2 = (after.left + after.right) / 2 + (ndc.x * (after.right - after.left)) / 2;
    const viewY2 = (after.top + after.bottom) / 2 + (ndc.y * (after.top - after.bottom)) / 2;
    expect(viewX2).toBeCloseTo(viewX);
    expect(viewY2).toBeCloseTo(viewY);
  });

  it('hybrid touch camera: touch pinch zooms, touch drag pans, mouse is ignored', () => {
    // Regression for the balance-ux-tweaks mobile-camera fix: on a device
    // with a fine pointer AND a touch screen, touch must still drive the
    // camera (isometric-camera spec) without routing through PointerDriver.
    const handlers = new Map<string, (e: unknown) => void>();
    const canvas = {
      addEventListener: (t: string, h: (e: unknown) => void) => handlers.set(t, h),
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }),
      clientWidth: 1280,
      clientHeight: 720,
    } as unknown as HTMLCanvasElement;
    const cam = new IsometricCamera(16 / 9, BOARD);
    new TouchCameraController(canvas, cam);
    const fire = (
      type: string,
      e: { pointerId: number; clientX: number; clientY: number; pointerType: string },
    ): void => handlers.get(type)!({ ...e, timeStamp: 0 });

    // A mouse "pinch" is ignored entirely — that pointer belongs to PointerDriver.
    fire('pointerdown', { pointerId: 9, clientX: 500, clientY: 300, pointerType: 'mouse' });
    fire('pointermove', { pointerId: 9, clientX: 700, clientY: 300, pointerType: 'mouse' });
    fire('pointerup', { pointerId: 9, clientX: 700, clientY: 300, pointerType: 'mouse' });
    expect(cam.zoom).toBe(1);

    // Two touch pointers spreading apart zoom in about their midpoint.
    fire('pointerdown', { pointerId: 1, clientX: 500, clientY: 300, pointerType: 'touch' });
    fire('pointerdown', { pointerId: 2, clientX: 700, clientY: 300, pointerType: 'touch' });
    fire('pointermove', { pointerId: 1, clientX: 400, clientY: 300, pointerType: 'touch' });
    fire('pointermove', { pointerId: 2, clientX: 800, clientY: 300, pointerType: 'touch' });
    expect(cam.zoom).toBeGreaterThan(1);
    fire('pointerup', { pointerId: 1, clientX: 400, clientY: 300, pointerType: 'touch' });
    fire('pointerup', { pointerId: 2, clientX: 800, clientY: 300, pointerType: 'touch' });

    // A one-finger touch drag pans the zoomed view.
    const before = bounds(cam);
    fire('pointerdown', { pointerId: 3, clientX: 600, clientY: 300, pointerType: 'touch' });
    fire('pointermove', { pointerId: 3, clientX: 700, clientY: 340, pointerType: 'touch' }); // drag-start
    fire('pointermove', { pointerId: 3, clientX: 800, clientY: 380, pointerType: 'touch' }); // drag-move
    fire('pointerup', { pointerId: 3, clientX: 800, clientY: 380, pointerType: 'touch' });
    expect(bounds(cam)).not.toEqual(before);
  });

  it('a resize while zoomed preserves the view centre and re-clamps', () => {
    const cam = new IsometricCamera(16 / 9, BOARD);
    cam.pinch(3, 0, 0);
    cam.panByPixels(-400, 150, 1280, 720);
    const before = bounds(cam);
    const centre = {
      x: (before.left + before.right) / 2,
      y: (before.top + before.bottom) / 2,
    };
    cam.frame(4 / 3);
    const after = bounds(cam);
    expect(cam.zoom).toBe(3);
    expect((after.left + after.right) / 2).toBeCloseTo(centre.x, 1);
    expect((after.top + after.bottom) / 2).toBeCloseTo(centre.y, 1);
    expect((after.right - after.left) / (after.top - after.bottom)).toBeCloseTo(4 / 3);
  });
});

describe('wheel-zoom ladder (camera-controls D2)', () => {
  it('zoom is always exactly 1.1^n, and k steps in / k steps out is bit-identical', () => {
    const cam = new IsometricCamera(16 / 9, BOARD);
    const fit = bounds(cam);
    for (let i = 1; i <= 5; i++) {
      cam.stepZoom(1, 0.5, -0.3);
      expect(cam.zoom).toBe(Math.pow(ZOOM_STEP_FACTOR, i));
    }
    for (let i = 4; i >= 0; i--) {
      cam.stepZoom(-1, 0.5, -0.3);
      expect(cam.zoom).toBe(Math.pow(ZOOM_STEP_FACTOR, i));
    }
    // Rung 0 is the fit framing exactly — same guarantee the pinch
    // round-trip test pins, now via the ladder.
    expect(cam.zoom).toBe(1);
    expect(bounds(cam)).toEqual(fit);
  });

  it('clamps at both ends with no pan drift from rejected steps', () => {
    const cam = new IsometricCamera(16 / 9, BOARD);
    const fit = bounds(cam);
    cam.stepZoom(-1, 0.7, 0.7); // already at rung 0
    expect(cam.zoom).toBe(1);
    expect(bounds(cam)).toEqual(fit);
    for (let i = 0; i < 40; i++) cam.stepZoom(1, 0.2, 0.1);
    expect(cam.zoom).toBe(Math.pow(ZOOM_STEP_FACTOR, MAX_WHEEL_STEPS));
    expect(cam.zoom).toBeLessThanOrEqual(MAX_ZOOM);
    const atMax = bounds(cam);
    cam.stepZoom(1, 0.2, 0.1); // rejected: must not nudge the pan either
    expect(bounds(cam)).toEqual(atMax);
  });

  it('a step keeps the world point under the cursor fixed', () => {
    const cam = new IsometricCamera(16 / 9, BOARD);
    const ndc = { x: 0.4, y: -0.2 };
    const before = bounds(cam);
    const viewX = (before.left + before.right) / 2 + (ndc.x * (before.right - before.left)) / 2;
    const viewY = (before.top + before.bottom) / 2 + (ndc.y * (before.top - before.bottom)) / 2;
    cam.stepZoom(1, ndc.x, ndc.y);
    const after = bounds(cam);
    const viewX2 = (after.left + after.right) / 2 + (ndc.x * (after.right - after.left)) / 2;
    const viewY2 = (after.top + after.bottom) / 2 + (ndc.y * (after.top - after.bottom)) / 2;
    expect(viewX2).toBeCloseTo(viewX);
    expect(viewY2).toBeCloseTo(viewY);
  });

  it('snaps back onto the ladder after a mid-rung pinch', () => {
    const cam = new IsometricCamera(16 / 9, BOARD);
    cam.pinch(1.3, 0, 0); // between rungs 2 (1.21) and 3 (1.331)
    cam.stepZoom(1, 0, 0);
    expect(cam.zoom).toBe(Math.pow(ZOOM_STEP_FACTOR, 4));
  });

  it('at the pinch ceiling a zoom-in step is a no-op, never a snap down', () => {
    const cam = new IsometricCamera(16 / 9, BOARD);
    cam.pinch(1000, 0, 0); // clamps to MAX_ZOOM, above the top rung
    expect(cam.zoom).toBe(MAX_ZOOM);
    cam.stepZoom(1, 0, 0);
    expect(cam.zoom).toBe(MAX_ZOOM);
    cam.stepZoom(-1, 0, 0); // out-step drops to the rung below the ceiling
    expect(cam.zoom).toBe(Math.pow(ZOOM_STEP_FACTOR, MAX_WHEEL_STEPS - 1));
  });
});
