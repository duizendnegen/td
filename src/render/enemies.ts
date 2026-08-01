// Enemy meshes, hover, status icons, gold sacks
// See ARCHITECTURE.md §8
//
// Responsibilities:
//   - Procedural hover bob and yaw spin, driven by frame time
//   - Carried-gold indicator above carriers (theft-economy spec)
//   - Gold-sack meshes on the ground

import * as THREE from 'three';
import { TILE } from '../sim/fixed';
import type { Enemy, GoldSack } from '../sim/types';
import type { Assets } from './assets';
import { GROUND_TOP_Y } from './renderer';

// The single spawnable type is the runner (ARCHITECTURE.md §8 model mapping).
const MODEL = 'enemy-ufo-b';
const SCALE = 0.7;
const HOVER_BASE = 0.35;
const BOB_AMPLITUDE = 0.06;
const GOLD_COLOR = 0xffc93c;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

const goldMaterial = new THREE.MeshLambertMaterial({
  color: GOLD_COLOR,
  emissive: 0x8a6b00,
});

export class EnemyRenderer {
  private readonly scene: THREE.Scene;
  private readonly assets: Assets;
  private readonly meshes = new Map<number, THREE.Group>();
  private readonly indicators = new Map<number, THREE.Mesh>();
  // The indicator is a small gold octahedron floating above the model.
  private readonly indicatorGeometry = new THREE.OctahedronGeometry(0.16);

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
      const x = lerp(e.prevPos.x, e.pos.x, alpha) / TILE;
      const z = lerp(e.prevPos.y, e.pos.y, alpha) / TILE;
      const y = GROUND_TOP_Y + HOVER_BASE + Math.sin(timeMs / 400 + phase) * BOB_AMPLITUDE;
      mesh.position.set(x, y, z);
      mesh.rotation.y = timeMs / 900 + phase;

      // Carried-gold indicator: visible whenever the enemy holds any gold.
      let indicator = this.indicators.get(e.id);
      if (e.carriedMg > 0) {
        if (!indicator) {
          indicator = new THREE.Mesh(this.indicatorGeometry, goldMaterial);
          this.indicators.set(e.id, indicator);
          this.scene.add(indicator);
        }
        indicator.visible = true;
        indicator.position.set(x, y + 0.75, z);
        indicator.rotation.y = timeMs / 500;
      } else if (indicator) {
        indicator.visible = false;
      }
    }
    for (const [id, mesh] of this.meshes) {
      if (!live.has(id)) {
        this.scene.remove(mesh);
        this.meshes.delete(id);
        const indicator = this.indicators.get(id);
        if (indicator) {
          this.scene.remove(indicator);
          this.indicators.delete(id);
        }
      }
    }
  }
}

/** Gold sacks on the ground; state-driven, with a frame-time sparkle spin. */
export class SackRenderer {
  private readonly scene: THREE.Scene;
  private readonly meshes = new Map<number, THREE.Mesh>();
  private readonly geometry = new THREE.OctahedronGeometry(0.24);

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  sync(sacks: readonly GoldSack[], timeMs: number): void {
    const live = new Set<number>();
    for (const s of sacks) {
      live.add(s.id);
      let mesh = this.meshes.get(s.id);
      if (!mesh) {
        mesh = new THREE.Mesh(this.geometry, goldMaterial);
        mesh.position.set(s.tx + 0.5, GROUND_TOP_Y + 0.22, s.ty + 0.5);
        this.meshes.set(s.id, mesh);
        this.scene.add(mesh);
      }
      // Sparkle: slow spin plus a gentle pulse scaled by the sack's value.
      mesh.rotation.y = timeMs / 700 + s.id;
      const pulse = 1 + 0.08 * Math.sin(timeMs / 250 + s.id);
      mesh.scale.setScalar(Math.min(1.6, 0.7 + s.amountMg / 100_000) * pulse);
    }
    for (const [id, mesh] of this.meshes) {
      if (!live.has(id)) {
        this.scene.remove(mesh);
        this.meshes.delete(id);
      }
    }
  }
}
