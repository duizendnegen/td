// Merged static ground geometry
// See ARCHITECTURE.md §8 and phase-4 design D10
//
// Responsibilities:
//   - 600 tiles merged into one draw call via mergeGeometries
//   - Terrain kinds map to distinct tile templates: dirt / grass / rock /
//     socket (grass plus a masonry socket base merged on top)
//   - Built once at level load; player structures never repaint the ground

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TERRAIN } from '../sim/grid';
import type { Assets } from './assets';
import { GROUND_TOP_Y, tileToWorld } from './renderer';

export interface GroundLayout {
  width: number;
  height: number;
  /** Terrain kind id per tile (sim TERRAIN values). */
  kindAt: (tx: number, ty: number) => number;
  spawns: readonly { x: number; y: number }[];
}

const KEPT_ATTRIBUTES = ['position', 'normal', 'uv'];

// mergeGeometries requires identical attribute sets and matching index-ness
// across all inputs; different kit models don't guarantee either.
function normalizeForMerge(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const out = geo.index ? geo.toNonIndexed() : geo;
  for (const name of Object.keys(out.attributes)) {
    if (!KEPT_ATTRIBUTES.includes(name)) out.deleteAttribute(name);
  }
  return out;
}

/** The whole 30×20 board as ONE mesh — a single draw call. */
export function buildGround(assets: Assets, layout: GroundLayout): THREE.Mesh {
  const templates = new Map<string, THREE.BufferGeometry>();
  const templateFor = (name: string): THREE.BufferGeometry => {
    let t = templates.get(name);
    if (!t) {
      t = normalizeForMerge(assets.geometry(name));
      templates.set(name, t);
    }
    return t;
  };

  // Kind → tile template (D10): navigable ground is dirt, scenery is the
  // grass or rock tile, and a socket is a grass tile wearing a masonry base.
  const TILE_FOR: Record<number, string> = {
    [TERRAIN.dirt]: 'tile-dirt',
    [TERRAIN.grass]: 'tile',
    [TERRAIN.rock]: 'tile-rock',
    [TERRAIN.socket]: 'tile',
  };
  const spawnKeys = new Set(layout.spawns.map((s) => `${s.x},${s.y}`));
  const parts: THREE.BufferGeometry[] = [];
  for (let ty = 0; ty < layout.height; ty++) {
    for (let tx = 0; tx < layout.width; tx++) {
      const kind = layout.kindAt(tx, ty);
      const name = spawnKeys.has(`${tx},${ty}`) ? 'tile-spawn' : TILE_FOR[kind]!;
      const { x, z } = tileToWorld(tx, ty);
      parts.push(templateFor(name).clone().translate(x, 0, z));
      if (kind === TERRAIN.socket) {
        parts.push(templateFor('tower-square-bottom-b').clone().translate(x, GROUND_TOP_Y, z));
      }
    }
  }

  const merged = mergeGeometries(parts);
  if (!merged) throw new Error('ground merge failed');
  for (const part of parts) part.dispose();
  return new THREE.Mesh(merged, assets.material);
}
