// Debug overlay
// See ARCHITECTURE.md §11
//
// Responsibilities:
//   - F1 flow-field direction arrows and blocked tiles
//   - F2 enemy state and committed waypoints
//   - F3 tower ranges and target lines (Phase 3)
//   - F4 tick / state hash / entity count / ms-per-tick

import * as THREE from 'three';
import { TILE } from '../sim/fixed';
import { DIR_DX, DIR_DY, UNREACHABLE, type FlowField } from '../sim/flowfield';
import { formatHash } from '../sim/hash';
import type { Sim } from '../sim/sim';
import { towerCentre, towerStats } from '../sim/tower';
import { GROUND_TOP_Y } from './renderer';

const OVERLAY_Y = GROUND_TOP_Y + 0.03;
const INBOUND_COLOR = 0x35d0ff; // cyan
const RETURNING_COLOR = 0xffa03c; // orange
const BLOCKED_COLOR = 0xff4455;
const UNREACHABLE_COLOR = 0xff44ff;
/** F3 tower colours per archetypeId (canonical ARCHETYPES order). */
const TOWER_COLORS = [0xffe08a, 0xff8a5c, 0xffb02e, 0x6fd9ff];

function lineSegments(points: number[], color: number): THREE.LineSegments {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  return new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color }));
}

/** Arrow (shaft + two head barbs) for one tile's field direction, as 6 points ×3 coords. */
function arrowPoints(cx: number, cz: number, d: number, out: number[]): void {
  const len = Math.hypot(DIR_DX[d]!, DIR_DY[d]!);
  const vx = DIR_DX[d]! / len;
  const vz = DIR_DY[d]! / len;
  const tipX = cx + vx * 0.32;
  const tipZ = cz + vz * 0.32;
  // shaft
  out.push(cx - vx * 0.32, OVERLAY_Y, cz - vz * 0.32, tipX, OVERLAY_Y, tipZ);
  // barbs at ±140° from the direction
  const bx = -vx * 0.16;
  const bz = -vz * 0.16;
  out.push(tipX, OVERLAY_Y, tipZ, tipX + bx - vz * 0.09, OVERLAY_Y, tipZ + bz + vx * 0.09);
  out.push(tipX, OVERLAY_Y, tipZ, tipX + bx + vz * 0.09, OVERLAY_Y, tipZ + bz - vx * 0.09);
}

/** Static arrow layer for one field; offset separates the two fields visually. */
function buildFieldLayer(
  sim: Sim,
  field: FlowField,
  color: number,
  offset: number,
): THREE.Object3D {
  const arrows: number[] = [];
  const unreachable: number[] = [];
  const { grid } = sim;
  for (let ty = 0; ty < grid.height; ty++) {
    for (let tx = 0; tx < grid.width; tx++) {
      if (grid.isBlocked(tx, ty)) continue;
      const i = grid.idx(tx, ty);
      const cx = tx + 0.5 + offset;
      const cz = ty + 0.5 + offset;
      const d = field.dir[i]!;
      if (d !== UNREACHABLE) {
        arrowPoints(cx, cz, d, arrows);
      } else if (field.cost[i] === UNREACHABLE) {
        // Small diamond: walkable but no path to the source.
        unreachable.push(cx - 0.14, OVERLAY_Y, cz, cx, OVERLAY_Y, cz - 0.14);
        unreachable.push(cx, OVERLAY_Y, cz - 0.14, cx + 0.14, OVERLAY_Y, cz);
        unreachable.push(cx + 0.14, OVERLAY_Y, cz, cx, OVERLAY_Y, cz + 0.14);
        unreachable.push(cx, OVERLAY_Y, cz + 0.14, cx - 0.14, OVERLAY_Y, cz);
      }
      // Sources (cost 0) get neither an arrow nor a diamond.
    }
  }
  const group = new THREE.Group();
  group.add(lineSegments(arrows, color));
  if (unreachable.length > 0) group.add(lineSegments(unreachable, UNREACHABLE_COLOR));
  return group;
}

