// See ARCHITECTURE.md §12
//
// ENFORCES ARCHITECTURE.md §4. Golden hashes below were minted from runs
// whose fixed-point, RNG (reference-vector), flow-field, placement, theft and
// tower tests were green first. Regenerating one is a deliberate act that
// means "the simulation intentionally changed" — never do it to make CI pass.
// Phase-2 note: both goldens were re-minted in the phase-2-theft-and-maze
// change, which intentionally replaced despawn-at-treasury with the theft
// state machine and added structures, sacks, hp and carry to the state.
import { describe, expect, it } from 'vitest';
import balanceJson from '../src/data/balance.json';
import levelJson from '../src/data/levels/level_01.json';
import { loadGameData } from '../src/data/schema';
import type { Command } from '../src/sim/commands';
import { toTile } from '../src/sim/fixed';
import { formatHash } from '../src/sim/hash';
import { Sim } from '../src/sim/sim';

const SEED = 0xc0ffee;
const TICKS = 2000;
/** Empty-command run: pure spawn/steer/theft cycling. */
const GOLDEN_HASH = 'da85fee2';
/** Scripted phase-2 session (build, removal, theft, kills, sacks, debt). */
const GOLDEN_SCRIPT_HASH = 'ab3a7db3';

function makeSim(): Sim {
  return new Sim(loadGameData(levelJson, balanceJson), SEED);
}

// The scripted session. Tiles chosen against level_01's gauntlet: the wall
// narrows the southern route, the corridor tower covers the x=6..9 climb and
// the x=10 north gap, and the late tower quartet in the off-path north-west
// pocket forces a purchase that crosses into debt whatever the balance is.
let seq = 0;
const placeCmd = (structure: 'wall' | 'tower', tx: number, ty: number): Command => ({
  kind: 'place',
  structure,
  tx,
  ty,
  seq: seq++,
});
const SCRIPT: ReadonlyMap<number, Command[]> = new Map([
  [5, [placeCmd('wall', 6, 15)]],
  [10, [placeCmd('tower', 7, 1)]],
  [100, [{ kind: 'remove', tx: 6, ty: 15, seq: seq++ } satisfies Command]],
  [1200, [placeCmd('tower', 0, 0)]],
  [1210, [placeCmd('tower', 2, 0)]],
  [1220, [placeCmd('tower', 0, 2)]],
  [1230, [placeCmd('tower', 2, 2)]],
]);

interface Milestones {
  structuresBuilt: boolean;
  removalCountdownSeen: boolean;
  structureRemoved: boolean;
  treasuryGrab: boolean;
  escapeWithGold: boolean;
  kill: boolean;
  sackDropped: boolean;
  sackPickupFlip: boolean;
  wentIntoDebt: boolean;
}

/** Run the script, watching state transitions for every phase-2 behaviour. */
function runScripted(): { sim: Sim; seen: Milestones } {
  const sim = makeSim();
  const treasuryTile = { x: 27, y: 10 };
  const spawnTile = { x: 0, y: 10 };
  const seen: Milestones = {
    structuresBuilt: false,
    removalCountdownSeen: false,
    structureRemoved: false,
    treasuryGrab: false,
    escapeWithGold: false,
    kill: false,
    sackDropped: false,
    sackPickupFlip: false,
    wentIntoDebt: false,
  };

  let prev = new Map<number, { mode: string; carriedMg: number; tx: number; ty: number }>();
  let prevStructures = 0;
  for (let t = 0; t < TICKS; t++) {
    sim.tick(SCRIPT.get(t) ?? []);
    const s = sim.state;

    if (s.structures.length > prevStructures) seen.structuresBuilt = true;
    if (s.structures.some((st) => st.removalCompleteTick >= 0)) seen.removalCountdownSeen = true;
    if (s.structures.length < prevStructures) seen.structureRemoved = true;
    if (s.treasuryMg < 0) seen.wentIntoDebt = true;
    if (s.sacks.length > 0) seen.sackDropped = true;

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
        if (now.tx === treasuryTile.x && now.ty === treasuryTile.y) seen.treasuryGrab = true;
        else seen.sackPickupFlip = true;
      }
    }
    for (const [id, was] of prev) {
      if (current.has(id)) continue;
      const escaped = was.tx === spawnTile.x && was.ty === spawnTile.y && was.mode === 'returning';
      if (escaped && was.carriedMg > 0) seen.escapeWithGold = true;
      if (!escaped) seen.kill = true;
    }
    prev = current;
    prevStructures = s.structures.length;
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

  it('scripted phase-2 session exercises every mechanic and matches its golden hash', () => {
    const { sim, seen } = runScripted();
    // The script must actually produce each phase-2 behaviour — a milestone
    // going false means the script silently stopped covering that mechanic.
    expect(seen).toEqual({
      structuresBuilt: true,
      removalCountdownSeen: true,
      structureRemoved: true,
      treasuryGrab: true,
      escapeWithGold: true,
      kill: true,
      sackDropped: true,
      sackPickupFlip: true,
      wentIntoDebt: true,
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
      for (const v of [e.id, e.typeId, e.pos.x, e.pos.y, e.prevPos.x, e.prevPos.y, e.waypoint.x, e.waypoint.y, e.speed, e.hp, e.carriedMg]) {
        expect(Number.isInteger(v)).toBe(true);
      }
    }
    for (const st of s.structures) {
      for (const v of [st.id, st.tx, st.ty, st.paidMg, st.removalCompleteTick, st.nextFireTick]) {
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
