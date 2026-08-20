// Structure rendering: walls and modular towers
// See ARCHITECTURE.md §8
//
// Responsibilities:
//   - Kit models are natively 1×1 — every structure sits on its single tile
//   - Modular tower composition: one kit segment per upgrade level per
//     archetype (square bases + weapon heads; round + crystals for slow),
//     so level reads as height (tower-upgrades spec)
//   - A tower on dirt stands on its wall (build-over-walls design D7): the
//     wall IS its base segment, so the tower's middles and head start at the
//     wall's height and the tower brings no base of its own; a socket tower
//     keeps base + middles + head. Same silhouette either way, no doubled
//     masonry. The terrain kind comes from an injected predicate, never from
//     scanning structures
//   - Weapon head yaws toward the tower's current target (cosmetic)
//   - Provisional structures wear a pulsing footprint tell that clears the
//     frame they commit (provisional-construction design D6) — render-only,
//     read off hashed state, never written back
//   - A removed structure's mesh is dropped in the frame it disappears; there
//     is no countdown state to render (structure-placement spec)
//   - A moved structure's mesh (and its provisional tell) repositions in the
//     frame its tile changes; every structure in a lifted stack renders
//     dimmed at the origin while it is carried (tower-drag-move,
//     build-over-walls design D5)
//   - One provisional tell per tile: a wall's mark is suppressed while a
//     provisional tower on the same tile shows one (design D7)

import * as THREE from 'three';
import { ARCHETYPES, type TowerArchetype } from '../data/schema';
import { TILE } from '../sim/fixed';
import type { Enemy, Structure } from '../sim/types';
import type { Assets } from './assets';
import { GROUND_TOP_Y } from './renderer';

/** Walls are kit masonry from the tower-base family (render-pipeline spec). */
const WALL_MODEL = 'tower-square-bottom-a';

/** Base and per-level middle segments, plus the weapon head, per archetype. */
const KIT: Record<TowerArchetype, { base: string; middle: string; head: string }> = {
  rapid: { base: 'tower-square-bottom-a', middle: 'tower-square-middle-a', head: 'weapon-turret' },
  sniper: { base: 'tower-square-bottom-a', middle: 'tower-square-middle-b', head: 'weapon-ballista' },
  area: { base: 'tower-square-bottom-a', middle: 'tower-square-middle-a', head: 'weapon-catapult' },
  slow: { base: 'tower-round-bottom-a', middle: 'tower-round-middle-a', head: 'tower-round-crystals' },
};

/**
 * The provisional tell: the ghost preview's mint, so "not yet committed" reads
 * in the same language as "not yet placed" — and it carries against both the
 * orange dirt and the kit's purple-grey masonry, which gold does not.
 */
