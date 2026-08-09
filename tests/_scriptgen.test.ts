// TEMPORARY script-generation harness for re-deriving the replay golden
// script against the scale-world-experiment board. Deleted after use.
import { expect, it } from 'vitest';
import balanceJson from '../src/data/balance.json';
import levelJson from '../src/data/levels/level_01.json';
import { loadGameData } from '../src/data/schema';
import type { Command, CommandBody } from '../src/sim/commands';
import { formatHash } from '../src/sim/hash';
import { Sim } from '../src/sim/sim';

const SEED = 0xc0ffee;
let seq = 0;
const cmd = (body: CommandBody): Command => ({ ...body, seq: seq++ });
const place = (structure: 'wall' | 'tower', tx: number, ty: number, archetype?: string): CommandBody =>
  ({ kind: 'place', structure, tx, ty, ...(archetype ? { archetype } : {}) }) as CommandBody;
const upgrade = (tx: number, ty: number): CommandBody => ({ kind: 'upgrade', tx, ty });

// One batch per build phase: PLAN[i] lands 50 ticks after wave i's settlement
// (PLAN[0] at tick 50), startWave fires 50 ticks after the batch.
const PLAN: CommandBody[][] = [
  // pre-wave 1: the trio on the corridor spine — clean, fast early waves. 190g.
  [place('tower', 12, 8, 'rapid'), place('tower', 13, 10, 'area'), place('tower', 12, 14, 'slow')],
  // pre-wave 2: the serpentine's south half. 50g.
  [
    place('wall', 11, 9), place('wall', 12, 9), place('wall', 13, 9), place('wall', 14, 9), place('wall', 15, 9),
    place('wall', 10, 12), place('wall', 11, 12), place('wall', 12, 12), place('wall', 13, 12), place('wall', 14, 12),
  ],
  // pre-wave 3 (runners debut): sniper on the wall-B socket. The runner pair
  // still outruns this economy's best kit — the leak is the carrier meta's
  // price, and the cushion above keeps the settle solvent.
  [place('tower', 16, 12, 'sniper')],
  // pre-wave 4: bank.
  [],
  // pre-wave 5 (tanks): the serpentine's north row — the tanks' grabs open
  // the overdraw window against the low balance.
  [place('wall', 10, 6), place('wall', 11, 6), place('wall', 12, 6), place('wall', 13, 6), place('wall', 14, 6)],
  // pre-wave 6: twin sniper on the wall-A socket for the tank+runner mix.
  [place('tower', 8, 8, 'sniper')],
  // pre-wave 7 (swarm horde): area L2.
  [upgrade(13, 10)],
  // pre-wave 8: sniper L2.
  [upgrade(16, 12)],
  // pre-wave 9: rapid L2.
  [upgrade(12, 8)],
  // pre-wave 10: sniper L3.
  [upgrade(16, 12)],
];

const MAX_TICKS = 40_000;

