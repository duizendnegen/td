// Mouse camera controller: wheel zoom + right-drag pan
// See the camera-controls change (designs D1/D3) and the isometric-camera
// spec's mouse camera controls requirement
//
// Responsibilities:
//   - Wheel: one stepZoom(±1) per notch about the cursor. Pixel-mode deltas
//     (trackpads) accumulate to a notch threshold so floods become discrete
//     rungs; line/page modes are notched hardware and step once per event.
//     A sign flip resets the accumulator so reversing never pays off the
//     opposite remainder.
//   - Right button, one owner: past the drag slop the world follows the
//     cursor via panByPixels; a sub-slop release is a click and fires
//     onRightClick (the tool-cancel PointerDriver used to own).
//   - Touch pointers are ignored — they belong to TouchCameraController.
//   - Render-side only: never touches the sim or the command queue.

import type { IsometricCamera } from '../render/cameras';
import { SLOP_PX } from './gestures';

/** One wheel notch, in pixel-mode deltaY units. */
const NOTCH_PX = 100;

interface RightDrag {
  x: number;
  y: number;
  startX: number;
  startY: number;
  panning: boolean;
}

export class MouseCameraController {
  private readonly canvas: HTMLCanvasElement;
  private readonly camera: IsometricCamera;
  private readonly onRightClick: () => void;
  /** Accumulated pixel-mode deltaY toward the next notch. */
  private wheelAcc = 0;
  private drag: RightDrag | null = null;

  constructor(canvas: HTMLCanvasElement, camera: IsometricCamera, onRightClick: () => void) {
    this.canvas = canvas;
    this.camera = camera;
    this.onRightClick = onRightClick;

    canvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch' || e.button !== 2) return;
      canvas.setPointerCapture?.(e.pointerId);
      this.drag = { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, panning: false };
    });
    canvas.addEventListener('pointermove', (e) => {
      const d = this.drag;
      if (!d || e.pointerType === 'touch') return;
      if (!d.panning && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > SLOP_PX) {
        d.panning = true;
      }
      if (d.panning) {
        this.camera.panByPixels(e.clientX - d.x, e.clientY - d.y, canvas.clientWidth, canvas.clientHeight);
      }
      d.x = e.clientX;
      d.y = e.clientY;
    });
    canvas.addEventListener('pointerup', (e) => {
      if (!this.drag || e.pointerType === 'touch' || e.button !== 2) return;
      if (!this.drag.panning) this.onRightClick();
      this.drag = null;
    });
    canvas.addEventListener('pointercancel', () => {
      this.drag = null;
    });
  }

  /** deltaY < 0 (scroll up) zooms in; > 0 zooms out. Always about the cursor. */
  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    if (e.deltaY === 0) return;
    if (e.deltaMode !== 0) {
      // Line/page modes come from notched wheels: one step per event.
      this.step(e.deltaY < 0 ? 1 : -1, e);
      return;
    }
    if (Math.sign(e.deltaY) !== Math.sign(this.wheelAcc)) this.wheelAcc = 0;
    this.wheelAcc += e.deltaY;
    while (Math.abs(this.wheelAcc) >= NOTCH_PX) {
      this.step(this.wheelAcc < 0 ? 1 : -1, e);
      this.wheelAcc -= Math.sign(this.wheelAcc) * NOTCH_PX;
    }
  }

  private step(direction: 1 | -1, e: { clientX: number; clientY: number }): void {
    const rect = this.canvas.getBoundingClientRect();
    const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.camera.stepZoom(direction, ndcX, ndcY);
  }
}
