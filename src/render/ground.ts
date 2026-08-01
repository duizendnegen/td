// Merged static ground geometry
// See ARCHITECTURE.md §8
//
// Responsibilities:
//   - 600 tiles merged into one draw call via mergeGeometries
//   - Rebuilt only when terrain changes

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Assets } from './assets';
import { tileToWorld } from './renderer';

export interface GroundLayout {
  width: number;
  height: number;
  /** tile-index lookup: true = blocked terrain */
  isBlocked: (tx: number, ty: number) => boolean;
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

  const spawnKeys = new Set(layout.spawns.map((s) => `${s.x},${s.y}`));
  const parts: THREE.BufferGeometry[] = [];
  for (let ty = 0; ty < layout.height; ty++) {
    for (let tx = 0; tx < layout.width; tx++) {
      const name = layout.isBlocked(tx, ty)
        ? 'tile-rock'
        : spawnKeys.has(`${tx},${ty}`)
          ? 'tile-spawn'
          : 'tile';
      const { x, z } = tileToWorld(tx, ty);
      parts.push(templateFor(name).clone().translate(x, 0, z));
    }
  }

  const merged = mergeGeometries(parts);
  if (!merged) throw new Error('ground merge failed');
  for (const part of parts) part.dispose();
  return new THREE.Mesh(merged, assets.material);
}
