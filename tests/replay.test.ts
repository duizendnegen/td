// See ARCHITECTURE.md §12
//
// ENFORCES ARCHITECTURE.md §4. Golden hashes below were minted from runs
// whose fixed-point, RNG (reference-vector), flow-field, placement, theft,
// tower, upgrade and leak-harness tests were green first. Regenerating one is
// a deliberate act that means "the simulation intentionally changed" — never
// do it to make CI pass.
// Phase-3 note (design D10): both goldens were re-minted once in the
// phase-3-combat change, after the 1×1 footprint migration, the new state
// fields (enemy type/slowUntil, tower archetype/level), and the counter-
// matrix rebalance all landed. The scripted session exercises every phase-3
// mechanic: typed spawns, all four archetypes, an upgrade, a multi-kill, a
// slow application, and a removal refund with upgrades in the base.
import { describe, expect, it } from 'vitest';
import balanceJson from '../src/data/balance.json';
import levelJson from '../src/data/levels/level_01.json';
import { loadGameData } from '../src/data/schema';
import type { Command, CommandBody } from '../src/sim/commands';
import { toTile } from '../src/sim/fixed';
import { formatHash } from '../src/sim/hash';
import { Sim } from '../src/sim/sim';

const SEED = 0xc0ffee;
const TICKS = 2000;
/** Empty-command run: pure timer-spawn/steer/theft cycling. */
const GOLDEN_HASH = '05483642';
/** Scripted phase-3 session (see script below). */
const GOLDEN_SCRIPT_HASH = 'efa4666a';

function makeSim(): Sim {
  return new Sim(loadGameData(levelJson, balanceJson), SEED);
}

// The scripted session, against level_01's S-curve gauntlet. All four
// archetypes go up around the southern bend (the x=5 wall's gap); the fourth
// purchase dives into debt. Swarm spawns feed the area tower a multi-kill;
// tank spawns feed the sniper's strongest-rule; the timer's runners exercise
// slow and theft. Removing the level-1 rapid at 1300 refunds enough to bring
// the balance back to ≥ 0 at 1385, which funds the slow tower's upgrade —
// whose own removal then refunds 50% of base + upgrade (design D3).
let seq = 0;
const cmd = (body: CommandBody): Command => ({ ...body, seq: seq++ });
const spawnCmd = (type: string): Command => cmd({ kind: 'spawn', type, spawn: 0 });

function script(): ReadonlyMap<number, Command[]> {
  seq = 0;
  return new Map<number, Command[]>([
    [5, [cmd({ kind: 'place', structure: 'tower', archetype: 'rapid', tx: 6, ty: 14 })]],
    [10, [cmd({ kind: 'place', structure: 'tower', archetype: 'slow', tx: 4, ty: 13 })]],
    [15, [cmd({ kind: 'place', structure: 'tower', archetype: 'area', tx: 7, ty: 15 })]],
    [20, [cmd({ kind: 'place', structure: 'tower', archetype: 'sniper', tx: 9, ty: 12 })]],
    [60, Array.from({ length: 6 }, () => spawnCmd('swarm'))],
    [63, [spawnCmd('swarm'), spawnCmd('swarm')]],
    [600, [spawnCmd('tank')]],
    [630, [spawnCmd('tank')]],
    [660, [spawnCmd('tank')]],
    [690, [spawnCmd('tank')]],
    [720, [spawnCmd('tank')]],
    [1300, [cmd({ kind: 'remove', tx: 6, ty: 14 })]],
    [1385, [cmd({ kind: 'upgrade', tx: 4, ty: 13 })]],
    [1400, [spawnCmd('runner')]],
    [1450, [cmd({ kind: 'remove', tx: 4, ty: 13 })]],
  ]);
}

interface Milestones {
  allFourArchetypes: boolean;
  wentIntoDebt: boolean;
  upgraded: boolean;
  upgradedTowerRemoved: boolean;
  multiKillTick: boolean;
  slowApplied: boolean;
  treasuryGrab: boolean;
  escapeWithGold: boolean;
  kill: boolean;
}

