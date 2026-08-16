// Enemy meshes, hover, status icons, gold sacks
// See ARCHITECTURE.md §8
//
// Responsibilities:
//   - Model and scale per enemy type (render-side mapping only)
//   - Procedural hover bob and yaw spin, driven by frame time
//   - Carried-gold and slowed indicators above enemies (build-ui spec),
//     driven read-only from sim state
//   - Health bar above every damaged enemy (build-ui spec, enemy-health-bar
//     design D2–D4): green remaining over a red track, revealed from the
//     right; max hp is the type's hp stat (design D1)
//   - Gold-sack meshes on the ground

import * as THREE from 'three';
import { TILE } from '../sim/fixed';
import type { Enemy, GoldSack } from '../sim/types';
import type { Assets } from './assets';
import { GROUND_TOP_Y } from './renderer';

/**
 * Model + scale per enemy type key (ARCHITECTURE.md §8 model mapping);
 * unknown keys fall back to the runner's.
 */
const TYPE_MODELS: Record<string, { model: string; scale: number }> = {
  runner: { model: 'enemy-ufo-b', scale: 0.7 },
  swarm: { model: 'enemy-ufo-c', scale: 0.6 },
  tank: { model: 'enemy-ufo-a', scale: 0.8 },
  brute: { model: 'enemy-ufo-d', scale: 0.8 },
};
const FALLBACK = TYPE_MODELS['runner']!;
const HOVER_BASE = 0.35;
const BOB_AMPLITUDE = 0.06;
const GOLD_COLOR = 0xffc93c;
const SLOW_COLOR = 0x6fd9ff;
/** Health bar (design D4): sits above the model, below the gold/slowed icons at +0.75. */
const BAR_LIFT = 0.55;
/** Bar width per unit of model render scale — a 0.8 tank reads ~⅓ wider than a 0.6 swarm. */
const BAR_WIDTH_PER_SCALE = 0.9;
const BAR_HEIGHT = 0.11;
const BAR_TRACK_COLOR = 0xd23a30;
const BAR_FILL_COLOR = 0x37d67a;
/** Above every world object: bars ignore depth and paint last (design D4). */
const BAR_RENDER_ORDER = 1000;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Remaining-hp fraction for the health bar, clamped to [0, 1]; a non-positive
 * max yields 0 rather than NaN/Infinity (design D5).
 */
export function hpFraction(hp: number, maxHp: number): number {
  if (maxHp <= 0) return 0;
  return Math.min(1, Math.max(0, hp / maxHp));
}

// Grounding shadow (render-pipeline spec): a translucent disc pinned to the
// terrain under the hover-bob, so the occupied tile reads at a glance.
const SHADOW_BASE_RADIUS = 0.32;
const SHADOW_LIFT = 0.02; // above the ground plane, below everything else
const shadowMaterial = new THREE.MeshBasicMaterial({
  color: 0x000000,
  transparent: true,
  opacity: 0.35,
  depthWrite: false,
});

const goldMaterial = new THREE.MeshLambertMaterial({
  color: GOLD_COLOR,
  emissive: 0x8a6b00,
});
const slowMaterial = new THREE.MeshLambertMaterial({
  color: SLOW_COLOR,
  emissive: 0x1a5c78,
});

// Health bar sprites: unlit so the two colours stay flat under the scene light,
// depth-free so a wall canyon or a tower never hides them (design D4).
const barTrackMaterial = new THREE.SpriteMaterial({
  color: BAR_TRACK_COLOR,
  depthTest: false,
  depthWrite: false,
});
const barFillMaterial = new THREE.SpriteMaterial({
  color: BAR_FILL_COLOR,
  depthTest: false,
  depthWrite: false,
});

/** The two sprites of one enemy's bar, both left-anchored at the same point. */
interface HealthBar {
  track: THREE.Sprite;
  fill: THREE.Sprite;
  /** Full bar width in world units, from the enemy's render scale. */
  width: number;
}

export class EnemyRenderer {
  private readonly scene: THREE.Scene;
  private readonly assets: Assets;
  /** typeId → type key, in the sim's canonical order. */
  private readonly typeKeys: readonly string[];
  /**
   * typeId → the type's hp stat, which is every enemy's max hp (design D1):
   * no spawn path scales hp, so the bar's max is a lookup, not sim state.
   */
  private readonly maxHp: readonly number[];
  /** The fixed isometric camera; its right vector centres the bars on screen. */
  private readonly camera: THREE.Camera;
  private readonly meshes = new Map<number, THREE.Group>();
  private readonly shadows = new Map<number, THREE.Mesh>();
  private readonly indicators = new Map<number, THREE.Mesh>();
  private readonly slowIcons = new Map<number, THREE.Mesh>();
  /** Created lazily on the first frame an enemy is seen below max hp (design D3). */
  private readonly bars = new Map<number, HealthBar>();
  private readonly viewRight = new THREE.Vector3();
  // The gold indicator is a small octahedron floating above the model; the
  // slowed icon a flattened cyan one beside it.
  private readonly indicatorGeometry = new THREE.OctahedronGeometry(0.16);
  private readonly slowGeometry = new THREE.OctahedronGeometry(0.14, 0);
  private readonly shadowGeometry = new THREE.CircleGeometry(SHADOW_BASE_RADIUS, 24);

