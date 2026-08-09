// The isometric camera
// See ARCHITECTURE.md §8, design D-P1-7, and the aether-ui-redesign
// isometric-camera spec (design D5)
//
// Responsibilities:
//   - One fixed OrthographicCamera: 45° yaw, 30° pitch (2:1 dimetric),
//     whole board framed at the default zoom, re-fit on resize
//   - Orthographic so a 1-tile gap measures identically anywhere on screen;
//     the low pitch is what lets height read by silhouette
//   - Touch devices may pinch-zoom (1× fit … MAX_ZOOM) and pan; desktop
//     wheel-zooms on the exact 1.1^n step ladder (stepZoom) and right-drag
//     pans. All of it is clamped to the fit extents and never leaves the
//     render side; ladder step 0 reproduces the fit framing bit-identically.

import * as THREE from 'three';

const YAW = (45 * Math.PI) / 180; // viewed from the south-east
// A ground tile projects as a diamond of width:height = 1/sin(pitch); 30°
// gives the exact 2:1 diamond of RCT-era dimetric games.
const PITCH = Math.PI / 6;
const DIST = 60;
const MARGIN = 1.2;
/** Tallest thing the frustum must keep on screen (Phase-3 towers reach ~4.4). */
const FIT_HEIGHT = 5;
/** Deepest zoom (touch pinch, and the wheel ladder's ceiling); tuned for
 * reliable single-tile taps on phones. */
export const MAX_ZOOM = 4;
/** One wheel step multiplies the zoom by exactly this (camera-controls D2). */
export const ZOOM_STEP_FACTOR = 1.1;
/** Highest ladder rung that stays within MAX_ZOOM (1.1^14 ≈ 3.80). */
export const MAX_WHEEL_STEPS = Math.floor(Math.log(MAX_ZOOM) / Math.log(ZOOM_STEP_FACTOR));

export class IsometricCamera {
  readonly camera: THREE.OrthographicCamera;
  private readonly board: { width: number; height: number };
  /** 1 = whole board framed. */
  private zoomLevel = 1;
  /** View-centre offset in camera space, clamped inside the fit extents. */
  private panX = 0;
  private panY = 0;
  /** Fit extents at zoom 1, refreshed by frame(). */
  private baseHalfW = 1;
  private baseHalfH = 1;

  constructor(aspect: number, board: { width: number; height: number }) {
    this.board = board;
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
    const centre = new THREE.Vector3(board.width / 2, 0, board.height / 2);
    this.camera.position
      .set(Math.sin(YAW) * Math.cos(PITCH), Math.sin(PITCH), Math.cos(YAW) * Math.cos(PITCH))
      .multiplyScalar(DIST)
      .add(centre);
    this.camera.lookAt(centre);
    this.camera.updateMatrixWorld(true);
    this.frame(aspect);
  }

  get zoom(): number {
    return this.zoomLevel;
  }

  /**
   * Re-fit the frustum to the viewport: project the board's bounding box into
   * camera space and take the tightest box that holds it at this aspect —
   * then divide by the zoom level and shift by the (re-clamped) pan, so a
   * resize while zoomed preserves the view centre.
   */
  frame(aspect: number): void {
    // matrixWorldInverse is only refreshed during render; derive it here.
    const toCamera = this.camera.matrixWorldInverse.copy(this.camera.matrixWorld).invert();
    let maxX = 0;
    let maxY = 0;
    const corner = new THREE.Vector3();
    for (const x of [0, this.board.width]) {
      for (const y of [0, FIT_HEIGHT]) {
        for (const z of [0, this.board.height]) {
          corner.set(x, y, z).applyMatrix4(toCamera);
          maxX = Math.max(maxX, Math.abs(corner.x));
          maxY = Math.max(maxY, Math.abs(corner.y));
        }
      }
    }
    let halfW = maxX + MARGIN;
    let halfH = maxY + MARGIN;
    if (halfW / halfH > aspect) halfH = halfW / aspect;
    else halfW = halfH * aspect;
    this.baseHalfW = halfW;
    this.baseHalfH = halfH;
    this.apply();
  }

  /**
   * Pinch step: multiply the zoom by `scale`, keeping the world point at the
   * given NDC position (gesture midpoint) fixed on screen. Render-side only.
   */
  pinch(scale: number, ndcX: number, ndcY: number): void {
    this.setZoomAnchored(Math.min(MAX_ZOOM, Math.max(1, this.zoomLevel * scale)), ndcX, ndcY);
  }

  /**
   * Wheel step: move one rung along the exact 1.1^n ladder, keeping the world
   * point at the cursor's NDC position fixed on screen. The zoom is always
   * recomputed as Math.pow of an integer rung — never by multiplying the
   * previous zoom — so equal step counts give bit-identical framing and rung 0
   * is exactly the fit. A pinch may leave the zoom between rungs; the round()
   * snaps to the nearest rung before stepping. A step already at a limit
   * leaves zoom and pan untouched.
   */
  stepZoom(direction: 1 | -1, ndcX: number, ndcY: number): void {
    const rung = Math.min(
      MAX_WHEEL_STEPS,
      Math.max(0, Math.round(Math.log(this.zoomLevel) / Math.log(ZOOM_STEP_FACTOR))),
    );
    const next = Math.min(MAX_WHEEL_STEPS, Math.max(0, rung + direction));
    const target = Math.pow(ZOOM_STEP_FACTOR, next);
    // A step must actually move in its own direction: at a limit (or when a
    // pinch left the zoom past the top rung) it is a no-op — no pan drift.
    if (direction > 0 ? target <= this.zoomLevel : target >= this.zoomLevel) return;
    this.setZoomAnchored(target, ndcX, ndcY);
  }

  /** Set the zoom, keeping the world point at NDC (nx, ny) fixed on screen. */
  private setZoomAnchored(zoom: number, ndcX: number, ndcY: number): void {
    const before = this.viewHalves();
    this.zoomLevel = zoom;
    const after = this.viewHalves();
    // The point at NDC (nx, ny) sits at camera-space (pan + n × half); keep
    // it stationary while the half-extents shrink or grow.
    this.panX += ndcX * (before.halfW - after.halfW);
    this.panY += ndcY * (before.halfH - after.halfH);
    this.apply();
  }

  /** Pan by a screen-pixel delta (drag): the world follows the finger. */
  panByPixels(dxPx: number, dyPx: number, viewportWidthPx: number, viewportHeightPx: number): void {
    if (viewportWidthPx <= 0 || viewportHeightPx <= 0) return;
    const { halfW, halfH } = this.viewHalves();
    this.panX -= (dxPx / viewportWidthPx) * 2 * halfW;
    this.panY += (dyPx / viewportHeightPx) * 2 * halfH;
    this.apply();
  }

  private viewHalves(): { halfW: number; halfH: number } {
    return { halfW: this.baseHalfW / this.zoomLevel, halfH: this.baseHalfH / this.zoomLevel };
  }

  /** Clamp the pan into the fit extents and write the projection. */
  private apply(): void {
    const { halfW, halfH } = this.viewHalves();
    const maxPanX = this.baseHalfW - halfW;
    const maxPanY = this.baseHalfH - halfH;
    this.panX = Math.min(maxPanX, Math.max(-maxPanX, this.panX));
    this.panY = Math.min(maxPanY, Math.max(-maxPanY, this.panY));
    this.camera.left = -halfW + this.panX;
    this.camera.right = halfW + this.panX;
    this.camera.top = halfH + this.panY;
    this.camera.bottom = -halfH + this.panY;
    this.camera.updateProjectionMatrix();
  }
}
