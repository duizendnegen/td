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
// Balance-ux-tweaks note: goldens re-minted once more — the 20×10 level_01,
// the retuned costs, and the wave speed bonus (new hashed field) all change
// the trajectory, so the script was re-derived against the new board.
// Instant-between-wave-selling note: GOLDEN_SCRIPT_HASH alone was re-minted.
// Immediate removal dropped `removalCompleteTick` from Structure, so the
// canonical walk lost one mixed field per structure — the hash layout changed
// while the trajectory did not (the script issues no remove commands, and
// every milestone below still holds, kills included). GOLDEN_IDLE_HASH was
// deliberately NOT touched: that run places nothing, so the walk never reaches
// structure fields. If it ever moves, the edit reached further than intended.
// Provisional-construction note: GOLDEN_SCRIPT_HASH alone was re-minted again,
// for the same reason in reverse — `Structure.provisional` adds one mixed field
// per structure. The trajectory is untouched: the flag is read only by the
// removal path, this script issues no removals, and every milestone below still
// holds (kills included, at 156). GOLDEN_IDLE_HASH again did NOT move.
// Scale-world-experiment note: both goldens re-minted, deliberately — the
// 40×20 board, the playtest-calibrated balance (ranges ×1.8, hp ×2, wall 3,
// carrier 130%, sack recovery 900/1000) and level_01's startingTreasury of
// 500 (hashed) change both the trajectory and the idle state. The script was
// re-derived against the new board (tests/_scriptgen harness) and now also
// exercises mid-wave placement (reactive walls during wave 3, committing
// under a live wave) and command-injected spawns (two extra tanks in wave 5),
// so kills pin at 158: the 156 authored enemies plus the two injections.
import { describe, expect, it } from 'vitest';
import balanceJson from '../src/data/balance.json';
import levelJson from '../src/data/levels/level_01.json';
import { loadGameData } from '../src/data/schema';
import type { Command, CommandBody } from '../src/sim/commands';
import { formatHash } from '../src/sim/hash';
import { Sim } from '../src/sim/sim';

const SEED = 0xc0ffee;
/** Past the scripted win at tick 9144, at a round checkpoint. */
const TICKS = 9200;
/** Empty-command run: an inert build phase — nothing spawns without a wave. */
const GOLDEN_IDLE_HASH = '66b9fe93';
/** Scripted full-run session (see script below). */
const GOLDEN_SCRIPT_HASH = '4bd3285a';

function makeSim(): Sim {
  return new Sim(loadGameData(levelJson, balanceJson), SEED);
}

// The full-run session against the 40×20 level_01. The opening trio
// (rapid/area/slow) sits on the corridor spine between rock walls A and B —
// every enemy crosses it twice. A ten-wall serpentine zigzags the corridor
// before wave 2; the wall-B socket sniper lands before wave 3, and two
// reactive walls extend the serpentine's turns DURING wave 3 (mid-wave
// placement, committing under the live wave). Before the tank wave the
// player over-invests in the dead south-east field — ten rapids and five
// walls no route ever enters — burning the treasury to ~117g, and two extra
// tanks injected mid-wave crowd the lane, so the grabs overdraw the balance
// below zero mid-wave. The wall-A socket sniper answers the tank+runner
// waves; upgrades ride the recovered sacks; every carrier is intercepted
// (158 kills: 156 authored + 2 injected), and wave 10 settles solvent.
let seq = 0;
const cmd = (body: CommandBody): Command => ({ ...body, seq: seq++ });

