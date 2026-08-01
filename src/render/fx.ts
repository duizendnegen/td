// Tracers, muzzle/impact/burst effects, reject flashes, ghost preview
// See ARCHITECTURE.md §7, §8 and phase-2/3 design D8
//
// Responsibilities:
//   - Drains sim render events each frame; never read back by the sim
//   - Muzzle flash + impact effect per tracer; expanding ring per aoeBurst
//   - The SAME red flash serves sim-side rejections and local red-ghost
//     clicks (design D8: one feedback implementation in the renderer)
//   - Ghost preview mesh with valid / invalid / debt tinting + range rings
//     (current level and next-level upgrade preview)

import * as THREE from 'three';
import type { RenderEvent } from '../sim/events';
import { TILE } from '../sim/fixed';
import type { FootprintTile } from '../sim/placement';
import type { StructureKind } from '../sim/types';
import { GROUND_TOP_Y } from './renderer';

const TRACER_MS = 110;
const FLASH_MS = 260;
const MUZZLE_MS = 90;
const IMPACT_MS = 160;
const BURST_MS = 320;
const FLASH_COLOR = 0xff3b30;

/** Tracer / effect colour per archetypeId (canonical ARCHETYPES order). */
const ARCHETYPE_COLORS = [0xffe08a, 0xff8a5c, 0xffb02e, 0x6fd9ff];
const IMPACT_COLOR = 0xfff3c4;

export type GhostTint = 'valid' | 'invalid' | 'debt';

const GHOST_COLORS: Record<GhostTint, number> = {
  valid: 0x37d67a,
  invalid: 0xff3b30,
  debt: 0xffa02e,
};

/** Muzzle height matches the composed tower's weapon head, near the top. */
const TRACER_FROM_Y = GROUND_TOP_Y + 1.1;
const TRACER_TO_Y = GROUND_TOP_Y + 0.5;

interface TimedEffect {
  object: THREE.Object3D;
  material: THREE.Material & { opacity: number };
  bornMs: number;
  ttlMs: number;
  /** Starting opacity the fade scales down from (default 1). */
  baseOpacity?: number;
  /** Optional per-frame shaping, given age ∈ [0, 1). */
  shape?: (age: number) => void;
}