it('generates the scripted run', () => {
  const sim = new Sim(loadGameData(levelJson, balanceJson), SEED);
  const recorded: [number, string[]][] = [];
  let buildStart = 0; // tick the current build phase began
  let nextWave = 0; // waves started so far
  let midWavePlaced = 0;
  let prevPhase = 'build';
  const hpById = new Map<number, number>();
  // Reactive walls extend the serpentine's turns mid-wave — 5g apiece, they
  // convert wave cash into path length while enemies stream.
  const MID_WAVE_SPOTS: [number, number][] = [
    [14, 13],
    [11, 13],
  ];
  let winTick = -1;
  let overdrawn = false;
  const lines: string[] = [];

  for (let t = 0; t < MAX_TICKS; t++) {
    const batch: Command[] = [];
    const srcs: string[] = [];
    if (sim.state.runPhase === 'build' && nextWave < 10) {
      if (t === buildStart + 50 && PLAN[nextWave]!.length > 0) {
        for (const body of PLAN[nextWave]!) {
          batch.push(cmd(body));
          srcs.push(JSON.stringify(body));
        }
      }
      if (t >= buildStart + 100 && sim.state.treasuryMg >= 0) {
        batch.push(cmd({ kind: 'startWave' }));
        srcs.push('{"kind":"startWave"}');
        nextWave++;
      }
      if (t > buildStart + 3000) {
        lines.push(`t=${t} DEADLOCK: build phase stuck (treasury ${(sim.state.treasuryMg / 1000).toFixed(1)}g)`);
        break;
      }
    }
    // Post-final-wave liquidation: from settled-locked, sell one structure
    // per tick — the refund-driven recovery to 'won' (run-lifecycle spec).
    if (sim.state.runPhase === 'settled-locked' && sim.state.structures.length > 0) {
      const target = sim.state.structures[0]!;
      const body = { kind: 'remove', tx: target.tx, ty: target.ty } as CommandBody;
      batch.push(cmd(body));
      srcs.push(JSON.stringify(body));
    }
    // Mid-wave reactive build: west-field rapids land during any wave from 3
    // on, the moment the bounties cover them and the tile is free.
    if (
      sim.state.runPhase === 'wave' &&
      nextWave >= 3 &&
      midWavePlaced < MID_WAVE_SPOTS.length &&
      sim.state.treasuryMg >= 5_000 &&
      sim.previewRoutes('wall', ...MID_WAVE_SPOTS[midWavePlaced]!).verdict === 'ok'
    ) {
      const [mx, my] = MID_WAVE_SPOTS[midWavePlaced]!;
      const body = place('wall', mx, my);
      batch.push(cmd(body));
      srcs.push(JSON.stringify(body));
      midWavePlaced++;
    }
    if (srcs.length) recorded.push([t, srcs]);
    const structuresBefore = sim.state.structures.length;
    const isPlaceBatch = batch.some((c) => c.kind === 'place');
    sim.tick(batch);
    if (isPlaceBatch) {
      const placed = sim.state.structures.length - structuresBefore;
      const wanted = batch.filter((c) => c.kind === 'place').length;
      if (placed !== wanted) lines.push(`t=${t} REJECTED ${wanted - placed} placements`);
    }
    const s = sim.state;
    for (const ev of sim.events) {
      if (ev.kind === 'goldLeaked') {
        lines.push(`t=${s.tick} ESCAPE enemy=${ev.enemyId} hpLeft=${hpById.get(ev.enemyId) ?? '?'} carried=${(ev.amountMg / 1000).toFixed(0)}g`);
      }
    }
    sim.events.length = 0;
    for (const e of s.enemies) hpById.set(e.id, e.hp);
    if (s.runPhase === 'wave' && s.treasuryMg < 0) overdrawn = true;
    if (prevPhase === 'wave' && s.runPhase !== 'wave') {
      lines.push(
        `wave ${nextWave} settled t=${s.tick} phase=${s.runPhase} treasury=${(s.treasuryMg / 1000).toFixed(1)}g ` +
          `kills=${s.kills} stolen=${(s.stolenMg / 1000).toFixed(1)} escaped=${(s.escapedMg / 1000).toFixed(1)}`,
      );
      buildStart = s.tick;
    }
    if (prevPhase !== 'won' && s.runPhase === 'won') winTick = s.tick;
    prevPhase = s.runPhase;
    if (s.runPhase === 'won' || s.runPhase === 'lost') break;
  }

  const s = sim.state;
  lines.push(
    `END phase=${s.runPhase} tick=${s.tick} winTick=${winTick} treasury=${(s.treasuryMg / 1000).toFixed(1)}g ` +
      `kills=${s.kills} stolen=${(s.stolenMg / 1000).toFixed(1)} escaped=${(s.escapedMg / 1000).toFixed(1)}`,
  );
  console.log(lines.join('\n'));

  if (s.runPhase === 'won' && overdrawn) {
    // Freeze: run the recorded script through TICKS and print goldens.
    const TICKS = Math.ceil((winTick + 50) / 100) * 100;
    console.log(`TICKS = ${TICKS}`);
    console.log('SCRIPT:');
    for (const [t, bodies] of recorded) console.log(`  [${t}, [${bodies.join(', ')}]],`);
    // Replay the frozen script for the golden hash.
    seq = 0;
    const replay = new Sim(loadGameData(levelJson, balanceJson), SEED);
    const byTick = new Map(recorded.map(([t, bodies]) => [t, bodies.map((b) => cmd(JSON.parse(b) as CommandBody))]));
    for (let t = 0; t < TICKS; t++) replay.tick(byTick.get(t) ?? []);
    console.log(`GOLDEN_SCRIPT_HASH = '${formatHash(replay.hash())}' kills=${replay.state.kills}`);
    const idle = new Sim(loadGameData(levelJson, balanceJson), SEED);
    for (let t = 0; t < TICKS; t++) idle.tick([]);
    console.log(`GOLDEN_IDLE_HASH = '${formatHash(idle.hash())}'`);
  }
  expect(true).toBe(true);
});
