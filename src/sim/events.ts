// Render-only event channel (phase-2 design D8)
//
// Events ride sim → render one way: the renderer drains them each frame, the
// sim never reads them back, and they are excluded from the state hash.
// Positions are in fixed-point sim units; the renderer converts.

import type { FootprintTile } from './placement';

export type RenderEvent =
  | {
      kind: 'tracer';
      towerId: number;
      archetypeId: number;
      fromX: number;
      fromY: number;
      toX: number;
      toY: number;
    }
  | { kind: 'aoeBurst'; towerId: number; x: number; y: number; radiusUnits: number }
  | { kind: 'placementRejected'; tiles: FootprintTile[] }
  /** An enemy escaped through a spawn, taking its carried gold out of play. */
  | { kind: 'goldLeaked'; enemyId: number; amountMg: number };