export class FxRenderer {
  private readonly scene: THREE.Scene;
  private readonly effects: TimedEffect[] = [];
  private readonly flashGeometry = new THREE.PlaneGeometry(0.96, 0.96).rotateX(-Math.PI / 2);
  private readonly muzzleGeometry = new THREE.SphereGeometry(0.09, 8, 8);
  private readonly impactGeometry = new THREE.SphereGeometry(0.14, 8, 8);
  private readonly burstGeometry = FxRenderer.ringGeometry();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  private static ringGeometry(): THREE.BufferGeometry {
    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      points.push(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)));
    }
    return new THREE.BufferGeometry().setFromPoints(points);
  }

  /** Drain the sim's event queue — called once per frame before update(). */
  drain(events: RenderEvent[], nowMs: number): void {
    for (const ev of events) {
      switch (ev.kind) {
        case 'tracer':
          this.spawnTracer(ev, nowMs);
          break;
        case 'aoeBurst':
          this.spawnBurst(ev, nowMs);
          break;
        case 'placementRejected':
          this.flashReject(ev.tiles, nowMs);
          break;
      }
    }
    events.length = 0;
  }

  /** The one red-flash implementation; also called directly by the UI. */
  flashReject(tiles: readonly FootprintTile[], nowMs: number): void {
    for (const t of tiles) {
      const material = new THREE.MeshBasicMaterial({
        color: FLASH_COLOR,
        transparent: true,
        opacity: 0.65,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(this.flashGeometry, material);
      mesh.position.set(t.x + 0.5, GROUND_TOP_Y + 0.02, t.y + 0.5);
      this.add({ object: mesh, material, bornMs: nowMs, ttlMs: FLASH_MS, baseOpacity: 0.65 });
    }
  }

  private add(effect: TimedEffect): void {
    this.scene.add(effect.object);
    this.effects.push(effect);
  }

  private spawnTracer(
    ev: { archetypeId: number; fromX: number; fromY: number; toX: number; toY: number },
    nowMs: number,
  ): void {
    const color = ARCHETYPE_COLORS[ev.archetypeId] ?? ARCHETYPE_COLORS[0]!;
    const from = new THREE.Vector3(ev.fromX / TILE, TRACER_FROM_Y, ev.fromY / TILE);
    const to = new THREE.Vector3(ev.toX / TILE, TRACER_TO_Y, ev.toY / TILE);

    const lineMaterial = new THREE.LineBasicMaterial({ color, transparent: true });
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([from, to]), lineMaterial);
    this.add({ object: line, material: lineMaterial, bornMs: nowMs, ttlMs: TRACER_MS });

    // Muzzle flash at the weapon head…
    const muzzleMaterial = new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false });
    const muzzle = new THREE.Mesh(this.muzzleGeometry, muzzleMaterial);
    muzzle.position.copy(from);
    this.add({
      object: muzzle,
      material: muzzleMaterial,
      bornMs: nowMs,
      ttlMs: MUZZLE_MS,
      shape: (age) => muzzle.scale.setScalar(1 + age * 1.5),
    });

    // …and an impact at the target.
    const impactMaterial = new THREE.MeshBasicMaterial({ color: IMPACT_COLOR, transparent: true, depthWrite: false });
    const impact = new THREE.Mesh(this.impactGeometry, impactMaterial);
    impact.position.copy(to);
    this.add({
      object: impact,
      material: impactMaterial,
      bornMs: nowMs,
      ttlMs: IMPACT_MS,
      shape: (age) => impact.scale.setScalar(0.6 + age),
    });
  }

  /** Expanding ground ring out to the burst radius (tower-combat spec D6). */
  private spawnBurst(ev: { x: number; y: number; radiusUnits: number }, nowMs: number): void {
    const radius = ev.radiusUnits / TILE;
    const color = ARCHETYPE_COLORS[2]!;
    const ringMaterial = new THREE.LineBasicMaterial({ color, transparent: true });
    const ring = new THREE.Line(this.burstGeometry, ringMaterial);
    ring.position.set(ev.x / TILE, GROUND_TOP_Y + 0.05, ev.y / TILE);
    this.add({
      object: ring,
      material: ringMaterial,
      bornMs: nowMs,
      ttlMs: BURST_MS,
      shape: (age) => ring.scale.setScalar(Math.max(0.05, radius * age)),
    });

    const fillMaterial = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
    });
    const fill = new THREE.Mesh(this.flashGeometry, fillMaterial);
    fill.position.set(ev.x / TILE, GROUND_TOP_Y + 0.03, ev.y / TILE);
    fill.scale.setScalar(radius * 2);
    this.add({ object: fill, material: fillMaterial, bornMs: nowMs, ttlMs: IMPACT_MS, baseOpacity: 0.3 });
  }

  /** Fade and reap effects; called every frame. */
  update(nowMs: number): void {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i]!;
      const age = (nowMs - e.bornMs) / e.ttlMs;
      if (age >= 1) {
        this.scene.remove(e.object);
        // Shared geometries stay alive; only per-effect materials/geometry go.
        if (e.object instanceof THREE.Line && e.object.geometry !== this.burstGeometry) {
          e.object.geometry.dispose();
        }
        e.material.dispose();
        this.effects.splice(i, 1);
      } else {
        e.material.opacity = (e.baseOpacity ?? 1) * (1 - age);
        e.shape?.(age);
      }
    }
  }
}

/**
 * The footprint ghost that follows the hovered tile, plus range rings for
 * tower ghosts, selected towers, and the next-level upgrade preview. Purely
 * cosmetic — all verdicts come from the caller, which runs the real
 * validation.
 */
