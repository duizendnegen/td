// Debug overlay
// See ARCHITECTURE.md §11
//
// Responsibilities:
//   - F2 enemy state and committed waypoints
//   - F3 tower ranges and target lines (Phase 3), plus every active spawn's
//     returning field as per-tile direction ticks (return-to-origin-spawn D6)
//   - F4 tick / state hash / entity count / ms-per-tick — and, during a
//     wave, the tick's power figures: draw, solar, grid, tier/capacity,
//     coverage, bill (energy-infrastructure debug-tooling delta)
//
// "Where do enemies go" is a player surface now, not a debug one: the
// path-preview lane ribbon answers it, and its orphaned-region shade covers
// what F1's unreachable diamonds used to.

import * as THREE from 'three';
import { GOLD, POWER, TICK_HZ, TILE } from '../sim/fixed';
import { DIR_DX, DIR_DY } from '../sim/flowfield';
import { formatHash } from '../sim/hash';
import { COVERAGE_SCALE } from '../sim/power';
import type { Sim } from '../sim/sim';
import { towerCentre, towerStats } from '../sim/tower';
import { GROUND_TOP_Y } from './renderer';

const OVERLAY_Y = GROUND_TOP_Y + 0.03;
const INBOUND_COLOR = 0x35d0ff; // cyan
const RETURNING_COLOR = 0xffa03c; // orange
/** F3 tower colours per archetypeId (canonical ARCHETYPES order). */
const TOWER_COLORS = [0xffe08a, 0xff8a5c, 0xffb02e, 0x6fd9ff];
/**
 * F3 per-spawn shades for the returning fields, cycled in active-spawn
 * order — debug tooling, so running out of distinct shades just repeats.
 */
const RETURNING_FIELD_COLORS = [0xffa03c, 0xff5c8a, 0xb8ff5c, 0xd08cff];

function lineSegments(points: number[], color: number): THREE.LineSegments {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  return new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color }));
}

export class DebugOverlay {
  private readonly scene: THREE.Scene;
  private readonly sim: Sim;
  private readonly readout: HTMLDivElement;

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
      // Power figures during a wave only: outside one nothing draws (power-grid spec).
      let power = '';
      if (s.runPhase === 'wave') {
        const p = this.sim.power;
        const kw = (mp: number): string => (mp / POWER).toFixed(2);
        const tier = this.sim.data.gridTiers[s.gridTier]!;
        power =
          `\npower   draw ${kw(p.drawMp)} kW · solar ${kw(p.solarMp)} · grid ${kw(p.gridSupplyMp)}\n` +
          `        tier ${s.gridTier + 1}/${this.sim.data.gridTiers.length} cap ${kw(tier.capacityMp)} kW` +
          ` · coverage ${((p.coverage * 100) / COVERAGE_SCALE).toFixed(1)}%\n` +
          `        bill ${p.billMg} mg/tick (${((p.billMg * TICK_HZ) / GOLD).toFixed(2)} g/s)`;
      }
      this.readout.textContent =
        `tick    ${s.tick}${pendingCommit ? ' +pending' : ''}\n` +
        `hash    ${formatHash(this.sim.hash())}\n` +
        `enemies ${s.enemies.length} (${slowed} slowed)\n` +
        `        ${types}\n` +
        `ms/tick ${lastTickMs.toFixed(3)}` +
        power;
    }
  }

  /** F3: per-tower range circle and a line to the current target. */
  private refreshCombat(): void {
    this.dropCombatLayer();
    const layer = new THREE.Group();
    const y = OVERLAY_Y + 0.02;

    // Every ACTIVE spawn's returning field as a tick per tile pointing the
    // way a returning enemy of that origin steps (return-to-origin-spawn
    // design D6); one shade per spawn.
    const grid = this.sim.grid;
    this.sim.activeSpawnIndices.forEach((spawnId, order) => {
      const field = this.sim.returning[spawnId]!;
      const points: number[] = [];
      for (let ty = 0; ty < grid.height; ty++) {
        for (let tx = 0; tx < grid.width; tx++) {
          const d = field.dir[grid.idx(tx, ty)]!;
          if (d < 0) continue;
          const cx = tx + 0.5;
          const cz = ty + 0.5;
          points.push(cx, y, cz, cx + DIR_DX[d]! * 0.35, y, cz + DIR_DY[d]! * 0.35);
        }
      }
      layer.add(
        lineSegments(points, RETURNING_FIELD_COLORS[order % RETURNING_FIELD_COLORS.length]!),
      );
    });
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
