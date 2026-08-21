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
// Return-to-origin-spawn note: NEITHER golden moved, deliberately verified.
// `Enemy.originSpawn` adds one mixed field per enemy, but both checkpoints
// sample states whose enemies array is empty (the idle run never spawns; the
// scripted run has won), so the walk never reaches it — hash.test.ts pins its
// visibility instead. The trajectory is bit-identical too: level_01 declares a
// single spawn flush against the map edge, so no-transit spawn routing and the
// per-origin returning field change nothing it does (kills still 156). A
// multi-spawn level's mid-run hashes DO shift; that break lands here the first
// time a golden is minted on one.
// Tower-damage-stats note: GOLDEN_SCRIPT_HASH alone was re-minted once more.
// `Structure.waveDamage` and `Structure.totalDamage` add two mixed fields per
// structure. The trajectory is untouched: the counters are written at every
// hit and read by nothing in the simulation, and every milestone below still
// holds (kills included, at 156). GOLDEN_IDLE_HASH again did NOT move — that
// run places nothing, so the walk never reaches structure fields.
// Build-over-walls note: GOLDEN_SCRIPT_HASH alone was re-minted again, this
// time because the SCRIPT changed — a tower now needs a foundation, so every
// dirt tower gains a wall (mount) and the run was re-derived against the new
// costs: two towers take the level's sockets, the opening pair is rapid+area,
// and the win lands later (tick 6272), so the scripted run has its own
// checkpoint (SCRIPT_TICKS). GOLDEN_IDLE_HASH is pinned at the same 5600
// ticks as before and did NOT move — the idle run places nothing.
// (Rebased onto tower-damage-stats: the same mounted script, re-minted once
// more for the two damage counters now walked per structure; every
// milestone, the win tick included, held.)
// Energy-infrastructure note: BOTH goldens re-minted, and the script
// re-derived. `SimState.gridTier` joins the canonical walk unconditionally,
// so even the idle run's hash layout changes; and towers now draw power, so
// the build-over-walls script — which bought two towers at once before wave 3
// and entered it at 24g — went broke, was cut off and lost a runner. The new
// script keeps the same shape (the mounted opening pair, the two socket
// towers, one wave ~50 ticks after each settlement, upgrades on bounty
// income) but spaces the purchases so the balance carries each wave's bill:
// the sniper alone before wave 3, a solar panel after it, the socket rapid
// with the sniper upgrade before wave 6 — whose tank grab overdraws the
// treasury and is ridden out on that one panel — and a second panel with the
// tier-2 connection before the finale. It therefore also covers the panel and
// upgradeGrid paths and a brownout, as the milestones below assert.
// Wave-ledger note (2026-08-21): BOTH goldens re-minted once, deliberately,
// and the script untouched. `SimState.ledger` and `SimState.lastLedger` — two
// fifteen-field periods — join the canonical walk unconditionally, so thirty
// fields joined the walk and even the idle run's hash layout changes (it
// carries an open period with the starting treasury as its opening). The
// trajectory did not move: the ledger is written beside the treasury
// mutations and the step-7 power resolution and read by nothing in the
// simulation, and every milestone below held unchanged before the new
// values were accepted — kills at 156, tier 1, two panels, the win at 6749.
// The per-tick identities over the harness scripts (tests/ledger.test.ts)
// are the independent check that no writer was missed.
import { describe, expect, it } from 'vitest';
import balanceJson from '../src/data/balance.json';
import levelJson from '../src/data/levels/level_01.json';
import { loadGameData, type TowerArchetype } from '../src/data/schema';
import type { Command, CommandBody } from '../src/sim/commands';
import { formatHash } from '../src/sim/hash';
import { COVERAGE_SCALE } from '../src/sim/power';
import { Sim } from '../src/sim/sim';

const SEED = 0xc0ffee;
/** The idle run's checkpoint — unchanged since the phase-4 minting. */
const IDLE_TICKS = 5600;
/** Past the scripted win at tick 6749, at a round checkpoint. */
const SCRIPT_TICKS = 6800;
/** Empty-command run: an inert build phase — nothing spawns without a wave. */
const GOLDEN_IDLE_HASH = '1c4664c9';
/** Scripted full-run session (see script below). */
const GOLDEN_SCRIPT_HASH = '4027e48b';

function makeSim(): Sim {
  return new Sim(loadGameData(levelJson, balanceJson), SEED);
}

// The full-run session against the 20×10 level_01, re-derived for
// energy-infrastructure on the build-over-walls board. The opening pair (rapid
// on a wall at (10,1), area on a wall at (9,2)) holds wall B's north-gap exit
// through waves 1–2 — every enemy passes (8..10, 0..2) twice — at 2.2 kW
// rated, well under the 4 kW tier-1 connection, so gold binds before power.
// The sniper takes the (8,6) socket before wave 3 (3.7 kW: still under the
// ceiling, but wave 3's bill is ~10g), and a panel at (13,0) after it keeps
// wave 4 — whose runner grabs leave 5.6g at the trough — solvent and fully
// covered. Wave 5's bounties fund the socket rapid at (4,4) and the sniper's
// upgrade before wave 6, leaving 73g; wave 6's tank grab overdraws that
// mid-wave, the grid cuts off and the five towers run on the one panel —
// coverage ~0.46 — until bounties bring the balance back; nothing escapes.
// The slow mounts at (10,2) before wave 8 and a second rapid at (11,1) before
// wave 9, whose 6.1 kW peak just tips the 4 kW + 2 kW ceiling (a shallow
// brownout at 0.98); the second panel at (14,0) and the tier-2 connection land
// before the finale, which runs at full coverage. Wave 10 settles solvent and
// wins at tick 6749 (kills stay at 156: every enemy the ten waves field is
// intercepted).
let seq = 0;
const cmd = (body: CommandBody): Command => ({ ...body, seq: seq++ });
/** A wall and the tower on it (build-over-walls): a dirt tower needs a foundation. */
const mount = (tx: number, ty: number, archetype: TowerArchetype): Command[] => [
  cmd({ kind: 'place', structure: 'wall', tx, ty }),
  cmd({ kind: 'place', structure: 'tower', archetype, tx, ty }),
];
/** A tower straight onto a socket — a built-in foundation, no wall needed. */
const socket = (tx: number, ty: number, archetype: TowerArchetype): Command =>
  cmd({ kind: 'place', structure: 'tower', archetype, tx, ty });