/** Red X over every blocked tile. */
function buildBlockedLayer(sim: Sim): THREE.Object3D {
  const points: number[] = [];
  const { grid } = sim;
  for (let ty = 0; ty < grid.height; ty++) {
    for (let tx = 0; tx < grid.width; tx++) {
      if (!grid.blocked[grid.idx(tx, ty)]) continue;
      const x = tx + 0.5;
      const z = ty + 0.5;
      const y = OVERLAY_Y + 0.3; // above the rock models
      points.push(x - 0.3, y, z - 0.3, x + 0.3, y, z + 0.3);
      points.push(x - 0.3, y, z + 0.3, x + 0.3, y, z - 0.3);
    }
  }
  return lineSegments(points, BLOCKED_COLOR);
}

export class DebugOverlay {
  private readonly scene: THREE.Scene;
  private readonly sim: Sim;
  private readonly readout: HTMLDivElement;

  private fieldLayer: THREE.Object3D | null = null; // F1
  /** The inbound field the F1 layer was built from; a swap means a rebuild. */
  private fieldLayerSource: object | null = null;
  private waypointLayer: THREE.Group | null = null; // F2
  private waypointsOn = false;
  private combatLayer: THREE.Group | null = null; // F3
  private combatOn = false;
  private readoutOn = false; // F4

  constructor(scene: THREE.Scene, sim: Sim, hud: HTMLElement) {
    this.scene = scene;
    this.sim = sim;
    this.readout = document.createElement('div');
    this.readout.style.cssText =
      'position:absolute;top:8px;left:8px;padding:6px 10px;background:#000a;' +
      'font:12px/1.5 monospace;border-radius:6px;white-space:pre;display:none';
    hud.appendChild(this.readout);
  }

  /** F1: both flow fields, blocked tiles, unreachable tiles. */
  toggleFields(): void {
    if (this.fieldLayer) {
      this.scene.remove(this.fieldLayer);
      this.fieldLayer = null;
      this.fieldLayerSource = null;
      return;
    }
    this.buildFields();
  }

  private buildFields(): void {
    const layer = new THREE.Group();
    layer.add(buildFieldLayer(this.sim, this.sim.inbound, INBOUND_COLOR, -0.09));
    layer.add(buildFieldLayer(this.sim, this.sim.returning, RETURNING_COLOR, 0.09));
    layer.add(buildBlockedLayer(this.sim));
    this.scene.add(layer);
    this.fieldLayer = layer;
    this.fieldLayerSource = this.sim.inbound;
  }

  /** F2: line from each enemy to its committed waypoint. */
  toggleWaypoints(): void {
    this.waypointsOn = !this.waypointsOn;
    if (!this.waypointsOn && this.waypointLayer) {
      this.scene.remove(this.waypointLayer);
      for (const child of this.waypointLayer.children) {
        (child as THREE.LineSegments).geometry.dispose();
      }
      this.waypointLayer = null;
    }
  }

  /** F3: tower range boundaries and target lines, from live sim state. */
  toggleCombat(): void {
    this.combatOn = !this.combatOn;
    if (!this.combatOn && this.combatLayer) {
      this.dropCombatLayer();
    }
  }

  private dropCombatLayer(): void {
    if (!this.combatLayer) return;
    this.scene.remove(this.combatLayer);
    for (const child of this.combatLayer.children) {
      (child as THREE.LineSegments).geometry.dispose();
      ((child as THREE.LineSegments).material as THREE.Material).dispose();
    }
    this.combatLayer = null;
  }

  /** F4: tick / hash / entity count / ms-per-tick. */
  toggleReadout(): void {
    this.readoutOn = !this.readoutOn;
    this.readout.style.display = this.readoutOn ? 'block' : 'none';
  }

