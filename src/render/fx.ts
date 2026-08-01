// Tracers, reject flashes, ghost preview — render-only
// See ARCHITECTURE.md §7, §8 and phase-2 design D8
//
// Responsibilities:
//   - Drains sim render events each frame; never read back by the sim
//   - The SAME red flash serves sim-side rejections and local red-ghost
//     clicks (design D8: one feedback implementation in the renderer)
//   - Ghost preview mesh with valid / invalid / debt tinting + range ring

import * as THREE from 'three';
import type { RenderEvent } from '../sim/events';
import { TILE } from '../sim/fixed';
import type { FootprintTile } from '../sim/placement';
import type { StructureKind } from '../sim/types';
import { GROUND_TOP_Y } from './renderer';

const TRACER_MS = 110;
const FLASH_MS = 260;
const TRACER_COLOR = 0xffe08a;
const FLASH_COLOR = 0xff3b30;

export type GhostTint = 'valid' | 'invalid' | 'debt';

const GHOST_COLORS: Record<GhostTint, number> = {
  valid: 0x37d67a,
  invalid: 0xff3b30,
  debt: 0xffa02e,
};

/** Muzzle height matches the composed tower's turret, near the top. */
const TRACER_FROM_Y = GROUND_TOP_Y + 2.1;
const TRACER_TO_Y = GROUND_TOP_Y + 0.5;

interface Tracer {
  line: THREE.Line;
  material: THREE.LineBasicMaterial;
  bornMs: number;
}

interface Flash {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  bornMs: number;
}

export class FxRenderer {
  private readonly scene: THREE.Scene;
  private readonly tracers: Tracer[] = [];
  private readonly flashes: Flash[] = [];
  private readonly flashGeometry = new THREE.PlaneGeometry(0.96, 0.96).rotateX(-Math.PI / 2);

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  /** Drain the sim's event queue — called once per frame before update(). */
  drain(events: RenderEvent[], nowMs: number): void {
    for (const ev of events) {
      if (ev.kind === 'tracer') this.spawnTracer(ev, nowMs);
      else this.flashReject(ev.tiles, nowMs);
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
      this.scene.add(mesh);
      this.flashes.push({ mesh, material, bornMs: nowMs });
    }
  }

  private spawnTracer(
    ev: { fromX: number; fromY: number; toX: number; toY: number },
    nowMs: number,
  ): void {
    const material = new THREE.LineBasicMaterial({ color: TRACER_COLOR, transparent: true });
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(ev.fromX / TILE, TRACER_FROM_Y, ev.fromY / TILE),
      new THREE.Vector3(ev.toX / TILE, TRACER_TO_Y, ev.toY / TILE),
    ]);
    const line = new THREE.Line(geometry, material);
    this.scene.add(line);
    this.tracers.push({ line, material, bornMs: nowMs });
  }

  /** Fade and reap effects; called every frame. */
  update(nowMs: number): void {
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i]!;
      const age = (nowMs - t.bornMs) / TRACER_MS;
      if (age >= 1) {
        this.scene.remove(t.line);
        t.line.geometry.dispose();
        t.material.dispose();
        this.tracers.splice(i, 1);
      } else {
        t.material.opacity = 1 - age;
      }
    }
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i]!;
      const age = (nowMs - f.bornMs) / FLASH_MS;
      if (age >= 1) {
        this.scene.remove(f.mesh);
        f.material.dispose();
        this.flashes.splice(i, 1);
      } else {
        f.material.opacity = 0.65 * (1 - age);
      }
    }
  }
}

/**
 * The footprint ghost that follows the hovered tile, plus the range ring
 * shown on the tower ghost and on a selected tower. Purely cosmetic — all
 * verdicts come from the caller, which runs the real validation.
 */
export class GhostPreview {
  private readonly wallMesh: THREE.Mesh;
  private readonly towerMesh: THREE.Mesh;
  private readonly wallMaterial: THREE.MeshLambertMaterial;
  private readonly towerMaterial: THREE.MeshLambertMaterial;
  private readonly ring: THREE.LineLoop;

  constructor(scene: THREE.Scene, rangeUnits: number) {
    this.wallMaterial = new THREE.MeshLambertMaterial({ transparent: true, opacity: 0.55 });
    this.towerMaterial = new THREE.MeshLambertMaterial({ transparent: true, opacity: 0.55 });
    this.wallMesh = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.6, 0.94), this.wallMaterial);
    this.towerMesh = new THREE.Mesh(new THREE.BoxGeometry(1.94, 1.4, 1.94), this.towerMaterial);
    this.wallMesh.visible = false;
    this.towerMesh.visible = false;

    const radius = rangeUnits / TILE;
    const points: THREE.Vector3[] = [];
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      points.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius));
    }
    this.ring = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineBasicMaterial({ color: 0x7fd0ff }),
    );
    this.ring.visible = false;

    scene.add(this.wallMesh, this.towerMesh, this.ring);
  }

  /** Show the ghost for `kind` at tile (tx, ty) with the given tint. */
  show(kind: StructureKind, tx: number, ty: number, tint: GhostTint): void {
    const color = GHOST_COLORS[tint];
    if (kind === 'wall') {
      this.wallMesh.visible = true;
      this.towerMesh.visible = false;
      this.wallMaterial.color.setHex(color);
      this.wallMesh.position.set(tx + 0.5, GROUND_TOP_Y + 0.3, ty + 0.5);
      this.showRingAt(null);
    } else {
      this.towerMesh.visible = true;
      this.wallMesh.visible = false;
      this.towerMaterial.color.setHex(color);
      this.towerMesh.position.set(tx + 1, GROUND_TOP_Y + 0.7, ty + 1);
      // Range ring on the tower ghost (build-ui spec).
      this.showRingAt({ x: tx + 1, z: ty + 1 });
    }
  }

  /** Range ring alone — used for a selected placed tower. */
  showRingAt(centre: { x: number; z: number } | null): void {
    if (!centre) {
      this.ring.visible = false;
      return;
    }
    this.ring.visible = true;
    this.ring.position.set(centre.x, GROUND_TOP_Y + 0.03, centre.z);
  }

  hide(): void {
    this.wallMesh.visible = false;
    this.towerMesh.visible = false;
    this.ring.visible = false;
  }
}
