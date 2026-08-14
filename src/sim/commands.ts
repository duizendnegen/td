// Command types and application
// See ARCHITECTURE.md §4, §7
//
// Responsibilities:
//   - The ONLY input path into the sim
//   - Place / StartRemoval / Upgrade / Spawn / StartWave / Concede
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
  /** Typed debug/preset spawn: enemy type key, index into the active spawns. */
  | { kind: 'spawn'; type: string; spawn: number }
  | { kind: 'place'; structure: StructureKind; archetype?: TowerArchetype; tx: number; ty: number }
  /** Relocate the tower at (tx, ty) to (toTx, toTy) — build phase only. */
  | { kind: 'move'; tx: number; ty: number; toTx: number; toTy: number }
  | { kind: 'upgrade'; tx: number; ty: number }
  | { kind: 'remove'; tx: number; ty: number };

export type Command = CommandBody & { seq: number };

/** Drain sort key per kind; lower drains first. */
// `move` sits between `place` and `upgrade`: a same-tick place-then-move sees
// the placed structure. The tail renumbering preserves every pre-existing
// pairwise order, so replays of existing scripts drain identically.
const KIND_ORDER: Record<Command['kind'], number> = {
  noop: 0,
  startWave: 1,
  spawn: 2,
  place: 3,
  move: 4,
  upgrade: 5,
  remove: 6,
  concede: 7,
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