function script(): ReadonlyMap<number, Command[]> {
  seq = 0;
  return new Map<number, Command[]>([
    [
      50,
      [
        cmd({ kind: 'place', structure: 'tower', archetype: 'rapid', tx: 12, ty: 8 }),
        cmd({ kind: 'place', structure: 'tower', archetype: 'area', tx: 13, ty: 10 }),
        cmd({ kind: 'place', structure: 'tower', archetype: 'slow', tx: 12, ty: 14 }),
      ],
    ],
    [100, [cmd({ kind: 'startWave' })]],
    [
      432,
      [
        cmd({ kind: 'place', structure: 'wall', tx: 11, ty: 9 }),
        cmd({ kind: 'place', structure: 'wall', tx: 12, ty: 9 }),
        cmd({ kind: 'place', structure: 'wall', tx: 13, ty: 9 }),
        cmd({ kind: 'place', structure: 'wall', tx: 14, ty: 9 }),
        cmd({ kind: 'place', structure: 'wall', tx: 15, ty: 9 }),
        cmd({ kind: 'place', structure: 'wall', tx: 10, ty: 12 }),
        cmd({ kind: 'place', structure: 'wall', tx: 11, ty: 12 }),
        cmd({ kind: 'place', structure: 'wall', tx: 12, ty: 12 }),
        cmd({ kind: 'place', structure: 'wall', tx: 13, ty: 12 }),
        cmd({ kind: 'place', structure: 'wall', tx: 14, ty: 12 }),
      ],
    ],
    [482, [cmd({ kind: 'startWave' })]],
    [939, [cmd({ kind: 'place', structure: 'tower', archetype: 'sniper', tx: 16, ty: 12 })]],
    [989, [cmd({ kind: 'startWave' })]],
    // Reactive mid-wave walls: placed while wave 3 is live, committing under it.
    [990, [cmd({ kind: 'place', structure: 'wall', tx: 14, ty: 13 })]],
    [991, [cmd({ kind: 'place', structure: 'wall', tx: 11, ty: 13 })]],
    [1754, [cmd({ kind: 'startWave' })]],
    [
      2658,
      [
        cmd({ kind: 'place', structure: 'wall', tx: 10, ty: 6 }),
        cmd({ kind: 'place', structure: 'wall', tx: 11, ty: 6 }),
        cmd({ kind: 'place', structure: 'wall', tx: 12, ty: 6 }),
        cmd({ kind: 'place', structure: 'wall', tx: 13, ty: 6 }),
        cmd({ kind: 'place', structure: 'wall', tx: 14, ty: 6 }),
        cmd({ kind: 'place', structure: 'tower', archetype: 'rapid', tx: 18, ty: 18 }),
        cmd({ kind: 'place', structure: 'tower', archetype: 'rapid', tx: 20, ty: 18 }),
        cmd({ kind: 'place', structure: 'tower', archetype: 'rapid', tx: 22, ty: 18 }),
        cmd({ kind: 'place', structure: 'tower', archetype: 'rapid', tx: 24, ty: 18 }),
        cmd({ kind: 'place', structure: 'tower', archetype: 'rapid', tx: 26, ty: 18 }),
        cmd({ kind: 'place', structure: 'tower', archetype: 'rapid', tx: 19, ty: 19 }),
        cmd({ kind: 'place', structure: 'tower', archetype: 'rapid', tx: 21, ty: 19 }),
        cmd({ kind: 'place', structure: 'tower', archetype: 'rapid', tx: 23, ty: 19 }),
        cmd({ kind: 'place', structure: 'tower', archetype: 'rapid', tx: 25, ty: 19 }),
        cmd({ kind: 'place', structure: 'tower', archetype: 'rapid', tx: 27, ty: 19 }),
        cmd({ kind: 'place', structure: 'wall', tx: 31, ty: 18 }),
        cmd({ kind: 'place', structure: 'wall', tx: 33, ty: 18 }),
        cmd({ kind: 'place', structure: 'wall', tx: 35, ty: 18 }),
        cmd({ kind: 'place', structure: 'wall', tx: 31, ty: 19 }),
        cmd({ kind: 'place', structure: 'wall', tx: 33, ty: 19 }),
      ],
    ],
    [2708, [cmd({ kind: 'startWave' })]],
    // Injected tanks crowd wave 5 past the kit; their grabs overdraw the ~117g.
    [3008, [cmd({ kind: 'spawn', type: 'tank', spawn: 0 })]],
    [3158, [cmd({ kind: 'spawn', type: 'tank', spawn: 0 })]],
    [4611, [cmd({ kind: 'place', structure: 'tower', archetype: 'sniper', tx: 8, ty: 8 })]],
    [4661, [cmd({ kind: 'startWave' })]],
    [5532, [cmd({ kind: 'upgrade', tx: 13, ty: 10 })]],
    [5582, [cmd({ kind: 'startWave' })]],
    [6033, [cmd({ kind: 'upgrade', tx: 16, ty: 12 })]],
    [6083, [cmd({ kind: 'startWave' })]],
    [7032, [cmd({ kind: 'upgrade', tx: 16, ty: 12 })]],
    [7082, [cmd({ kind: 'startWave' })]],
    [
      8022,
      [
        cmd({ kind: 'upgrade', tx: 12, ty: 8 }),
        cmd({ kind: 'upgrade', tx: 12, ty: 8 }),
        cmd({ kind: 'upgrade', tx: 12, ty: 14 }),
      ],
    ],
    [8072, [cmd({ kind: 'startWave' })]],
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
    expect(sim.state.treasuryMg).toBe(500_000); // and no interest either
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
    expect(sim.state.kills).toBe(158);
    expect(formatHash(sim.hash())).toBe(GOLDEN_SCRIPT_HASH);
    // A second identical run reproduces the hash bit-for-bit.
    expect(formatHash(runScripted().sim.hash())).toBe(GOLDEN_SCRIPT_HASH);
  });

  it('commit + advance equals tick() at every tick of the scripted run', () => {
    // The tick seam (time-controls design D2) is only sound if the two halves
    // compose back into the whole. Compared per tick, not just at the end, so a
    // divergence is caught where it happens rather than after it has been
    // absorbed by later state.
    const whole = makeSim();
    const wholeCommands = script();
    const halves = makeSim();
    const halfCommands = script();

    for (let t = 0; t < TICKS; t++) {
      whole.tick(wholeCommands.get(t) ?? []);
      halves.commit(halfCommands.get(t) ?? []);
      halves.advance();
      expect(halves.state.tick).toBe(whole.state.tick);
      expect(halves.hash()).toBe(whole.hash());
    }
    expect(formatHash(halves.hash())).toBe(GOLDEN_SCRIPT_HASH);
  });

  it('two runs agree on which structures are provisional at every tick', () => {
    // The provisional flag is hashed, so the golden already pins it — but only
    // at tick 5600, by which point the script has committed everything. This
    // walks the whole trajectory, where the flag genuinely flips: it is a pure
    // function of the seed, the commands and the ticks advanced.
    const a = makeSim();
    const b = makeSim();
    const aCommands = script();
    const bCommands = script();
    let sawProvisional = false;
    let sawCommitted = false;

    for (let t = 0; t < TICKS; t++) {
      a.tick(aCommands.get(t) ?? []);
      b.tick(bCommands.get(t) ?? []);
      const flags = (sim: Sim): string =>
        sim.state.structures.map((s) => `${s.id}:${s.provisional ? 1 : 0}`).join(',');
      expect(flags(a)).toBe(flags(b));
      if (a.state.structures.some((s) => s.provisional)) sawProvisional = true;
      if (a.state.structures.some((s) => !s.provisional)) sawCommitted = true;
    }
    // …and the comparison was not vacuous: both states actually occurred.
    expect(sawProvisional).toBe(true);
    expect(sawCommitted).toBe(true);
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
      for (const v of [st.id, st.tx, st.ty, st.archetypeId, st.level, st.paidMg, st.nextFireTick]) {
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
