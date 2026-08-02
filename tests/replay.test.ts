// See ARCHITECTURE.md §12
//
// ENFORCES ARCHITECTURE.md §4. Golden hashes below were minted from runs
// whose fixed-point, RNG (reference-vector), flow-field, placement, theft,
// tower, upgrade, wave, economy and leak-harness tests were green first.
// Regenerating one is a deliberate act that means "the simulation
// intentionally changed" — never do it to make CI pass.
// Phase-4 note (design D9): both goldens were re-minted once in the
// phase-4-the-run change, after the run state machine, wave scheduler,
// overdraw economy and terrain palette landed. The scripted session is a
// complete level_01 run: 10 waves started by command, every archetype and
// upgrades in play, a theft overdraw that drives the balance negative
// mid-wave, interceptions whose sacks settle home, and a solvent win.
import { describe, expect, it } from 'vitest';
import balanceJson from '../src/data/balance.json';
import levelJson from '../src/data/levels/level_01.json';
import { loadGameData } from '../src/data/schema';
import type { Command, CommandBody } from '../src/sim/commands';
import { formatHash } from '../src/sim/hash';
import { Sim } from '../src/sim/sim';

const SEED = 0xc0ffee;
/** Past the scripted win at tick 6232, at a round checkpoint. */
const TICKS = 6300;
/** Empty-command run: an inert build phase — nothing spawns without a wave. */
const GOLDEN_IDLE_HASH = '4af647ce';
/** Scripted full-run session (see script below). */
const GOLDEN_SCRIPT_HASH = 'e940caa1';

function makeSim(): Sim {
  return new Sim(loadGameData(levelJson, balanceJson), SEED);
}

// The full-run session against level_01. The opening trio (rapid/area/slow)
// holds the wall-B gap cluster — every enemy passes (10, 0..4) twice. The
// sniper deliberately arrives only after wave 4, so wave 3's runners grab
// from a thin treasury (the overdraw dips the balance below zero mid-wave)
// before dying on the way out. Upgrades ride the mid-run bounty income; wave
// 10 settles solvent and wins.
let seq = 0;
const cmd = (body: CommandBody): Command => ({ ...body, seq: seq++ });

function script(): ReadonlyMap<number, Command[]> {
  seq = 0;
  return new Map<number, Command[]>([
    [10, [cmd({ kind: 'place', structure: 'tower', archetype: 'rapid', tx: 9, ty: 2 })]],
    [11, [cmd({ kind: 'place', structure: 'tower', archetype: 'area', tx: 9, ty: 4 })]],
    [12, [cmd({ kind: 'place', structure: 'tower', archetype: 'slow', tx: 8, ty: 3 })]],
    [62, [cmd({ kind: 'startWave' })]],
    [396, [cmd({ kind: 'startWave' })]],
    [738, [cmd({ kind: 'place', structure: 'tower', archetype: 'rapid', tx: 11, ty: 1 })]],
    [788, [cmd({ kind: 'startWave' })]],
    [1489, [cmd({ kind: 'startWave' })]],
    [2180, [cmd({ kind: 'place', structure: 'tower', archetype: 'sniper', tx: 11, ty: 3 })]],
    [2230, [cmd({ kind: 'startWave' })]],
    [2949, [cmd({ kind: 'place', structure: 'tower', archetype: 'area', tx: 8, ty: 1 })]],
    [2999, [cmd({ kind: 'startWave' })]],
    [3659, [cmd({ kind: 'upgrade', tx: 9, ty: 2 })]],
    [3709, [cmd({ kind: 'startWave' })]],
    [4032, [cmd({ kind: 'upgrade', tx: 9, ty: 4 })]],
    [4082, [cmd({ kind: 'startWave' })]],
    [4717, [cmd({ kind: 'upgrade', tx: 11, ty: 3 })]],
    [4718, [cmd({ kind: 'upgrade', tx: 8, ty: 3 })]],
    [4768, [cmd({ kind: 'startWave' })]],
    [5475, [cmd({ kind: 'place', structure: 'tower', archetype: 'sniper', tx: 7, ty: 4 })]],
    [5525, [cmd({ kind: 'startWave' })]],
  ]);
}

