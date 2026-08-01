// Enemy meshes, blob shadows, status icons
// See ARCHITECTURE.md §8
//
// Responsibilities:
//   - Procedural tilt wobble and yaw spin, driven by frame time
//   - Blob shadow under each enemy, marking its ground contact point
//   - Status icons: carrying gold, slowed (Phase 2+)

import * as THREE from 'three';
import { TILE } from '../sim/fixed';
import type { Enemy } from '../sim/types';
import type { Assets } from './assets';
import { GROUND_TOP_Y } from './renderer';

// Phase 1's single type is the runner (ARCHITECTURE.md §8 model mapping).
const MODEL = 'enemy-ufo-b';
const SCALE = 0.7;
// Under the ~35° ortho pitch, elevation h reads as ~0.82·h of up-screen drift,
// so enemies must hug the floor for their tile to be legible. 0.05 clears the
// debug-decal plane (GROUND_TOP_Y + 0.03) while keeping the drift under 5% of
// a tile.
const REST_HEIGHT = 0.05;
// Radians. Small enough that the hull rim (radius ~0.35) never dips near the
// ground or rises into meaningful projected offset.
const TILT_AMPLITUDE = 0.05;

// Blob shadow: sits below the debug-decal plane (+0.03) so overlays stay
// legible; radius hugs the hull (half-width 0.35 at SCALE).
const SHADOW_Y = GROUND_TOP_Y + 0.02;
const SHADOW_RADIUS = 0.3;
const SHADOW_OPACITY = 0.3;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

interface EnemyVisual {
  readonly mesh: THREE.Group;
  readonly shadow: THREE.Mesh;
}

export class EnemyRenderer {
  private readonly scene: THREE.Scene;
  private readonly assets: Assets;
  private readonly visuals = new Map<number, EnemyVisual>();
  // One geometry and material shared by every blob shadow.
  private readonly shadowGeometry = new THREE.CircleGeometry(SHADOW_RADIUS, 24);
  private readonly shadowMaterial = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: SHADOW_OPACITY,
    depthWrite: false,
  });

  constructor(scene: THREE.Scene, assets: Assets) {
    this.scene = scene;
    this.assets = assets;
  }

  /**
   * Reflect sim enemies into the scene. Position interpolates prevPos→pos by
   * the accumulator alpha; wobble and spin are frame-time cosmetics that never
   * touch sim state.
   */
  sync(enemies: readonly Enemy[], alpha: number, timeMs: number): void {
    const live = new Set<number>();
    for (const e of enemies) {
      live.add(e.id);
      let visual = this.visuals.get(e.id);
      if (!visual) {
        const mesh = this.assets.instance(MODEL);
        mesh.scale.setScalar(SCALE);
        const shadow = new THREE.Mesh(this.shadowGeometry, this.shadowMaterial);
        shadow.rotation.x = -Math.PI / 2;
        visual = { mesh, shadow };
        this.visuals.set(e.id, visual);
        this.scene.add(mesh, shadow);
      }
      const x = lerp(e.prevPos.x, e.pos.x, alpha) / TILE;
      const z = lerp(e.prevPos.y, e.pos.y, alpha) / TILE;
      // Desync phases per enemy so a swarm doesn't wobble in unison.
      const phase = e.id * 1.7;
      visual.mesh.position.set(x, GROUND_TOP_Y + REST_HEIGHT, z);
      // Mismatched wobble periods keep the tilt from tracing a repetitive
      // circle; yaw spin carries the "alive" read a walk cycle would.
      visual.mesh.rotation.set(
        Math.sin(timeMs / 530 + phase) * TILT_AMPLITUDE,
        timeMs / 900 + phase,
        Math.sin(timeMs / 710 + phase * 1.3) * TILT_AMPLITUDE,
      );
      visual.shadow.position.set(x, SHADOW_Y, z);
    }
    for (const [id, visual] of this.visuals) {
      if (!live.has(id)) {
        this.scene.remove(visual.mesh, visual.shadow);
        this.visuals.delete(id);
      }
    }
  }
}