  constructor(
    scene: THREE.Scene,
    assets: Assets,
    typeKeys: readonly string[],
    maxHp: readonly number[],
    camera: THREE.Camera,
  ) {
    this.scene = scene;
    this.assets = assets;
    this.typeKeys = typeKeys;
    this.maxHp = maxHp;
    this.camera = camera;
  }

  /**
   * Reflect sim enemies into the scene. Position interpolates prevPos→pos by
   * the accumulator alpha; bob and spin are frame-time cosmetics; `tick`
   * drives the slowed icon from `slowUntil`, read-only.
   */
  sync(enemies: readonly Enemy[], alpha: number, timeMs: number, tick: number): void {
    // Screen-right in world space, so a bar's left anchor sits half a width
    // left of the enemy on screen (the camera never rotates, but this is one
    // vector op per frame, so derive it rather than assume it).
    this.viewRight.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
    const live = new Set<number>();
    for (const e of enemies) {
      live.add(e.id);
      const def = TYPE_MODELS[this.typeKeys[e.typeId] ?? ''] ?? FALLBACK;
      let mesh = this.meshes.get(e.id);
      if (!mesh) {
        mesh = this.assets.instance(def.model);
        mesh.scale.setScalar(def.scale);
        this.meshes.set(e.id, mesh);
        this.scene.add(mesh);
        const shadow = new THREE.Mesh(this.shadowGeometry, shadowMaterial);
        shadow.rotation.x = -Math.PI / 2;
        shadow.scale.setScalar(def.scale);
        this.shadows.set(e.id, shadow);
        this.scene.add(shadow);
      }
      // Desync phases per enemy so a swarm doesn't bob in unison.
      const phase = e.id * 1.7;
      const x = lerp(e.prevPos.x, e.pos.x, alpha) / TILE;
      const z = lerp(e.prevPos.y, e.pos.y, alpha) / TILE;
      const y = GROUND_TOP_Y + HOVER_BASE + Math.sin(timeMs / 400 + phase) * BOB_AMPLITUDE;
      mesh.position.set(x, y, z);
      mesh.rotation.y = timeMs / 900 + phase;
      // The shadow tracks board position only — never the bob height.
      this.shadows.get(e.id)!.position.set(x, GROUND_TOP_Y + SHADOW_LIFT, z);

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

      // Slowed indicator: visible while the slow is unexpired.
      let slowIcon = this.slowIcons.get(e.id);
      if (tick < e.slowUntil) {
        if (!slowIcon) {
          slowIcon = new THREE.Mesh(this.slowGeometry, slowMaterial);
          slowIcon.scale.set(1, 0.5, 1); // flattened: reads as distinct from gold
          this.slowIcons.set(e.id, slowIcon);
          this.scene.add(slowIcon);
        }
        slowIcon.visible = true;
        const dodge = e.carriedMg > 0 ? 0.24 : 0; // sit beside a gold indicator
        slowIcon.position.set(x + dodge, y + 0.75, z - dodge);
        slowIcon.rotation.y = -timeMs / 350;
      } else if (slowIcon) {
        slowIcon.visible = false;
      }

      // Health bar: only once damaged (design D3). Both sprites are anchored
      // at their left edge on the same point, so scaling the fill by the
      // remaining fraction reveals the red track from the right.
      let bar = this.bars.get(e.id);
      const maxHp = this.maxHp[e.typeId] ?? 0;
      if (e.hp < maxHp) {
        if (!bar) {
          bar = this.buildBar(BAR_WIDTH_PER_SCALE * def.scale);
          this.bars.set(e.id, bar);
          this.scene.add(bar.track, bar.fill);
        }
        bar.track.visible = true;
        bar.fill.visible = true;
        const bx = x - this.viewRight.x * (bar.width / 2);
        const by = y + BAR_LIFT - this.viewRight.y * (bar.width / 2);
        const bz = z - this.viewRight.z * (bar.width / 2);
        bar.track.position.set(bx, by, bz);
        bar.fill.position.set(bx, by, bz);
        bar.fill.scale.x = bar.width * hpFraction(e.hp, maxHp);
      } else if (bar) {
        bar.track.visible = false;
        bar.fill.visible = false;
      }
    }
    for (const [id, mesh] of this.meshes) {
      if (!live.has(id)) {
        this.scene.remove(mesh);
        this.meshes.delete(id);
        const shadow = this.shadows.get(id);
        if (shadow) {
          this.scene.remove(shadow);
          this.shadows.delete(id);
        }
        const indicator = this.indicators.get(id);
        if (indicator) {
          this.scene.remove(indicator);
          this.indicators.delete(id);
        }
        const slowIcon = this.slowIcons.get(id);
        if (slowIcon) {
          this.scene.remove(slowIcon);
          this.slowIcons.delete(id);
        }
        const bar = this.bars.get(id);
        if (bar) {
          this.scene.remove(bar.track, bar.fill);
          this.bars.delete(id);
        }
      }
    }
  }

  /** One bar: full-width red track under a left-anchored green fill (design D2). */
  private buildBar(width: number): HealthBar {
    const track = new THREE.Sprite(barTrackMaterial);
    track.center.set(0, 0.5);
    track.scale.set(width, BAR_HEIGHT, 1);
    track.renderOrder = BAR_RENDER_ORDER;
    const fill = new THREE.Sprite(barFillMaterial);
    fill.center.set(0, 0.5);
    fill.scale.set(width, BAR_HEIGHT, 1);
    fill.renderOrder = BAR_RENDER_ORDER + 1; // always over the track
    return { track, fill, width };
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
