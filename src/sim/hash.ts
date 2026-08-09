// FNV-1a state hash for replay verification
// See ARCHITECTURE.md §4, §12
//
// Responsibilities:
//   - Canonical serialisation of sim state
//   - Stable field order — order is part of the determinism contract

// ONE canonical walk over ALL sim state (design D-P1-2). Anything added to
// types.ts gets a line here in the same commit. prevPos is deliberately
// absent: it is the renderer's interpolation snapshot, not sim state.

import { ENEMY_STATE_ID, RUN_PHASE_ID, STRUCTURE_KIND_ID, type SimState } from './types';

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/** Fold one int32 into the hash, byte by byte, little-endian. */
function mix(h: number, value: number): number {
  for (let shift = 0; shift < 32; shift += 8) {
    h = (h ^ ((value >>> shift) & 0xff)) >>> 0;
    h = Math.imul(h, FNV_PRIME) >>> 0;
  }
  return h;
}

export function hashState(state: SimState, rngState: readonly number[]): number {
  let h = FNV_OFFSET;
  h = mix(h, state.tick);
  for (const s of rngState) h = mix(h, s);
  h = mix(h, state.treasuryMg);
  h = mix(h, RUN_PHASE_ID[state.runPhase]);
  h = mix(h, state.waveIndex);
  h = mix(h, state.waveStartTick);
  h = mix(h, state.groupCursors.length);
  for (const c of state.groupCursors) h = mix(h, c);
  h = mix(h, state.stolenMg);
  h = mix(h, state.escapedMg);
  h = mix(h, state.kills);
  h = mix(h, state.lastWaveBonusMg);
  h = mix(h, state.nextEnemyId);
  h = mix(h, state.enemies.length);
  for (const e of state.enemies) {
    h = mix(h, e.id);
    h = mix(h, e.typeId);
    h = mix(h, e.originSpawn);
    h = mix(h, e.pos.x);
    h = mix(h, e.pos.y);
    h = mix(h, e.waypoint.x);
    h = mix(h, e.waypoint.y);
    h = mix(h, e.speed);
    h = mix(h, ENEMY_STATE_ID[e.mode]);
    h = mix(h, e.hp);
    h = mix(h, e.carriedMg);
    h = mix(h, e.slowUntil);
    h = mix(h, e.alive ? 1 : 0);
  }
  h = mix(h, state.nextStructureId);
  h = mix(h, state.structures.length);
  for (const s of state.structures) {
    h = mix(h, s.id);
    h = mix(h, STRUCTURE_KIND_ID[s.kind]);
    h = mix(h, s.tx);
    h = mix(h, s.ty);
    h = mix(h, s.archetypeId);
    h = mix(h, s.level);
    h = mix(h, s.paidMg);
    h = mix(h, s.nextFireTick);
    h = mix(h, s.provisional ? 1 : 0);
  }
  h = mix(h, state.nextSackId);
  h = mix(h, state.sacks.length);
  for (const s of state.sacks) {
    h = mix(h, s.id);
    h = mix(h, s.tx);
    h = mix(h, s.ty);
    h = mix(h, s.amountMg);
  }
  return h;
}

/** Canonical display form: fixed-width lowercase hex. */
export function formatHash(h: number): string {
  return h.toString(16).padStart(8, '0');
}
