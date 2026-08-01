// The isometric camera
// See ARCHITECTURE.md §8 and design D-P1-7
//
// Responsibilities:
//   - One fixed OrthographicCamera: 45° yaw, ~35° pitch (true isometric),
//     whole board framed, re-fit on resize
//   - Orthographic so a 1-tile gap measures identically anywhere on screen;
//     the low pitch is what lets height read by silhouette

import * as THREE from 'three';

const YAW = (45 * Math.PI) / 180; // viewed from the south-east
const PITCH = Math.atan(1 / Math.SQRT2); // ≈ 35.26°, the true isometric pitch
const DIST = 60;
const MARGIN = 1.2;
/** Tallest thing the frustum must keep on screen (Phase-3 towers reach ~4.4). */
const FIT_HEIGHT = 5;

export class IsometricCamera {
  readonly camera: THREE.OrthographicCamera;
  private readonly board: { width: number; height: number };

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

  /**
   * Re-fit the frustum to the viewport: project the board's bounding box into
   * camera space and take the tightest box that holds it at this aspect.
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
    this.camera.left = -halfW;
    this.camera.right = halfW;
    this.camera.top = halfH;
    this.camera.bottom = -halfH;
    this.camera.updateProjectionMatrix();
  }
}
