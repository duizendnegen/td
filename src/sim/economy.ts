// Treasury, theft, bounties, interest, settlement
// See ARCHITECTURE.md §5 and the phase-4 theft-economy spec
//
// Responsibilities:
//   - Balance held in milli-gold; spending gated at 0, not at cost
//   - Treasury grab-and-flip (full-capacity overdraw), spawn escape, sacks
//   - Deaths: bounty credit and carrier sack drops
//   - Interest in integer ppm (design D3); end-of-wave sack return
//   - Run summary counters accumulate where the gold moves

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

    // Treasury: full-capacity grab (phase-4 theft-economy spec — the balance
    // overdraws when the treasury holds less), unconditional flip — never a
    // despawn.
    if (e.mode === 'inbound' && e.pos.x === treasuryX && e.pos.y === treasuryY) {
      const grab = carryMg - e.carriedMg;
      state.treasuryMg -= grab;
      state.stolenMg += grab;
      e.carriedMg += grab;
      e.mode = 'returning';
    }

    // Spawn escape: the enemy and its gold leave play permanently. The event
    // is render-only (leak feedback, harness instrumentation) — not hashed.
    if (e.mode === 'returning') {
      for (const s of activeSpawns) {
        if (e.pos.x === tileCentre(s.x) && e.pos.y === tileCentre(s.y)) {
          e.alive = false;
          state.escapedMg += e.carriedMg;
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
    state.kills++;
    state.treasuryMg += bountyMgByType[e.typeId]!;
    dropSack(state, toTile(e.pos.x), toTile(e.pos.y), e.carriedMg);
    e.carriedMg = 0;
  }
}

/**
 * Step-9 interest accrual (design D3): integer ppm, floor-truncated, only on
 * a positive balance — the wave/build gating lives in the tick's step 9.
 */
export function accrueInterest(state: SimState, ratePpm: number): void {
  if (state.treasuryMg > 0) {
    state.treasuryMg += Math.floor((state.treasuryMg * ratePpm) / 1_000_000);
  }
}

/**
 * Settlement's wave speed bonus (balance-ux-tweaks design D4): full base
 * within graceTicks of the wave's last scheduled spawn, then a linear
 * integer-mg decay to zero over decayTicks. Pure — the caller credits it.
 */
export function waveBonusMg(
  durationTicks: number,
  lastSpawnOffsetTicks: number,
  cfg: { baseMg: number; graceTicks: number; decayTicks: number },
): number {
  const over = Math.max(0, durationTicks - (lastSpawnOffsetTicks + cfg.graceTicks));
  if (over >= cfg.decayTicks) return 0;
  return Math.floor((cfg.baseMg * (cfg.decayTicks - over)) / cfg.decayTicks);
}

/**
 * Settlement's sack return: every unclaimed sack credits in full, in
 * insertion order (theft-economy spec).
 */
export function returnSacks(state: SimState): void {
  for (const s of state.sacks) state.treasuryMg += s.amountMg;
  state.sacks = [];
}

/**
 * Total refund value of every standing structure, in milli-gold — the
 * liquidation query behind the impossible-recovery notice (design D8).
 * Derived on demand, never stored.
 */
export function liquidationTotalMg(
  structures: readonly { paidMg: number }[],
  refundPer1000: number,
): number {
  let total = 0;
  for (const s of structures) total += Math.floor((s.paidMg * refundPer1000) / 1000);
  return total;
}

/** Remaining carry capacity, for pickup and UI display. */
export function capacityLeftMg(e: Enemy, carryMgByType: readonly number[]): number {
  return carryMgByType[e.typeId]! - e.carriedMg;
}
