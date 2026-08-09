// Lane ribbon: the routes traffic takes, and what a candidate placement
// would do to them
// See ARCHITECTURE.md §8, §9 and the path-preview design D4, D5, D7
//
// Responsibilities:
//   - Three dashed line sets classified per segment: shared / current-only /
//     projected-only, shared segments drawn once (D4)
//   - Marching dashes scrolling toward each lane's destination, animated by
//     a shader phase uniform — never by rebuilding geometry (D5)
//   - Tile fill over the region a sealing placement would orphan (D6)
//   - Reads sim-supplied lane arrays only; never touches sim state

import * as THREE from 'three';
import type { TileXY } from '../sim/flowfield';
import { GROUND_TOP_Y } from './renderer';

const RIBBON_Y = GROUND_TOP_Y + 0.04;
const SHADE_Y = GROUND_TOP_Y + 0.02;

/**
 * Colours from the STYLEGUIDE token set (design D7) — this is a player
 * surface, so it uses the theme rather than debug.ts's literals.
 */
const CLASS_COLORS = {
  /** on-surface-variant: the baseline lane, and every unchanged tile. */
  shared: 0xd0c6ab,
  /** secondary-fixed-dim (bronze): traffic the placement would take away. */
  current: 0xffb779,
  /** tertiary-container (emerald): traffic the placement would create. */
  projected: 0x65f2b5,
} as const;
/** error-container: the region a sealing placement would cut off. */
const ORPHAN_COLOR = 0x93000a;
const ORPHAN_OPACITY = 0.42;

type LaneClass = keyof typeof CLASS_COLORS;
const CLASSES: LaneClass[] = ['shared', 'current', 'projected'];

/** Dash geometry in tile units, and how fast the pattern marches (tiles/s). */
const DASH_LEN = 0.34;
const GAP_LEN = 0.3;
const MARCH_TILES_PER_SEC = 1.6;

