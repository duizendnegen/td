// Ortho architect <-> perspective commander
// See ARCHITECTURE.md §8
//
// Responsibilities:
//   - Architect: OrthographicCamera, pitch 55-60deg, whole board framed
//   - Commander: PerspectiveCamera, fov ~45, pitch 25-35deg, orbitable yaw
//   - ~400ms eased transition on position and target

import * as THREE from 'three';

const ARCHITECT_PITCH = (57 * Math.PI) / 180;
const ARCHITECT_DIST = 40;
const COMMANDER_PITCH = (30 * Math.PI) / 180;
const COMMANDER_DIST = 15;
const COMMANDER_FOV = 45;
const TRANSITION_MS = 400;

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

export type ViewName = 'architect' | 'commander';

export class CameraRig {
  private readonly architect: THREE.OrthographicCamera;
  private readonly commander: THREE.PerspectiveCamera;
  private readonly boardCentre: THREE.Vector3;
  private readonly treasury: THREE.Vector3;

  private view: ViewName = 'architect';
  private commanderYaw = Math.PI / 2; // from the east, behind the treasury, looking into the maze
  private transitionMs = TRANSITION_MS; // elapsed; >= TRANSITION_MS means idle
  private readonly fromEye = new THREE.Vector3();
  private readonly fromTarget = new THREE.Vector3();
  private readonly eye = new THREE.Vector3();
  private readonly target = new THREE.Vector3();

  constructor(
    aspect: number,
    board: { width: number; height: number },
    treasury: { x: number; z: number },
  ) {
    this.boardCentre = new THREE.Vector3(board.width / 2, 0, board.height / 2);
    this.treasury = new THREE.Vector3(treasury.x, 0, treasury.z);
    this.architect = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
    this.commander = new THREE.PerspectiveCamera(COMMANDER_FOV, aspect, 0.1, 200);
    this.frame(aspect);
    this.homeEye(this.view, this.eye);
    this.homeTarget(this.view, this.target);
    this.apply();
  }

  get activeView(): ViewName {
    return this.view;
  }

  get activeCamera(): THREE.Camera {
    return this.view === 'architect' ? this.architect : this.commander;
  }

  /** Re-fit both frustums to a new canvas aspect. */
  frame(aspect: number): void {
    // Whole board plus margin must fit at the architect pitch.
    const needHalfW = 16.5;
    const needHalfH = 11 * Math.sin(ARCHITECT_PITCH) + 2.5;
    const halfH = Math.max(needHalfH, needHalfW / aspect);
    const halfW = halfH * aspect;
    this.architect.left = -halfW;
    this.architect.right = halfW;
    this.architect.top = halfH;
    this.architect.bottom = -halfH;
    this.architect.updateProjectionMatrix();
    this.commander.aspect = aspect;
    this.commander.updateProjectionMatrix();
  }

  /** Swap views. Safe mid-transition: eases onward from wherever the camera is. */
  toggle(): void {
    this.fromEye.copy(this.eye);
    this.fromTarget.copy(this.target);
    this.view = this.view === 'architect' ? 'commander' : 'architect';
    this.transitionMs = 0;
  }

  /** Orbit the commander view's yaw (no-op in architect view). */
  orbitBy(deltaYaw: number): void {
    this.commanderYaw += deltaYaw;
  }

  update(dtMs: number): void {
    const homeEye = this.homeEye(this.view, new THREE.Vector3());
    const homeTarget = this.homeTarget(this.view, new THREE.Vector3());
    if (this.transitionMs < TRANSITION_MS) {
      this.transitionMs += dtMs;
      const t = easeInOutCubic(Math.min(this.transitionMs / TRANSITION_MS, 1));
      this.eye.lerpVectors(this.fromEye, homeEye, t);
      this.target.lerpVectors(this.fromTarget, homeTarget, t);
    } else {
      this.eye.copy(homeEye);
      this.target.copy(homeTarget);
    }
    this.apply();
  }

  private homeEye(view: ViewName, out: THREE.Vector3): THREE.Vector3 {
    if (view === 'architect') {
      // Fixed yaw: viewed from the south so the board reads like the level file.
      return out
        .set(0, Math.sin(ARCHITECT_PITCH), Math.cos(ARCHITECT_PITCH))
        .multiplyScalar(ARCHITECT_DIST)
        .add(this.boardCentre);
    }
    return out
      .set(
        Math.sin(this.commanderYaw) * Math.cos(COMMANDER_PITCH),
        Math.sin(COMMANDER_PITCH),
        Math.cos(this.commanderYaw) * Math.cos(COMMANDER_PITCH),
      )
      .multiplyScalar(COMMANDER_DIST)
      .add(this.treasury);
  }

  private homeTarget(view: ViewName, out: THREE.Vector3): THREE.Vector3 {
    return out.copy(view === 'architect' ? this.boardCentre : this.treasury);
  }

  private apply(): void {
    const camera = this.activeCamera;
    camera.position.copy(this.eye);
    camera.lookAt(this.target);
  }
}
