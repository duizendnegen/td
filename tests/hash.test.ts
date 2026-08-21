// See ARCHITECTURE.md §12 and design D-P1-2: the hash walks ALL sim state, so
// any single-field divergence is visible at the tick it happens.
import { describe, expect, it } from 'vitest';
import { hashState } from '../src/sim/hash';
import { openLedger, type Enemy, type SimState } from '../src/sim/types';

function makeEnemy(id: number): Enemy {
  return {
    id,
    typeId: 0,
    originSpawn: 0,
    pos: { x: 512, y: 10752 },
    prevPos: { x: 512, y: 10752 },
    waypoint: { x: 1536, y: 10752 },
    speed: 120,
    mode: 'inbound',
    hp: 130,
    carriedMg: 0,
    slowUntil: 0,
    alive: true,
  };
}

function makeState(): SimState {
  return {
    tick: 17,
    treasuryMg: 200_000,
    enemies: [makeEnemy(0), makeEnemy(1)],
    nextEnemyId: 2,
    structures: [
      {
        id: 0,
        kind: 'wall',
        tx: 4,
        ty: 5,
        archetypeId: -1,
        level: 0,
        paidMg: 4000,
        nextFireTick: 0,
        provisional: false,
        waveDamage: 0,
        totalDamage: 0,
      },
      {
        id: 1,
        kind: 'tower',
        tx: 8,
        ty: 5,
        archetypeId: 0,
        level: 1,
        paidMg: 50_000,
        nextFireTick: 20,
        provisional: false,
        waveDamage: 120,
        totalDamage: 900,
      },
    ],
    nextStructureId: 2,
    sacks: [{ id: 0, tx: 6, ty: 5, amountMg: 25_000 }],
    nextSackId: 1,
    runPhase: 'wave',
    waveIndex: 1,
    waveStartTick: 4,
    groupCursors: [2, 0],
    stolenMg: 25_000,
    escapedMg: 0,
    kills: 3,
    lastWaveBonusMg: 12_000,
    gridTier: 1,
    storedMpTick: 60_000,
    // Both slots populated, so a field flip in either is a real change.
    ledger: { ...openLedger(180_000), waveNo: 1, bountiesMg: 18_000, billMg: 240, engagedMp: 31_000 },
    lastLedger: { ...openLedger(150_000), waveNo: 0, constructionMg: 54_000 },
  };
}

const RNG_STATE = [0x1234, 0x5678, 0x9abc, 0xdef0] as const;

describe('state hash', () => {
  it('is stable for identical states', () => {
    expect(hashState(makeState(), RNG_STATE)).toBe(hashState(makeState(), RNG_STATE));
  });

  it('changes when any single field changes', () => {
    const base = hashState(makeState(), RNG_STATE);

    const mutations: ((s: SimState) => void)[] = [
      (s) => s.tick++,
      (s) => s.treasuryMg--,
      (s) => s.nextEnemyId++,
      (s) => s.enemies[1]!.pos.x++,
      (s) => s.enemies[1]!.pos.y--,
      (s) => s.enemies[0]!.waypoint.x++,
      (s) => s.enemies[0]!.speed++,
      (s) => s.enemies[0]!.id++,
      (s) => s.enemies.pop(),
      // Phase-2 fields — every one must be visible to the hash.
      (s) => (s.enemies[0]!.mode = 'returning'),
      (s) => s.enemies[0]!.hp--,
      (s) => (s.enemies[1]!.carriedMg += 1000),
      (s) => (s.enemies[1]!.alive = false),
      // Phase-3 fields.
      (s) => (s.enemies[0]!.slowUntil = 60),
      (s) => s.structures[1]!.archetypeId++,
      (s) => s.structures[1]!.level++,
      (s) => s.nextStructureId++,
      (s) => s.structures.pop(),
      (s) => (s.structures[0]!.kind = 'tower'),
      (s) => s.structures[0]!.tx++,
      (s) => s.structures[0]!.ty--,
      (s) => s.structures[0]!.paidMg++,
      (s) => s.structures[1]!.nextFireTick++,
      (s) => s.nextSackId++,
      (s) => s.sacks.pop(),
      (s) => s.sacks[0]!.tx++,
      (s) => s.sacks[0]!.ty++,
      (s) => s.sacks[0]!.amountMg--,
      // Phase-4 fields: the run state machine and the summary counters.
      (s) => (s.runPhase = 'build'),
      (s) => s.waveIndex++,
      (s) => s.waveStartTick++,
      (s) => s.groupCursors[0]!++,
      (s) => s.groupCursors.pop(),
      (s) => (s.stolenMg += 1000),
      (s) => (s.escapedMg += 1000),
      (s) => s.kills++,
      // Balance-ux-tweaks field: the settlement speed bonus.
      (s) => (s.lastWaveBonusMg += 1000),
      // Provisional-construction field: the uncommitted flag per structure.
      (s) => (s.structures[0]!.provisional = true),
      // Return-to-origin-spawn field: the enemy's declared origin spawn.
      (s) => s.enemies[0]!.originSpawn++,
      // Tower-damage-stats fields: both per-structure damage counters
      // ("Both counters are hashed" — two states differing only in one
      // tower's total damage hash differently).
      (s) => s.structures[1]!.waveDamage++,
      (s) => s.structures[1]!.totalDamage++,
      // Energy-infrastructure: the grid tier, and the panel as a distinct kind.
      (s) => s.gridTier++,
      (s) => (s.structures[0]!.kind = 'panel'),
      // Wave-ledger: both slots are hashed state ("hashed state" requirement)
      // — the open period's bill row and the closed period's wave number.
      (s) => (s.ledger.billMg += 1),
      (s) => (s.lastLedger.waveNo = 3),
      // Add-battery: the pooled store ("The store is hashed"), the battery
      // as a kind distinct from the panel, and the two new ledger rows.
      (s) => (s.storedMpTick += 1),
      (s) => (s.structures[0]!.kind = 'battery'),
      (s) => (s.ledger.chargedMp += 1),
      (s) => (s.lastLedger.batteryMp += 1),
    ];
    for (const mutate of mutations) {
      const state = makeState();
      mutate(state);
      expect(hashState(state, RNG_STATE)).not.toBe(base);
    }

    // RNG state is inside the hash too.
    expect(hashState(makeState(), [0x1235, 0x5678, 0x9abc, 0xdef0])).not.toBe(base);
  });

  it('hashes the battery kind distinctly from every other kind', () => {
    const hashes = (['wall', 'tower', 'panel', 'battery'] as const).map((kind) => {
      const state = makeState();
      state.structures[0]!.kind = kind;
      return hashState(state, RNG_STATE);
    });
    expect(new Set(hashes).size).toBe(4);
  });

  it('ignores prevPos — the render-only interpolation snapshot', () => {
    const state = makeState();
    const base = hashState(state, RNG_STATE);
    state.enemies[0]!.prevPos.x += 999;
    expect(hashState(state, RNG_STATE)).toBe(base);
  });
});