export class GhostPreview {
  private readonly wallMesh: THREE.Mesh;
  private readonly towerMesh: THREE.Mesh;
  private readonly wallMaterial: THREE.MeshLambertMaterial;
  private readonly towerMaterial: THREE.MeshLambertMaterial;
  private readonly ring: THREE.LineLoop;
  private readonly previewRing: THREE.LineLoop;

  constructor(scene: THREE.Scene) {
    this.wallMaterial = new THREE.MeshLambertMaterial({ transparent: true, opacity: 0.55 });
    this.towerMaterial = new THREE.MeshLambertMaterial({ transparent: true, opacity: 0.55 });
    this.wallMesh = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.6, 0.94), this.wallMaterial);
    this.towerMesh = new THREE.Mesh(new THREE.BoxGeometry(0.94, 1.4, 0.94), this.towerMaterial);
    this.wallMesh.visible = false;
    this.towerMesh.visible = false;

    // Unit-radius rings, scaled per show call — ranges differ per archetype
    // and per level.
    const points: THREE.Vector3[] = [];
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      points.push(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)));
    }
    const ringGeometry = new THREE.BufferGeometry().setFromPoints(points);
    this.ring = new THREE.LineLoop(ringGeometry, new THREE.LineBasicMaterial({ color: 0x7fd0ff }));
    this.ring.visible = false;
    this.previewRing = new THREE.LineLoop(
      ringGeometry,
      new THREE.LineBasicMaterial({ color: 0xc9a2ff }),
    );
    this.previewRing.visible = false;

    scene.add(this.wallMesh, this.towerMesh, this.ring, this.previewRing);
  }

  /**
   * Show the ghost for `kind` at tile (tx, ty) with the given tint; a tower
   * ghost also shows its archetype's level-1 range ring.
   */
  show(kind: StructureKind, tx: number, ty: number, tint: GhostTint, rangeUnits = 0): void {
    const color = GHOST_COLORS[tint];
    const centre = { x: tx + 0.5, z: ty + 0.5 };
    if (kind === 'wall') {
      this.wallMesh.visible = true;
      this.towerMesh.visible = false;
      this.wallMaterial.color.setHex(color);
      this.wallMesh.position.set(centre.x, GROUND_TOP_Y + 0.3, centre.z);
      this.showRingAt(null);
    } else {
      this.towerMesh.visible = true;
      this.wallMesh.visible = false;
      this.towerMaterial.color.setHex(color);
      this.towerMesh.position.set(centre.x, GROUND_TOP_Y + 0.7, centre.z);
      // Range ring on the tower ghost (build-ui spec).
      this.showRingAt(centre, rangeUnits);
    }
  }

  /** Range ring alone — used for a selected placed tower. */
  showRingAt(centre: { x: number; z: number } | null, rangeUnits = 0): void {
    if (!centre || rangeUnits <= 0) {
      this.ring.visible = false;
      return;
    }
    this.ring.visible = true;
    this.ring.scale.setScalar(rangeUnits / TILE);
    this.ring.position.set(centre.x, GROUND_TOP_Y + 0.03, centre.z);
  }

  /** Next-level range preview, shown while the upgrade action is hovered. */
  showPreviewRingAt(centre: { x: number; z: number } | null, rangeUnits = 0): void {
    if (!centre || rangeUnits <= 0) {
      this.previewRing.visible = false;
      return;
    }
    this.previewRing.visible = true;
    this.previewRing.scale.setScalar(rangeUnits / TILE);
    this.previewRing.position.set(centre.x, GROUND_TOP_Y + 0.04, centre.z);
  }

  hide(): void {
    this.wallMesh.visible = false;
    this.towerMesh.visible = false;
    this.ring.visible = false;
    this.previewRing.visible = false;
  }
}