const VERTEX_SHADER = `
attribute float aDist;
varying float vDist;
void main() {
  vDist = aDist;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

// Dashes are cut in the fragment stage from the distance-along-lane
// attribute, so marching them is a uniform write rather than new geometry.
// The colorspace include is what every stock material appends — without it
// the tokens would land on the sRGB framebuffer as raw linear values.
const FRAGMENT_SHADER = `
uniform vec3 uColor;
uniform float uPhase;
varying float vDist;
void main() {
  float period = ${(DASH_LEN + GAP_LEN).toFixed(4)};
  if (mod(vDist - uPhase, period) > ${DASH_LEN.toFixed(4)}) discard;
  gl_FragColor = vec4(uColor, 1.0);
  #include <colorspace_fragment>
}`;

const tileKey = (t: TileXY): number => t.y * 4096 + t.x;
const segmentKey = (a: TileXY, b: TileXY): string => `${tileKey(a)}>${tileKey(b)}`;

/** Vertex pairs plus the distance-along-lane of each, per classification. */
interface SegmentSet {
  positions: number[];
  distances: number[];
}

/**
 * Classify every lane segment and emit the three line sets (design D4).
 *
 * Lanes are paired by index — inbound lane i against inbound lane i, return
 * against return — so one spawn's reroute is never attributed to another's.
 * With no projection every segment lands in `shared`, which is exactly the
 * plain-lane look the unarmed-hover state wants.
 *
 * Distances accumulate from each lane's start, so a lane that changes
 * classification mid-route keeps one continuous dash rhythm across the seam.
 */
function classify(
  current: readonly TileXY[][],
  projected: readonly TileXY[][] | null,
): Record<LaneClass, SegmentSet> {
  const sets: Record<LaneClass, SegmentSet> = {
    shared: { positions: [], distances: [] },
    current: { positions: [], distances: [] },
    projected: { positions: [], distances: [] },
  };
  // Shared segments appear in both lanes of a pair; the first one wins.
  const drawnShared = new Set<string>();

  // Sharing is a property of the segment, not its endpoints: around a
  // diverge-and-rejoin both end tiles can sit on both lanes while the edge
  // between them belongs to only one (a ghost outlawing a diagonal reroutes
  // B→C into B→X→C with B and C on both lanes).
  const laneSegments = (lane: readonly TileXY[]): Set<string> => {
    const segs = new Set<string>();
    for (let i = 0; i < lane.length - 1; i++) segs.add(segmentKey(lane[i]!, lane[i + 1]!));
    return segs;
  };

  // `other` is null when there is nothing to compare against — no ghost, or a
  // verdict that produced no projection. Then every segment is shared, which
  // is what makes those states indistinguishable from an unarmed hover.
  const emit = (lane: readonly TileXY[], other: Set<string> | null, own: LaneClass): void => {
    let dist = 0;
    for (let i = 0; i < lane.length - 1; i++) {
      const a = lane[i]!;
      const b = lane[i + 1]!;
      const step = Math.hypot(b.x - a.x, b.y - a.y);
      const shared = other === null || other.has(segmentKey(a, b));
      const target = shared ? 'shared' : own;
      if (!shared || !drawnShared.has(segmentKey(a, b))) {
        if (shared) drawnShared.add(segmentKey(a, b));
        const set = sets[target];
        set.positions.push(a.x + 0.5, RIBBON_Y, a.y + 0.5, b.x + 0.5, RIBBON_Y, b.y + 0.5);
        set.distances.push(dist, dist + step);
      }
      dist += step;
    }
  };

  const laneCount = Math.max(current.length, projected?.length ?? 0);
  for (let i = 0; i < laneCount; i++) {
    const now = current[i] ?? [];
    const soon = projected?.[i] ?? null;
    const soonSegs = soon === null ? null : laneSegments(soon);
    emit(now, soonSegs, 'current');
    if (soon) emit(soon, laneSegments(now), 'projected');
  }
  return sets;
}

/** Cheap change key over the emitted geometry — the D8 rebuild guard. */
function signature(
  sets: Record<LaneClass, SegmentSet>,
  orphaned: readonly TileXY[] | null,
): string {
  const parts = CLASSES.map((c) => sets[c].positions.join(','));
  parts.push(orphaned === null ? '-' : orphaned.map(tileKey).join(','));
  return parts.join('|');
}

export class LaneRibbon {
  private readonly scene: THREE.Scene;
  private readonly group = new THREE.Group();
  private readonly materials: Record<LaneClass, THREE.ShaderMaterial>;
  private readonly lines: Record<LaneClass, THREE.LineSegments>;
  private readonly shadeMaterial: THREE.MeshBasicMaterial;
  private readonly shade: THREE.Mesh;
  /** Geometry signature currently on screen; unchanged means no rebuild. */
  private built: string | null = null;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.group.visible = false;

    this.materials = {} as Record<LaneClass, THREE.ShaderMaterial>;
    this.lines = {} as Record<LaneClass, THREE.LineSegments>;
    for (const c of CLASSES) {
      const material = new THREE.ShaderMaterial({
        vertexShader: VERTEX_SHADER,
        fragmentShader: FRAGMENT_SHADER,
        uniforms: {
          uColor: { value: new THREE.Color(CLASS_COLORS[c]) },
          uPhase: { value: 0 },
        },
        transparent: true,
        depthWrite: false,
      });
      const line = new THREE.LineSegments(new THREE.BufferGeometry(), material);
      // Lanes are authored in world space; the ribbon never moves as a whole.
      line.frustumCulled = false;
      this.materials[c] = material;
      this.lines[c] = line;
      this.group.add(line);
    }

    this.shadeMaterial = new THREE.MeshBasicMaterial({
      color: ORPHAN_COLOR,
      transparent: true,
      opacity: ORPHAN_OPACITY,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.shade = new THREE.Mesh(new THREE.BufferGeometry(), this.shadeMaterial);
    this.shade.frustumCulled = false;
    this.shade.visible = false;
    this.group.add(this.shade);

    scene.add(this.group);
  }

  /**
   * Show the ribbon for `current` lanes, optionally against the `projected`
   * lanes of the tile under the ghost and the region that placement would
   * orphan. Geometry is rebuilt only when the classification actually
   * changed, so a still cursor over a still board costs a string compare.
   */
  update(
    current: readonly TileXY[][],
    projected: readonly TileXY[][] | null,
    orphaned: readonly TileXY[] | null,
  ): void {
    this.group.visible = true;
    const sets = classify(current, projected);
    const key = signature(sets, orphaned);
    if (key === this.built) return;
    this.built = key;

    for (const c of CLASSES) {
      const { positions, distances } = sets[c];
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('aDist', new THREE.Float32BufferAttribute(distances, 1));
      this.lines[c].geometry.dispose();
      this.lines[c].geometry = geometry;
    }
    this.rebuildShade(orphaned);
  }

  /** One quad per orphaned tile, merged into a single mesh (design D6). */
  private rebuildShade(orphaned: readonly TileXY[] | null): void {
    this.shade.geometry.dispose();
    if (!orphaned || orphaned.length === 0) {
      this.shade.geometry = new THREE.BufferGeometry();
      this.shade.visible = false;
      return;
    }
    const positions: number[] = [];
    for (const t of orphaned) {
      const x0 = t.x + 0.03;
      const x1 = t.x + 0.97;
      const z0 = t.y + 0.03;
      const z1 = t.y + 0.97;
      positions.push(x0, SHADE_Y, z0, x1, SHADE_Y, z0, x1, SHADE_Y, z1);
      positions.push(x0, SHADE_Y, z0, x1, SHADE_Y, z1, x0, SHADE_Y, z1);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    this.shade.geometry = geometry;
    this.shade.visible = true;
  }

  /** Advance the marching dashes; called every frame while visible. */
  animate(nowMs: number): void {
    if (!this.group.visible) return;
    const phase = (nowMs / 1000) * MARCH_TILES_PER_SEC;
    for (const c of CLASSES) {
      this.materials[c].uniforms['uPhase']!.value = phase;
    }
  }

  /** Hide and drop the geometry — the ribbon exists only while armed. */
  hide(): void {
    if (!this.group.visible && this.built === null) return;
    this.group.visible = false;
    for (const c of CLASSES) {
      this.lines[c].geometry.dispose();
      this.lines[c].geometry = new THREE.BufferGeometry();
    }
    this.shade.geometry.dispose();
    this.shade.geometry = new THREE.BufferGeometry();
    this.shade.visible = false;
    this.built = null;
  }

  /** Full teardown; the scene owns nothing of the ribbon afterwards. */
  dispose(): void {
    this.hide();
    this.scene.remove(this.group);
    for (const c of CLASSES) {
      this.lines[c].geometry.dispose();
      this.materials[c].dispose();
    }
    this.shade.geometry.dispose();
    this.shadeMaterial.dispose();
  }
}