function script(): ReadonlyMap<number, Command[]> {
  seq = 0;
  return new Map<number, Command[]>([
    [50, [...mount(10, 1, 'rapid'), ...mount(9, 2, 'area')]],
    [100, [cmd({ kind: 'startWave' })]],
    [388, [cmd({ kind: 'startWave' })]],
    [748, [socket(8, 6, 'sniper')]],
    [798, [cmd({ kind: 'startWave' })]],
    [1275, [cmd({ kind: 'place', structure: 'panel', tx: 13, ty: 0 })]],
    [1325, [cmd({ kind: 'startWave' })]],
    [1882, [cmd({ kind: 'startWave' })]],
    [2717, [socket(4, 4, 'rapid'), cmd({ kind: 'upgrade', tx: 8, ty: 6 })]],
    [2767, [cmd({ kind: 'startWave' })]],
    [3621, [cmd({ kind: 'startWave' })]],
    [4011, mount(10, 2, 'slow')],
    [4061, [cmd({ kind: 'startWave' })]],
    [5009, mount(11, 1, 'rapid')],
    [5059, [cmd({ kind: 'startWave' })]],
    [5802, [cmd({ kind: 'place', structure: 'panel', tx: 14, ty: 0 }), cmd({ kind: 'upgradeGrid' })]],
    [5852, [cmd({ kind: 'startWave' })]],
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
  /** Energy-infrastructure: the panel path, the tier path, and a brownout. */
  panelPlaced: boolean;
  gridUpgraded: boolean;
  brownedOut: boolean;
  /** Broke while a wave ran AND nothing escaped that run: solar carried it. */
  overdrawnYetCovered: boolean;
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
    panelPlaced: false,
    gridUpgraded: false,
    brownedOut: false,
    overdrawnYetCovered: false,
  };

  for (let t = 0; t < SCRIPT_TICKS; t++) {
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
    if (s.structures.some((x) => x.kind === 'panel')) seen.panelPlaced = true;
    if (s.gridTier > 0) seen.gridUpgraded = true;
    // A brownout proper: supplied below draw but not nothing — the towers
    // slowed, they did not stop.
    if (sim.power.coverage < COVERAGE_SCALE && sim.power.coverage > 0) seen.brownedOut = true;
    if (s.runPhase === 'wave' && s.treasuryMg < 0 && sim.power.coverage > 0) {
      seen.overdrawnYetCovered = true;
    }
  }
  const end = sim.state;
  seen.interceptedEverything = end.stolenMg > 0 && end.escapedMg === 0;
  seen.wonSolvent = end.runPhase === 'won' && end.treasuryMg >= 0;
  return { sim, seen };
}

describe('replay determinism', () => {
  it(`same seed, no commands: an inert build phase and its golden hash after ${IDLE_TICKS} ticks`, () => {
    const sim = makeSim();
    for (let t = 0; t < IDLE_TICKS; t++) sim.tick([]);
    expect(sim.state.tick).toBe(IDLE_TICKS);
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
      panelPlaced: true,
      gridUpgraded: true,
      brownedOut: true,
      overdrawnYetCovered: true,
    });
    expect(sim.state.kills).toBe(156);
    expect(sim.state.gridTier).toBe(1);
    expect(sim.state.structures.filter((x) => x.kind === 'panel')).toHaveLength(2);
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

    for (let t = 0; t < SCRIPT_TICKS; t++) {
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
    // at the checkpoint, by which point the script has committed everything. This
    // walks the whole trajectory, where the flag genuinely flips: it is a pure
    // function of the seed, the commands and the ticks advanced.
    const a = makeSim();
    const b = makeSim();
    const aCommands = script();
    const bCommands = script();
    let sawProvisional = false;
    let sawCommitted = false;

    for (let t = 0; t < SCRIPT_TICKS; t++) {
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

  it(`no float leaks into sim state after a scripted ${SCRIPT_TICKS}-tick session`, () => {
    const { sim } = runScripted();
    const s = sim.state;
    expect(Number.isInteger(s.tick)).toBe(true);
    expect(Number.isInteger(s.treasuryMg)).toBe(true);
    expect(Number.isInteger(s.nextEnemyId)).toBe(true);
    expect(Number.isInteger(s.nextStructureId)).toBe(true);
    expect(Number.isInteger(s.nextSackId)).toBe(true);
    for (const v of [s.waveIndex, s.waveStartTick, s.stolenMg, s.escapedMg, s.kills, s.gridTier]) {
      expect(Number.isInteger(v)).toBe(true);
    }
    for (const l of [s.ledger, s.lastLedger]) {
      for (const v of Object.values(l)) expect(Number.isInteger(v)).toBe(true);
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
