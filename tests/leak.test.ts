// The leak-rate harness (phase-3 design D9): the counter-matrix contract of
// the enemy-variety spec as executable, directional checks. Headless scripted
// runs — an authored defense at fixed spend versus an authored burst —
// measuring the gold that escapes back through the spawn. Scenario data
// (layouts, bursts, thresholds) is versioned in leakData.ts.
import { describe, expect, it } from 'vitest';
import balanceJson from '../src/data/balance.json';
import { expandPreset } from '../src/app/presets';
import { loadGameData } from '../src/data/schema';
import type { Command } from '../src/sim/commands';
import { Sim } from '../src/sim/sim';
import { corridorLevel, SCENARIOS, type LayoutItem } from './leakData';

/** Ticks after the last scheduled spawn before a run is called unresolved. */
const DRAIN_TICKS = 1500;

interface LeakResult {
  leakedMg: number;
  spentMg: number;
  kills: number;
  escapes: number;
}

function runDefense(layout: LayoutItem[], burst: LeakScenarioBurst): LeakResult {
  const data = loadGameData(corridorLevel(), balanceJson);
  const sim = new Sim(data, 1);

  // Build the whole defense on tick 0; every placement must succeed, or the
  // scenario silently measures a different defense than it authored.
  let seq = 0;
  const placeCommands: Command[] = layout.map((item) => ({
    kind: 'place',
    structure: item.build === 'wall' ? 'wall' : 'tower',
    ...(item.build === 'wall' ? {} : { archetype: item.build }),
    tx: item.tx,
    ty: item.ty,
    seq: seq++,
  }));
  sim.tick(placeCommands);
  expect(sim.state.structures).toHaveLength(layout.length);
  const spentMg = data.startingTreasuryMg - sim.state.treasuryMg;

  // The burst starts at tick 10; run until the board is clear.
  const scheduled = expandPreset({ id: 'x', label: 'x', groups: burst }, 10);
  const lastSpawnTick = scheduled[scheduled.length - 1]!.tick;
  let next = 0;
  let leakedMg = 0;
  let escapes = 0;
  let spawned = 0;
  while (sim.state.tick <= lastSpawnTick + DRAIN_TICKS) {
    const commands: Command[] = [];
    while (next < scheduled.length && scheduled[next]!.tick <= sim.state.tick) {
      commands.push({ ...scheduled[next]!.body, seq: seq++ });
      next++;
      spawned++;
    }
    sim.tick(commands);
    for (const ev of sim.events) {
      if (ev.kind === 'goldLeaked') {
        leakedMg += ev.amountMg;
        escapes++;
      }
    }
    sim.events.length = 0;
    if (next >= scheduled.length && sim.state.enemies.length === 0) break;
  }
  expect(sim.state.enemies).toHaveLength(0); // the run resolved
  return { leakedMg, spentMg, kills: spawned - escapes, escapes };
}

type LeakScenarioBurst = (typeof SCENARIOS)[number]['burst'];

describe('leak-rate harness (counter-matrix contract)', () => {
  for (const scenario of SCENARIOS) {
    it(scenario.name, () => {
      const mono = runDefense(scenario.mono, scenario.burst);
      const counter = runDefense(scenario.counter, scenario.burst);

      // Equal-spend contract: the countered mix never outspends the mono
      // defense it beats (padding walls keep the spends aligned).
      expect(counter.spentMg).toBeLessThanOrEqual(mono.spentMg);

      // The directional assertions ARE the contract (design D9).
      expect(mono.leakedMg).toBeGreaterThan(scenario.monoMinLeakMg);
      expect(counter.leakedMg).toBeLessThan(scenario.counterMaxLeakMg);
      expect(counter.leakedMg).toBeLessThan(mono.leakedMg);
    });
  }
});
