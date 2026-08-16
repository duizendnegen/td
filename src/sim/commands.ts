// Command types and application
// See ARCHITECTURE.md §4, §7
//
// Responsibilities:
//   - The ONLY input path into the sim
//   - Place / Move / Upgrade / UpgradeGrid / Remove / Spawn / StartWave / Concede
//   - Applied at tick boundaries in stable order

// The drain order (command type, then issue sequence) is part of the
// determinism contract.

import type { TowerArchetype } from '../data/schema';
import type { StructureKind } from './types';

export type CommandBody =
  | { kind: 'noop' }
  /** Start the next wave (run-lifecycle spec: solvency-gated, build phase only). */
  | { kind: 'startWave' }
  /** End the run as lost, from any live phase (run-lifecycle spec). */
  | { kind: 'concede' }
  /**
   * Typed debug/preset spawn: enemy type key, index into the DECLARED spawn
   * list (stable across activations); dormant or out-of-range is rejected.
   */
  | { kind: 'spawn'; type: string; spawn: number }
  /**
   * Place a structure. `withWall` on a tower builds the wall beneath it in
   * the same command (build-over-walls design D6): the wall's full placement
   * validation decides, both land or neither does, and both costs are
   * charged — the tower tool's one click on bare dirt.
   */
  | {
      kind: 'place';
      structure: StructureKind;
      archetype?: TowerArchetype;
      tx: number;
      ty: number;
      withWall?: boolean;
    }
  /** Relocate the tower at (tx, ty) to (toTx, toTy) — build phase only. */
  | { kind: 'move'; tx: number; ty: number; toTx: number; toTy: number }
  | { kind: 'upgrade'; tx: number; ty: number }
  /**
   * Buy the next grid connection tier (power-grid spec): any live phase, the
   * spending gate, one-way — no refund, no provisional state.
   */
  | { kind: 'upgradeGrid' }
  | { kind: 'remove'; tx: number; ty: number };

export type Command = CommandBody & { seq: number };

/** Drain sort key per kind; lower drains first. */
// `move` sits between `place` and `upgrade`: a same-tick place-then-move sees
// the placed structure. `upgradeGrid` sits after `upgrade` and before
// `remove` (energy-infrastructure design D6), so a same-tick
// place/upgrade/upgradeGrid/remove sequence keeps the intuitive order. Each
// tail renumbering preserves every pre-existing pairwise order, so replays of
// existing scripts drain identically.
const KIND_ORDER: Record<Command['kind'], number> = {
  noop: 0,
  startWave: 1,
  spawn: 2,
  place: 3,
  move: 4,
  upgrade: 5,
  upgradeGrid: 6,
  remove: 7,
  concede: 8,
};

export class CommandQueue {
  private seq = 0;
  private pending: Command[] = [];

  issue(body: CommandBody): void {
    this.pending.push({ ...body, seq: this.seq++ });
  }

  /** All queued commands in deterministic apply order; empties the queue. */
  drain(): Command[] {
    const drained = this.pending;
    this.pending = [];
    drained.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.seq - b.seq);
    return drained;
  }
}
