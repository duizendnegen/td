// Structure rendering: walls, modular towers, removal countdowns
// See ARCHITECTURE.md §8
//
// Responsibilities:
//   - Kit tower models scaled 2x to fill the 2x2 footprint
//   - Placeholder wall block on 1x1 footprints
//   - Removal countdown readout floating above a structure being removed

import * as THREE from 'three';
import { TICK_HZ } from '../sim/fixed';
import type { Structure } from '../sim/types';
import type { Assets } from './assets';
import { GROUND_TOP_Y } from './renderer';

const WALL_COLOR = 0x9aa4b2;
const COUNTDOWN_COLOR = '#ff6b5e';

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
  private readonly wallGeometry = new THREE.BoxGeometry(0.92, 0.55, 0.92);
  private readonly wallMaterial = new THREE.MeshLambertMaterial({ color: WALL_COLOR });
  private readonly meshes = new Map<number, THREE.Group>();
  private readonly labels = new Map<number, CountdownLabel>();
  private readonly heights = new Map<number, number>();

  constructor(scene: THREE.Scene, assets: Assets) {
    this.scene = scene;
    this.assets = assets;
  }

  private build(s: Structure): THREE.Group {
    const group = new THREE.Group();
    if (s.kind === 'wall') {
      const mesh = new THREE.Mesh(this.wallGeometry, this.wallMaterial);
      mesh.position.y = 0.275;
      group.add(mesh);
      this.heights.set(s.id, 0.55);
      group.position.set(s.tx + 0.5, GROUND_TOP_Y, s.ty + 0.5);
    } else {
      // Kit models are 1×1; scaled 2× the tower fills its 2×2 footprint.
      const height = stack(group, [
        this.assets.instance('tower-square-bottom-a'),
        this.assets.instance('tower-square-top-a'),
        this.assets.instance('weapon-turret'),
      ]);
      group.scale.setScalar(2);
      this.heights.set(s.id, height * 2);
      group.position.set(s.tx + 1, GROUND_TOP_Y, s.ty + 1);
    }
    return group;
  }

  /** Reflect sim structures into the scene; tick drives countdown labels. */
  sync(structures: readonly Structure[], tick: number): void {
    const live = new Set<number>();
    for (const s of structures) {
      live.add(s.id);
      let mesh = this.meshes.get(s.id);
      if (!mesh) {
        mesh = this.build(s);
        this.meshes.set(s.id, mesh);
        this.scene.add(mesh);
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
    for (const [id, mesh] of this.meshes) {
      if (!live.has(id)) {
        this.scene.remove(mesh);
        this.meshes.delete(id);
        this.heights.delete(id);
      }
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
