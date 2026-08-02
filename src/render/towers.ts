// Structure rendering: walls, modular towers, removal countdowns
// See ARCHITECTURE.md §8
//
// Responsibilities:
//   - Kit models are natively 1×1 — every structure sits on its single tile
//   - Modular tower composition: one kit segment per upgrade level per
//     archetype (square bases + weapon heads; round + crystals for slow),
//     so level reads as height (tower-upgrades spec)
//   - Weapon head yaws toward the tower's current target (cosmetic)
//   - Removal countdown readout floating above a structure being removed

import * as THREE from 'three';
import { ARCHETYPES, type TowerArchetype } from '../data/schema';
import { TICK_HZ, TILE } from '../sim/fixed';
import type { Enemy, Structure } from '../sim/types';
import type { Assets } from './assets';
import { GROUND_TOP_Y } from './renderer';

const COUNTDOWN_COLOR = '#ff6b5e';

/** Walls are kit masonry from the tower-base family (render-pipeline spec). */
const WALL_MODEL = 'tower-square-bottom-a';

/** Base and per-level middle segments, plus the weapon head, per archetype. */
const KIT: Record<TowerArchetype, { base: string; middle: string; head: string }> = {
  rapid: { base: 'tower-square-bottom-a', middle: 'tower-square-middle-a', head: 'weapon-turret' },
  sniper: { base: 'tower-square-bottom-a', middle: 'tower-square-middle-b', head: 'weapon-ballista' },
  area: { base: 'tower-square-bottom-a', middle: 'tower-square-middle-a', head: 'weapon-catapult' },
  slow: { base: 'tower-round-bottom-a', middle: 'tower-round-middle-a', head: 'tower-round-crystals' },
};

/** A text sprite backed by a small canvas; cheap enough per structure. */
class CountdownLabel {
  readonly sprite: THREE.Sprite;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly texture: THREE.CanvasTexture;
  private lastText = '';

  constructor() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 64;
    this.ctx = canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(canvas);
    this.sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: this.texture, depthTest: false, transparent: true }),
    );
    this.sprite.scale.set(1.6, 0.8, 1);
  }

  set(text: string): void {
    if (text === this.lastText) return;
    this.lastText = text;
    const { ctx } = this;
    ctx.clearRect(0, 0, 128, 64);
    ctx.font = 'bold 40px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = COUNTDOWN_COLOR;
    ctx.fillText(text, 64, 32);
    this.texture.needsUpdate = true;
  }

  dispose(): void {
    this.texture.dispose();
    this.sprite.material.dispose();
  }
}

/** Stack model parts on top of each other, returning the total height. */
function stack(group: THREE.Group, parts: THREE.Object3D[]): number {
  let y = 0;
  const box = new THREE.Box3();
  for (const part of parts) {
    part.position.y = y;
    group.add(part);
    box.setFromObject(part);
    y += Math.max(box.max.y - box.min.y, 0);
  }
  return y;
}

export class StructureRenderer {
  private readonly scene: THREE.Scene;
  private readonly assets: Assets;
  private readonly meshes = new Map<number, THREE.Group>();
  private readonly labels = new Map<number, CountdownLabel>();
  private readonly heights = new Map<number, number>();
  /** The weapon head per tower, for the cosmetic target yaw. */
  private readonly heads = new Map<number, THREE.Object3D>();
  /** The level each mesh was built for; an upgrade triggers a rebuild. */
  private readonly builtLevels = new Map<number, number>();

  constructor(scene: THREE.Scene, assets: Assets) {
    this.scene = scene;
    this.assets = assets;
  }

  private build(s: Structure): THREE.Group {
    const group = new THREE.Group();
    if (s.kind === 'wall') {
      const height = stack(group, [this.assets.instance(WALL_MODEL)]);
      this.heights.set(s.id, height);
    } else {
      // One middle segment per level above 1: level legibility is height.
      const kit = KIT[ARCHETYPES[s.archetypeId]!];
      const parts: THREE.Object3D[] = [this.assets.instance(kit.base)];
      for (let l = 1; l < s.level; l++) parts.push(this.assets.instance(kit.middle));
      const head = this.assets.instance(kit.head);
      parts.push(head);
      const height = stack(group, parts);
      this.heights.set(s.id, height);
      this.heads.set(s.id, head);
    }
    group.position.set(s.tx + 0.5, GROUND_TOP_Y, s.ty + 0.5);
    return group;
  }

  private dropMesh(id: number): void {
    const mesh = this.meshes.get(id);
    if (mesh) this.scene.remove(mesh);
    this.meshes.delete(id);
    this.heights.delete(id);
    this.heads.delete(id);
    this.builtLevels.delete(id);
  }

  /**
   * Reflect sim structures into the scene; tick drives countdown labels and
   * `targetFor` supplies each tower's current target for the head yaw —
   * read-only sim state, cosmetic result.
   */
  sync(
    structures: readonly Structure[],
    tick: number,
    targetFor: (s: Structure) => Enemy | null,
  ): void {
    const live = new Set<number>();
    for (const s of structures) {
      live.add(s.id);
      // An upgrade changes the composition: rebuild the mesh at the new level.
      if (this.meshes.has(s.id) && this.builtLevels.get(s.id) !== s.level) {
        this.dropMesh(s.id);
      }
      let mesh = this.meshes.get(s.id);
      if (!mesh) {
        mesh = this.build(s);
        this.meshes.set(s.id, mesh);
        this.builtLevels.set(s.id, s.level);
        this.scene.add(mesh);
      }

      // Cosmetic head yaw toward the current target; holds the last bearing
      // while no target is in range.
      const head = this.heads.get(s.id);
      if (head) {
        const target = targetFor(s);
        if (target) {
          const dx = target.pos.x / TILE - (s.tx + 0.5);
          const dz = target.pos.y / TILE - (s.ty + 0.5);
          head.rotation.y = Math.atan2(dx, dz);
        }
      }

      // Removal countdown (build-ui spec): remaining seconds, one decimal.
      if (s.removalCompleteTick >= 0) {
        let label = this.labels.get(s.id);
        if (!label) {
          label = new CountdownLabel();
          const height = this.heights.get(s.id) ?? 1;
          label.sprite.position.set(mesh.position.x, mesh.position.y + height + 0.6, mesh.position.z);
          this.labels.set(s.id, label);
          this.scene.add(label.sprite);
        }
        const seconds = Math.max(0, s.removalCompleteTick - tick) / TICK_HZ;
        label.set(seconds.toFixed(1));
      }
    }
    for (const id of this.meshes.keys()) {
      if (!live.has(id)) this.dropMesh(id);
    }
    for (const [id, label] of this.labels) {
      if (!live.has(id)) {
        this.scene.remove(label.sprite);
        label.dispose();
        this.labels.delete(id);
      }
    }
  }
}
