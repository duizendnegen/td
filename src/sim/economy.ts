// Treasury, theft, bounties
// See ARCHITECTURE.md §5 and the phase-2 theft-economy spec
//
// Responsibilities:
//   - Balance held in milli-gold; spending gated at 0, not at cost
//   - Treasury grab-and-flip, spawn escape, gold sacks
//   - Deaths: bounty credit and carrier sack drops
//   - (Interest and bankruptcy are Phase 4)

import type { RenderEvent } from './events';
import { tileCentre, toTile } from './fixed';
import type { Enemy, SimState } from './types';

/** Design D4: any purchase is permitted at balance ≥ 0 — even into debt. */
export function canSpend(treasuryMg: number): boolean {
  return treasuryMg >= 0;
}

/** Merge-per-tile sack drop (design D7). */
export function dropSack(state: SimState, tx: number, ty: number, amountMg: number): void {
  if (amountMg <= 0) return;
  for (const s of state.sacks) {
    if (s.tx === tx && s.ty === ty) {
      s.amountMg += amountMg;
      return;
    }
  }
  state.sacks.push({ id: state.nextSackId++, tx, ty, amountMg });
}

/**
 * Tick step 6, one pass in insertion order per enemy: sack pickup on the
 * current tile, then treasury grab-and-flip, then spawn escape. Same-tick
 * sack contention therefore resolves by insertion order for free.
 */
export function resolveArrivals(
  state: SimState,
  treasury: { x: number; y: number },
  activeSpawns: readonly { x: number; y: number }[],
  carryMgByType: readonly number[],
  events: RenderEvent[],
): void {
  const treasuryX = tileCentre(treasury.x);
  const treasuryY = tileCentre(treasury.y);
  let sackDrained = false;

  for (const e of state.enemies) {
    if (!e.alive) continue;
    const etx = toTile(e.pos.x);
    const ety = toTile(e.pos.y);
    const carryMg = carryMgByType[e.typeId]!;

    // Sack pickup — both modes; an inbound enemy that takes anything flips.
    const capacityLeft = carryMg - e.carriedMg;
    if (capacityLeft > 0) {
      for (const s of state.sacks) {
        if (s.tx !== etx || s.ty !== ety || s.amountMg <= 0) continue;
        const take = Math.min(capacityLeft, s.amountMg);
        s.amountMg -= take;
        e.carriedMg += take;
        if (s.amountMg <= 0) sackDrained = true;
        if (e.mode === 'inbound') e.mode = 'returning';
        break; // one sack per tile (design D7)
      }
    }

    // Treasury: clamped grab, unconditional flip — never a despawn.
    if (e.mode === 'inbound' && e.pos.x === treasuryX && e.pos.y === treasuryY) {
      const grab = Math.min(carryMg - e.carriedMg, Math.max(0, state.treasuryMg));
      state.treasuryMg -= grab;
      e.carriedMg += grab;
      e.mode = 'returning';
    }

    // Spawn escape: the enemy and its gold leave play permanently. The event
    // is render-only (leak feedback, harness instrumentation) — not hashed.
    if (e.mode === 'returning') {
      for (const s of activeSpawns) {
        if (e.pos.x === tileCentre(s.x) && e.pos.y === tileCentre(s.y)) {
          e.alive = false;
          events.push({ kind: 'goldLeaked', enemyId: e.id, amountMg: e.carriedMg });
          break;
        }
      }
    }
  }

  if (sackDrained) {
    state.sacks = state.sacks.filter((s) => s.amountMg > 0);
  }
}

/**
 * Tick step 8: every enemy at 0 hp or below dies this tick — bounty to the
 * treasury, carried gold to a sack on the death tile, tombstone for the
 * step-10 compaction.
 */
export function resolveDeaths(state: SimState, bountyMgByType: readonly number[]): void {
  for (const e of state.enemies) {
    if (!e.alive || e.hp > 0) continue;
    e.alive = false;
    state.treasuryMg += bountyMgByType[e.typeId]!;
    dropSack(state, toTile(e.pos.x), toTile(e.pos.y), e.carriedMg);
    e.carriedMg = 0;
  }
}

/** Remaining carry capacity, for pickup and UI display. */
export function capacityLeftMg(e: Enemy, carryMgByType: readonly number[]): number {
  return carryMgByType[e.typeId]! - e.carriedMg;
}