/** Run the script, watching state transitions for every phase-3 behaviour. */
function runScripted(): { sim: Sim; seen: Milestones } {
  const sim = makeSim();
  const commands = script();
  const spawnTile = { x: 0, y: 10 };
  const seen: Milestones = {
    allFourArchetypes: false,
    wentIntoDebt: false,
    upgraded: false,
    upgradedTowerRemoved: false,
    multiKillTick: false,
    slowApplied: false,
    treasuryGrab: false,
    escapeWithGold: false,
    kill: false,
  };

  let prev = new Map<number, { mode: string; carriedMg: number; tx: number; ty: number }>();
  let prevLevels = new Map<number, number>();
  for (let t = 0; t < TICKS; t++) {
    sim.tick(commands.get(t) ?? []);
    const s = sim.state;

    const archetypes = new Set(s.structures.filter((x) => x.kind === 'tower').map((x) => x.archetypeId));
    if (archetypes.size === 4) seen.allFourArchetypes = true;
    if (s.treasuryMg < 0) seen.wentIntoDebt = true;
    if (s.structures.some((x) => x.level >= 2)) seen.upgraded = true;
    for (const [id, level] of prevLevels) {
      if (level >= 2 && !s.structures.some((x) => x.id === id)) seen.upgradedTowerRemoved = true;
    }
    if (s.enemies.some((e) => s.tick < e.slowUntil)) seen.slowApplied = true;

    const current = new Map<number, { mode: string; carriedMg: number; tx: number; ty: number }>();
    for (const e of s.enemies) {
      current.set(e.id, {
        mode: e.mode,
        carriedMg: e.carriedMg,
        tx: toTile(e.pos.x),
        ty: toTile(e.pos.y),
      });
    }
    for (const [id, now] of current) {
      const was = prev.get(id);
      if (!was) continue;
      if (was.mode === 'inbound' && now.mode === 'returning' && now.carriedMg > 0) {
        seen.treasuryGrab = true;
      }
    }
    let deathsThisTick = 0;
    for (const [id, was] of prev) {
      if (current.has(id)) continue;
      const escaped = was.tx === spawnTile.x && was.ty === spawnTile.y && was.mode === 'returning';
      if (escaped && was.carriedMg > 0) seen.escapeWithGold = true;
      if (!escaped) {
        seen.kill = true;
        deathsThisTick++;
      }
    }
    if (deathsThisTick >= 2) seen.multiKillTick = true;
    prev = current;
    prevLevels = new Map(s.structures.map((x) => [x.id, x.level]));
  }
  return { sim, seen };
}

describe('replay determinism', () => {
  it(`same seed, no commands: golden hash after ${TICKS} ticks`, () => {
    const sim = makeSim();
    for (let t = 0; t < TICKS; t++) sim.tick([]);
    expect(sim.state.tick).toBe(TICKS);
    expect(sim.state.enemies.length).toBeGreaterThan(0);
    expect(formatHash(sim.hash())).toBe(GOLDEN_HASH);
  });

  it('scripted phase-3 session exercises every mechanic and matches its golden hash', () => {
    const { sim, seen } = runScripted();
    // The script must actually produce each phase-3 behaviour — a milestone
    // going false means the script silently stopped covering that mechanic.
    expect(seen).toEqual({
      allFourArchetypes: true,
      wentIntoDebt: true,
      upgraded: true,
      upgradedTowerRemoved: true,
      multiKillTick: true,
      slowApplied: true,
      treasuryGrab: true,
      escapeWithGold: true,
      kill: true,
    });
    expect(formatHash(sim.hash())).toBe(GOLDEN_SCRIPT_HASH);
    // A second identical run reproduces the hash bit-for-bit.
    expect(formatHash(runScripted().sim.hash())).toBe(GOLDEN_SCRIPT_HASH);
  });

  it('display rate does not affect state: 1-tick steps == 5-tick bursts', () => {
    const oneAtATime = makeSim();
    for (let t = 0; t < TICKS; t++) oneAtATime.tick([]);

    const inBursts = makeSim();
    for (let t = 0; t < TICKS / 5; t++) {
      for (let burst = 0; burst < 5; burst++) inBursts.tick([]);
    }

    expect(inBursts.state.tick).toBe(oneAtATime.state.tick);
    expect(inBursts.hash()).toBe(oneAtATime.hash());
  });

  it(`no float leaks into sim state after a scripted ${TICKS}-tick session`, () => {
    const { sim } = runScripted();
    const s = sim.state;
    expect(Number.isInteger(s.tick)).toBe(true);
    expect(Number.isInteger(s.treasuryMg)).toBe(true);
    expect(Number.isInteger(s.nextEnemyId)).toBe(true);
    expect(Number.isInteger(s.nextStructureId)).toBe(true);
    expect(Number.isInteger(s.nextSackId)).toBe(true);
    for (const t of s.nextSpawnTicks) expect(Number.isInteger(t)).toBe(true);
    for (const e of s.enemies) {
      for (const v of [e.id, e.typeId, e.pos.x, e.pos.y, e.prevPos.x, e.prevPos.y, e.waypoint.x, e.waypoint.y, e.speed, e.hp, e.carriedMg, e.slowUntil]) {
        expect(Number.isInteger(v)).toBe(true);
      }
    }
    for (const st of s.structures) {
      for (const v of [st.id, st.tx, st.ty, st.archetypeId, st.level, st.paidMg, st.removalCompleteTick, st.nextFireTick]) {
        expect(Number.isInteger(v)).toBe(true);
      }
    }
    for (const sack of s.sacks) {
      for (const v of [sack.id, sack.tx, sack.ty, sack.amountMg]) {
        expect(Number.isInteger(v)).toBe(true);
      }
    }
  });
});
