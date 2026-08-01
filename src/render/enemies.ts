// Enemy meshes, hover, status icons
// See ARCHITECTURE.md §8
//
// Responsibilities:
//   - Procedural hover bob and yaw spin, driven by frame time
//   - Status icons: carrying gold, slowed (Phase 2+)

import * as THREE from 'three';
import { TILE } from '../sim/fixed';
import type { Enemy } from '../sim/types';
import type { Assets } from './assets';
import { GROUND_TOP_Y } from './renderer';

// Phase 1's single type is the runner (ARCHITECTURE.md §8 model mapping).
const MODEL = 'enemy-ufo-b';
const SCALE = 0.7;
const HOVER_BASE = 0.35;
const BOB_AMPLITUDE = 0.06;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export class EnemyRenderer {
  private readonly scene: THREE.Scene;
  private readonly assets: Assets;
  private readonly meshes = new Map<number, THREE.Group>();

  constructor(scene: THREE.Scene, assets: Assets) {
    this.scene = scene;
    this.assets = assets;
  }

  /**
   * Reflect sim enemies into the scene. Position interpolates prevPos→pos by
   * the accumulator alpha; bob and spin are frame-time cosmetics that never
   * touch sim state.
   */
  sync(enemies: readonly Enemy[], alpha: number, timeMs: number): void {
    const live = new Set<number>();
    for (const e of enemies) {
      live.add(e.id);
      let mesh = this.meshes.get(e.id);
      if (!mesh) {
        mesh = this.assets.instance(MODEL);
        mesh.scale.setScalar(SCALE);
        this.meshes.set(e.id, mesh);
        this.scene.add(mesh);
      }
      // Desync phases per enemy so a swarm doesn't bob in unison.
      const phase = e.id * 1.7;
      mesh.position.set(
        lerp(e.prevPos.x, e.pos.x, alpha) / TILE,
        GROUND_TOP_Y + HOVER_BASE + Math.sin(timeMs / 400 + phase) * BOB_AMPLITUDE,
        lerp(e.prevPos.y, e.pos.y, alpha) / TILE,
      );
      mesh.rotation.y = timeMs / 900 + phase;
    }
    for (const [id, mesh] of this.meshes) {
      if (!live.has(id)) {
        this.scene.remove(mesh);
        this.meshes.delete(id);
      }
    }
  }
}