const PROVISIONAL_COLOR = 0x65f2b5;
/** Full pulse period in ms — slow enough to read as a state, not an alarm. */
const PULSE_MS = 1600;

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
  /** The weapon head per tower, for the cosmetic target yaw. */
  private readonly heads = new Map<number, THREE.Object3D>();
  /**
   * The composition each mesh was built for — level and mounting; an
   * upgrade, or a hop between a wall and a socket, triggers a rebuild.
   */
  private readonly builtKeys = new Map<number, string>();
  /** The provisional footprint tell per structure, while it has one. */
  private readonly marks = new Map<number, THREE.Object3D>();
  /** The structures whose origin meshes render dimmed — the carried lift. */
  private readonly liftedIds = new Set<number>();
  /** Whether tile (tx, ty) is a socket — the one terrain fact rendering needs. */
  private readonly isSocket: (tx: number, ty: number) => boolean;
  /** The wall model's height, measured once: where a mounted tower starts. */
  private wallHeight: number | null = null;
  /** Shared translucent variant of the atlas material, built on first lift. */
  private dimMaterial: THREE.MeshLambertMaterial | null = null;
  /** Shared by every tell: one geometry pair, one material pair, one pulse. */
  private readonly markOutline = StructureRenderer.squareGeometry(0.98);
  private readonly markFill = new THREE.PlaneGeometry(0.98, 0.98).rotateX(-Math.PI / 2);
  // The outline ignores depth: the structure stands on the very tile the tell
  // marks, so a depth-tested ring would be hidden under its own base.
  private readonly outlineMaterial = new THREE.LineBasicMaterial({
    color: PROVISIONAL_COLOR,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  private readonly fillMaterial = new THREE.MeshBasicMaterial({
    color: PROVISIONAL_COLOR,
    transparent: true,
    depthWrite: false,
  });

  constructor(scene: THREE.Scene, assets: Assets, isSocket: (tx: number, ty: number) => boolean) {
    this.scene = scene;
    this.assets = assets;
    this.isSocket = isSocket;
  }

  /** The wall model's height — where a mounted tower's payload starts. */
  private static wallHeight(assets: Assets): number {
    const box = new THREE.Box3().setFromObject(assets.instance(WALL_MODEL));
    return Math.max(box.max.y - box.min.y, 0);
  }

  /** Flat unit-square outline on the XZ plane, centred on the origin. */
  private static squareGeometry(size: number): THREE.BufferGeometry {
    const h = size / 2;
    return new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-h, 0, -h),
      new THREE.Vector3(h, 0, -h),
      new THREE.Vector3(h, 0, h),
      new THREE.Vector3(-h, 0, h),
    ]);
  }

  /** The tell for one structure: a ground outline over a faint fill. */
  private buildMark(s: Structure): THREE.Object3D {
    const group = new THREE.Group();
    // Two loops, at the tile edge and just inside it: a single hairline is
    // lost against the ground at this camera distance.
    for (const scale of [1, 0.86]) {
      const outline = new THREE.LineLoop(this.markOutline, this.outlineMaterial);
      outline.scale.set(scale, 1, scale);
      outline.renderOrder = 2; // drawn last, over the base it rings
      group.add(outline);
    }
    const fill = new THREE.Mesh(this.markFill, this.fillMaterial);
    fill.position.y = -0.01;
    group.add(fill);
    group.position.set(s.tx + 0.5, GROUND_TOP_Y + 0.04, s.ty + 0.5);
    return group;
  }

  private dropMark(id: number): void {
    const mark = this.marks.get(id);
    if (mark) this.scene.remove(mark);
    this.marks.delete(id);
  }

  /** The composition key for `s`: rebuild when it changes. */
  private buildKey(s: Structure): string {
    return `${s.level}:${this.isSocket(s.tx, s.ty) ? 'socket' : 'dirt'}`;
  }

  private build(s: Structure): THREE.Group {
    const group = new THREE.Group();
    if (s.kind === 'wall') {
      stack(group, [this.assets.instance(WALL_MODEL)]);
    } else {
      // One middle segment per level above 1: level legibility is height. On
      // dirt the wall beneath is the base segment (design D7): the tower
      // starts at the wall's height and brings no base of its own; on a
      // socket it keeps its own base. Same silhouette either way.
      const kit = KIT[ARCHETYPES[s.archetypeId]!];
      const onSocket = this.isSocket(s.tx, s.ty);
      const parts: THREE.Object3D[] = onSocket ? [this.assets.instance(kit.base)] : [];
      for (let l = 1; l < s.level; l++) parts.push(this.assets.instance(kit.middle));
      const head = this.assets.instance(kit.head);
      parts.push(head);
      const payload = new THREE.Group();
      stack(payload, parts);
      if (!onSocket) {
        this.wallHeight ??= StructureRenderer.wallHeight(this.assets);
        payload.position.y = this.wallHeight;
      }
      group.add(payload);
      this.heads.set(s.id, head);
    }
    group.position.set(s.tx + 0.5, GROUND_TOP_Y, s.ty + 0.5);
    return group;
  }

  private dropMesh(id: number): void {
    const mesh = this.meshes.get(id);
    if (mesh) this.scene.remove(mesh);
    this.meshes.delete(id);
    this.heads.delete(id);
    this.builtKeys.delete(id);
  }

  /**
   * Dim the origin meshes of the lifted stack, by id — the "reads as lifted"
   * treatment while the move tool carries it (build-ui delta) — and restore
   * whatever was dimmed before and is not in `ids`. An empty list restores
   * everything. Render-only, like everything here: the ids come from the
   * UI's lift state, never from sim state.
   */
  setLifted(ids: readonly number[]): void {
    for (const id of this.liftedIds) {
      if (ids.includes(id)) continue;
      const prev = this.meshes.get(id);
      if (prev) this.applyDim(prev, false);
      this.liftedIds.delete(id);
    }
    for (const id of ids) {
      if (this.liftedIds.has(id)) continue;
      this.liftedIds.add(id);
      const mesh = this.meshes.get(id);
      if (mesh) this.applyDim(mesh, true);
    }
  }

  /**
   * Swap one group's meshes between the shared atlas material and its
   * translucent clone. A material swap, not a mutation: the atlas material
   * is shared by every model in the scene.
   */
  private applyDim(group: THREE.Object3D, dim: boolean): void {
    if (dim && !this.dimMaterial) {
      this.dimMaterial = this.assets.material.clone();
      this.dimMaterial.transparent = true;
      this.dimMaterial.opacity = 0.35;
    }
    group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.material = dim ? this.dimMaterial! : this.assets.material;
      }
    });
  }

  /**
   * Reflect sim structures into the scene; `targetFor` supplies each tower's
   * current target for the head yaw — read-only sim state, cosmetic result.
   * `nowMs` drives the provisional pulse alone and reaches nothing else.
   */
  sync(
    structures: readonly Structure[],
    targetFor: (s: Structure) => Enemy | null,
    nowMs = 0,
  ): void {
    // One pulse for every tell on the board, so what commits together reads as
    // one set: the outline breathes between half and full, the fill stays a
    // wash under it.
    const pulse = 0.75 + 0.25 * Math.sin((nowMs / PULSE_MS) * Math.PI * 2);
    this.fillMaterial.opacity = pulse * 0.3;
    this.outlineMaterial.opacity = pulse;

    // One tell per tile (design D7): a provisional tower's mark stands in for
    // the wall's beneath it, so a fresh stack does not draw two.
    const provisionalTowerTiles = new Set<string>();
    for (const s of structures) {
      if (s.kind === 'tower' && s.provisional) provisionalTowerTiles.add(`${s.tx},${s.ty}`);
    }
    const live = new Set<number>();
    for (const s of structures) {
      live.add(s.id);
      // The tell appears with the structure and clears the frame the wave's
      // first advanced tick commits it — or, for a wall, the frame a
      // provisional tower lands on it (and returns if that tower leaves).
      const marked =
        s.provisional && !(s.kind === 'wall' && provisionalTowerTiles.has(`${s.tx},${s.ty}`));
      if (marked && !this.marks.has(s.id)) {
        const mark = this.buildMark(s);
        this.marks.set(s.id, mark);
        this.scene.add(mark);
      } else if (!marked && this.marks.has(s.id)) {
        this.dropMark(s.id);
      }
      // An upgrade, or a hop between a wall and a socket, changes the
      // composition: rebuild the mesh for the new key.
      if (this.meshes.has(s.id) && this.builtKeys.get(s.id) !== this.buildKey(s)) {
        this.dropMesh(s.id);
      }
      let mesh = this.meshes.get(s.id);
      if (!mesh) {
        mesh = this.build(s);
        this.meshes.set(s.id, mesh);
        this.builtKeys.set(s.id, this.buildKey(s));
        this.scene.add(mesh);
        if (this.liftedIds.has(s.id)) this.applyDim(mesh, true);
      }
      // A moved structure repositions in the frame its tile changes — the
      // mesh and its provisional tell alike (tower-drag-move).
      const px = s.tx + 0.5;
      const pz = s.ty + 0.5;
      if (mesh.position.x !== px || mesh.position.z !== pz) {
        mesh.position.set(px, GROUND_TOP_Y, pz);
        this.marks.get(s.id)?.position.set(px, GROUND_TOP_Y + 0.04, pz);
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
    }
    // A removed structure is gone from sim state the tick its command applies,
    // so this drop is the whole removal animation.
    for (const id of this.meshes.keys()) {
      if (!live.has(id)) this.dropMesh(id);
    }
    for (const id of this.marks.keys()) {
      if (!live.has(id)) this.dropMark(id);
    }
  }
}