interface Milestones {
  allFourArchetypes: boolean;
  allTenWavesStarted: boolean;
  overdrawnByTheft: boolean;
  sackDropped: boolean;
  buildPhasesSackFree: boolean;
  upgraded: boolean;
  interceptedEverything: boolean;
  wonSolvent: boolean;
}

/** Run the script, watching state transitions for every phase-4 behaviour. */
function runScripted(): { sim: Sim; seen: Milestones } {
  const sim = makeSim();
  const commands = script();
  const seen: Milestones = {
    allFourArchetypes: false,
    allTenWavesStarted: false,
    overdrawnByTheft: false,
    sackDropped: false,
    buildPhasesSackFree: true,
    upgraded: false,
    interceptedEverything: false,
    wonSolvent: false,
  };

  for (let t = 0; t < TICKS; t++) {
    sim.tick(commands.get(t) ?? []);
    const s = sim.state;
    const archetypes = new Set(s.structures.filter((x) => x.kind === 'tower').map((x) => x.archetypeId));
    if (archetypes.size === 4) seen.allFourArchetypes = true;
    if (s.waveIndex === 10) seen.allTenWavesStarted = true;
    // The theft overdraw: the balance goes negative DURING a wave, purely
    // from grabs — no settlement ever locks this run.
    if (s.runPhase === 'wave' && s.treasuryMg < 0) seen.overdrawnByTheft = true;
    if (s.sacks.length > 0) seen.sackDropped = true;
    // Settlement returns every sack: no build-phase tick ever holds one.
    if (s.runPhase === 'build' && s.sacks.length > 0) seen.buildPhasesSackFree = false;
    if (s.structures.some((x) => x.level >= 2)) seen.upgraded = true;
  }
  const end = sim.state;
  seen.interceptedEverything = end.stolenMg > 0 && end.escapedMg === 0;
  seen.wonSolvent = end.runPhase === 'won' && end.treasuryMg >= 0;
  return { sim, seen };
}

describe('replay determinism', () => {
  it(`same seed, no commands: an inert build phase and its golden hash after ${TICKS} ticks`, () => {
    const sim = makeSim();
    for (let t = 0; t < TICKS; t++) sim.tick([]);
    expect(sim.state.tick).toBe(TICKS);
    expect(sim.state.enemies).toHaveLength(0); // no wave, no spawns — ever
    expect(sim.state.runPhase).toBe('build');
    expect(sim.state.treasuryMg).toBe(200_000); // and no interest either
    expect(formatHash(sim.hash())).toBe(GOLDEN_IDLE_HASH);
  });

  it('scripted full run exercises every phase-4 behaviour and matches its golden hash', () => {
    const { sim, seen } = runScripted();
    // The script must actually produce each behaviour — a milestone going
    // false means the script silently stopped covering that mechanic.
    expect(seen).toEqual({
      allFourArchetypes: true,
      allTenWavesStarted: true,
      overdrawnByTheft: true,
      sackDropped: true,
      buildPhasesSackFree: true,
      upgraded: true,
      interceptedEverything: true,
      wonSolvent: true,
    });
    expect(sim.state.kills).toBe(156);
    expect(formatHash(sim.hash())).toBe(GOLDEN_SCRIPT_HASH);
    // A second identical run reproduces the hash bit-for-bit.
    expect(formatHash(runScripted().sim.hash())).toBe(GOLDEN_SCRIPT_HASH);
  });

  it('display rate does not affect state: 1-tick steps == 5-tick bursts', () => {
    const commands = script();
    const oneAtATime = makeSim();
    for (let t = 0; t < 3000; t++) oneAtATime.tick(commands.get(t) ?? []);

    const commands2 = script();
    const inBursts = makeSim();
    for (let t = 0; t < 3000 / 5; t++) {
      for (let burst = 0; burst < 5; burst++) {
        inBursts.tick(commands2.get(inBursts.state.tick) ?? []);
      }
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
    for (const v of [s.waveIndex, s.waveStartTick, s.stolenMg, s.escapedMg, s.kills]) {
      expect(Number.isInteger(v)).toBe(true);
    }
    for (const c of s.groupCursors) expect(Number.isInteger(c)).toBe(true);
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