  /** Called every frame; refreshes whichever dynamic layers are visible. */
  update(lastTickMs: number, pendingCommit = false): void {
    // The live fields are swapped objects; a new reference means the mask
    // changed and a visible F1 layer is stale — rebuild it.
    if (this.fieldLayer && this.fieldLayerSource !== this.sim.inbound) {
      this.scene.remove(this.fieldLayer);
      this.buildFields();
    }
    if (this.waypointsOn) this.refreshWaypoints();
    if (this.combatOn) this.refreshCombat();
    if (this.readoutOn) {
      const s = this.sim.state;
      const byType = new Map<string, number>();
      let slowed = 0;
      for (const e of s.enemies) {
        const key = this.sim.data.enemyTypes[e.typeId]?.key ?? '?';
        byType.set(key, (byType.get(key) ?? 0) + 1);
        if (s.tick < e.slowUntil) slowed++;
      }
      const types = [...byType.entries()].map(([k, n]) => `${k} ${n}`).join(' · ') || 'none';
      // A pending commit is why the hash can move at a standing tick: the state
      // has absorbed intent but not advanced through it. Marked so that reads as
      // intended rather than as determinism drift (time-controls design D3).
      this.readout.textContent =
        `tick    ${s.tick}${pendingCommit ? ' +pending' : ''}\n` +
        `hash    ${formatHash(this.sim.hash())}\n` +
        `enemies ${s.enemies.length} (${slowed} slowed)\n` +
        `        ${types}\n` +
        `ms/tick ${lastTickMs.toFixed(3)}`;
    }
  }

  /** F3: per-tower range circle and a line to the current target. */
  private refreshCombat(): void {
    this.dropCombatLayer();
    const layer = new THREE.Group();
    const y = OVERLAY_Y + 0.02;
    for (const t of this.sim.state.structures) {
      if (t.kind !== 'tower') continue;
      const color = TOWER_COLORS[t.archetypeId] ?? 0xffffff;
      const { x: cx, y: cy } = towerCentre(t);
      const wx = cx / TILE;
      const wz = cy / TILE;
      const radius = towerStats(t, this.sim.data).rangeUnits / TILE;

      const points: number[] = [];
      const SEGMENTS = 48;
      for (let i = 0; i < SEGMENTS; i++) {
        const a0 = (i / SEGMENTS) * Math.PI * 2;
        const a1 = ((i + 1) / SEGMENTS) * Math.PI * 2;
        points.push(
          wx + Math.cos(a0) * radius, y, wz + Math.sin(a0) * radius,
          wx + Math.cos(a1) * radius, y, wz + Math.sin(a1) * radius,
        );
      }
      const target = this.sim.currentTarget(t);
      if (target) {
        points.push(wx, y + 0.4, wz, target.pos.x / TILE, y + 0.1, target.pos.y / TILE);
      }
      layer.add(lineSegments(points, color));
    }
    this.combatLayer = layer;
    this.scene.add(layer);
  }

  private refreshWaypoints(): void {
    const y = OVERLAY_Y + 0.25;
    const byMode: Record<'inbound' | 'returning', number[]> = { inbound: [], returning: [] };
    for (const e of this.sim.state.enemies) {
      const points = byMode[e.mode];
      const px = e.pos.x / TILE;
      const pz = e.pos.y / TILE;
      const wx = e.waypoint.x / TILE;
      const wz = e.waypoint.y / TILE;
      points.push(px, y, pz, wx, y, wz);
      // Diamond marker on the committed waypoint.
      points.push(wx - 0.12, y, wz, wx, y, wz - 0.12);
      points.push(wx, y, wz - 0.12, wx + 0.12, y, wz);
      points.push(wx + 0.12, y, wz, wx, y, wz + 0.12);
      points.push(wx, y, wz + 0.12, wx - 0.12, y, wz);
    }
    if (this.waypointLayer) {
      this.scene.remove(this.waypointLayer);
      for (const child of this.waypointLayer.children) {
        (child as THREE.LineSegments).geometry.dispose();
      }
    }
    const layer = new THREE.Group();
    layer.add(lineSegments(byMode.inbound, INBOUND_COLOR));
    layer.add(lineSegments(byMode.returning, RETURNING_COLOR));
    this.waypointLayer = layer;
    this.scene.add(this.waypointLayer);
  }
}
