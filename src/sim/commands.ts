// Command types and application
// See ARCHITECTURE.md §4, §7
//
// Responsibilities:
//   - The ONLY input path into the sim
//   - PlaceWall / PlaceTower / StartRemoval / Upgrade / StartWave
//   - Applied at tick boundaries in stable order

// Phase 1 ships the queue and ordering machinery with no state-mutating
// commands yet — placement lands in Phase 2. The drain order (command type,
// then issue sequence) is part of the determinism contract.

export type CommandBody = { kind: 'noop' };

export type Command = CommandBody & { seq: number };

/** Drain sort key per kind; lower drains first. */
const KIND_ORDER: Record<Command['kind'], number> = { noop: 0 };

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
