// See ARCHITECTURE.md §12 and the phase-3 tower-combat spec
import { describe, expect, it } from 'vitest';
import { effectiveSpeed } from '../src/sim/enemy';
import {
  injectEnemy,
  makeSim,
  mount,
  move,
  openLevel,
  place,
  startWave,
  testBalance,
  trivialWave,
  upgrade,
} from './helpers';

// 9×5 board, lane on row 2; towers sit 1×1 on walls on row 0 above it
// (build-over-walls: every tower is mounted on a wall).
const board = () => openLevel(9, 5, { x: 0, y: 2 }, { x: 8, y: 2 });

/** A tank type alongside the default runner; sorted keys → runner 0, tank 1. */
const TANK = { hp: 400, speed: 0, carryCapacity: 60, bounty: 20, slowImmune: false };

describe('rapid-fire tower', () => {
  it('targets the in-range enemy furthest along its path (minimal inbound cost)', () => {
    const { sim } = makeSim(board());
    sim.tick(mount(3, 0));
    const behind = injectEnemy(sim, 2, 2); // higher inbound cost (further from treasury)
    const ahead = injectEnemy(sim, 5, 2); // lower inbound cost
    sim.tick([]);
    expect(ahead.hp).toBe(122); // 130 − 8
    expect(behind.hp).toBe(130);
  });

  it('breaks inbound-cost ties by insertion order', () => {
    const { sim } = makeSim(board());
    sim.tick(mount(3, 0));
    const earlier = injectEnemy(sim, 5, 2);
    const later = injectEnemy(sim, 5, 2); // same tile → identical inbound cost
    sim.tick([]);
    expect(earlier.hp).toBe(122);
    expect(later.hp).toBe(130);
  });

  it('ignores enemies out of range', () => {
    const { sim } = makeSim(openLevel(12, 5, { x: 0, y: 2 }, { x: 11, y: 2 }));
    sim.tick(mount(0, 0)); // centre (1,1); range 3.5 tiles
    const far = injectEnemy(sim, 9, 2);
    for (let t = 0; t < 10; t++) sim.tick([]);
    expect(far.hp).toBe(130);
  });

  it('applies damage on the firing tick and then respects the fire interval', () => {
    const { sim } = makeSim(board());
    sim.tick(mount(3, 0));
    const e = injectEnemy(sim, 5, 2);
    sim.tick([]); // fires immediately (nextFireTick 0)
    expect(e.hp).toBe(122);
    const tower = sim.state.structures.find((x) => x.kind === 'tower')!;
    expect(tower.nextFireTick).toBe(sim.state.tick - 1 + 5);
    // Four quiet ticks, then the next shot on the fifth.
    for (let t = 0; t < 4; t++) sim.tick([]);
    expect(e.hp).toBe(122);
    sim.tick([]);
    expect(e.hp).toBe(114);
  });

  it('credits the bounty when a kill lands', () => {
    const { sim } = makeSim(board());
    sim.tick(mount(3, 0));
    const afterTower = sim.state.treasuryMg;
    injectEnemy(sim, 5, 2, { hp: 8 }); // dies to one shot
    sim.tick([]);
    expect(sim.state.enemies).toHaveLength(0);
    expect(sim.state.treasuryMg).toBe(afterTower + 6000);
    expect(sim.state.sacks).toHaveLength(0); // no gold carried, no sack
  });

  it('a killed carrier drops its gold as a sack on its death tile', () => {
    const { sim } = makeSim(board());
    sim.tick(mount(3, 0));
    const afterTower = sim.state.treasuryMg;
    injectEnemy(sim, 5, 2, { hp: 8, mode: 'returning', carriedMg: 25_000 });
    sim.tick([]);
    expect(sim.state.enemies).toHaveLength(0);
    expect(sim.state.treasuryMg).toBe(afterTower + 6000);
    expect(sim.state.sacks).toHaveLength(1);
    expect(sim.state.sacks[0]).toMatchObject({ tx: 5, ty: 2, amountMg: 25_000 });
  });

  it('two towers do not overkill the same enemy in one tick', () => {
    const { sim } = makeSim(board());
    sim.tick([...mount(3, 0), ...mount(6, 0)]);
    const weak = injectEnemy(sim, 5, 2, { hp: 4 }); // first shot kills it
    const next = injectEnemy(sim, 4, 2);
    sim.tick([]);
    expect(weak.alive).toBe(false);
    expect(next.hp).toBe(122); // the second tower re-targeted
  });

  it('archetype stats come from balance data with no code change', () => {
    // Same board, doubled rapid damage in the data → doubled damage dealt.
    const hot = testBalance();
    (hot as { towers: { rapid: { levels: { damage: number }[] } } }).towers.rapid.levels[0]!.damage = 16;
    const { sim } = makeSim(board(), hot);
    sim.tick(mount(3, 0));
    const e = injectEnemy(sim, 5, 2);
    sim.tick([]);
    expect(e.hp).toBe(130 - 16);
  });
});

describe('sniper cascade (design D5)', () => {
  const sniperBoard = () => {
    const { sim } = makeSim(board(), testBalance({}, { tank: TANK }), 42);
    sim.tick(mount(3, 0, 'sniper'));
    return sim;
  };

  it('a laden carrier outranks a tank', () => {
    const sim = sniperBoard();
    const tank = injectEnemy(sim, 4, 2, { typeId: 1, hp: 400 });
    const carrier = injectEnemy(sim, 5, 2, { mode: 'returning', carriedMg: 20_000 });
    sim.tick([]);
    expect(carrier.hp).toBe(130 - 40);
    expect(tank.hp).toBe(400);
  });

  it('an empty-handed returner is not a carrier: the strongest rule applies', () => {
    const sim = sniperBoard();
    const returner = injectEnemy(sim, 5, 2, { mode: 'returning', carriedMg: 0 });
    const tank = injectEnemy(sim, 4, 2, { typeId: 1, hp: 400 });
    sim.tick([]);
    expect(tank.hp).toBe(400 - 40);
    expect(returner.hp).toBe(130);
  });

  it('the carrier closest to escaping dies first (minimal returning-field cost)', () => {
    const sim = sniperBoard();
    // Spawn is at (0,2): the carrier at x=2 is closer to escaping.
    const far = injectEnemy(sim, 5, 2, { mode: 'returning', carriedMg: 10_000 });
    const near = injectEnemy(sim, 2, 2, { mode: 'returning', carriedMg: 10_000 });
    sim.tick([]);
    expect(near.hp).toBe(130 - 40);
    expect(far.hp).toBe(130);
  });

  it('carriers from different spawns rank by their OWN origin fields', () => {
    // Two active fronts: west (0,2) and south-east (6,4). The far carrier
    // stands right beside the FOREIGN south-east spawn — nearest-exit costing
    // would call it almost escaped — but its own west field prices it ~5
    // tiles out, so the mid-board south-east carrier at 2 tiles dies first.
    const wave = (spawn: string) => ({
      groups: [{ spawn, type: 'runner', count: 1, spawnInterval: 1, delay: 0 }],
    });
    const { sim } = makeSim({
      id: 'test',
      grid: { width: 7, height: 5 },
      treasury: { x: 6, y: 2 },
      spawns: [
        { id: 'west', x: 0, y: 2, activeFromWave: 1 },
        { id: 'southeast', x: 6, y: 4, activeFromWave: 1 },
      ],
      terrain: {
        legend: { '.': 'dirt' },
        map: ['.......', '.......', '.......', '.......', '.......'],
      },
      economy: { startingTreasury: 200, interestRatePerTick: 0 },
      waves: [wave('west'), wave('southeast')],
    });
    sim.tick(mount(3, 1, 'sniper'));
    const farFromOwn = injectEnemy(sim, 5, 4, {
      mode: 'returning',
      carriedMg: 10_000,
      originSpawn: 0,
    });
    const nearOwn = injectEnemy(sim, 4, 4, {
      mode: 'returning',
      carriedMg: 10_000,
      originSpawn: 1,
    });
    sim.tick([]);
    expect(nearOwn.hp).toBe(130 - 40);
    expect(farFromOwn.hp).toBe(130);
  });

  it('equal stat-hp enemies are focus-fired by inbound progress, not alternated', () => {
    const sim = sniperBoard();
    const behind = injectEnemy(sim, 4, 2); // higher inbound cost
    const ahead = injectEnemy(sim, 5, 2); // lower inbound cost — further along
    // Three firing cycles (interval 20): every shot lands on the same enemy.
    for (let t = 0; t < 60; t++) sim.tick([]);
    expect(ahead.hp).toBe(130 - 3 * 40);
    expect(behind.hp).toBe(130);
  });

  it('current hp never enters the cascade: a wounded tank still outranks healthy runners', () => {
    const sim = sniperBoard();
    const tank = injectEnemy(sim, 4, 2, { typeId: 1, hp: 30 }); // wounded below runner hp
    const runner = injectEnemy(sim, 5, 2, { hp: 130 });
    sim.tick([]);
    expect(tank.hp).toBe(30 - 40);
    expect(runner.hp).toBe(130);
  });
});

describe('area burst (design D6)', () => {
  it('flat damage to every enemy within the burst radius of the target position', () => {
    const { sim } = makeSim(board(), testBalance(), 42);
    sim.tick(mount(3, 0, 'area'));
    // Target = first along path = (5,2); radius 1.2 tiles around its centre.
    const target = injectEnemy(sim, 5, 2);
    const clumped = injectEnemy(sim, 5, 3); // 1.0 tiles away
    const alsoClumped = injectEnemy(sim, 4, 2); // 1.0 tiles away, but behind
    const outside = injectEnemy(sim, 3, 3); // ≈ 2.24 tiles away, behind the target
    sim.tick([]);
    expect(target.hp).toBe(130 - 12);
    expect(clumped.hp).toBe(130 - 12);
    expect(alsoClumped.hp).toBe(130 - 12);
    expect(outside.hp).toBe(130);
  });

  it('simultaneous carrier deaths credit both bounties and merge sacks per tile', () => {
    const { sim } = makeSim(board(), testBalance(), 42);
    sim.tick(mount(3, 0, 'area'));
    const before = sim.state.treasuryMg;
    injectEnemy(sim, 5, 2, { hp: 10, mode: 'returning', carriedMg: 9000 });
    injectEnemy(sim, 5, 2, { hp: 12, mode: 'returning', carriedMg: 4000 });
    sim.tick([]);
    expect(sim.state.enemies).toHaveLength(0);
    expect(sim.state.treasuryMg).toBe(before + 2 * 6000);
    expect(sim.state.sacks).toHaveLength(1);
    expect(sim.state.sacks[0]).toMatchObject({ tx: 5, ty: 2, amountMg: 13_000 });
  });
});

describe('slow (design D4)', () => {
  const slowBoard = () => {
    const { sim } = makeSim(board(), testBalance(), 42);
    sim.tick(mount(3, 0, 'slow'));
    return sim;
  };

  it('applies a timed status: no damage, no bounty, slowUntil set from the duration', () => {
    const sim = slowBoard();
    const before = sim.state.treasuryMg;
    const e = injectEnemy(sim, 5, 2);
    sim.tick([]); // fires at tick 1
    expect(e.hp).toBe(130);
    expect(e.slowUntil).toBe(1 + 30);
    expect(sim.state.treasuryMg).toBe(before);
  });

  it('re-application extends to max, never stacks', () => {
    const sim = slowBoard();
    const e = injectEnemy(sim, 5, 2);
    sim.tick([]); // slowUntil = 31
    expect(e.slowUntil).toBe(31);
    // Next shot at tick 11 (interval 10) re-applies: max(31, 11+30) = 41.
    for (let t = 0; t < 10; t++) sim.tick([]);
    expect(e.slowUntil).toBe(41);
    // The multiplier is unchanged while slowed — one application deep, always.
    expect(effectiveSpeed({ ...e, speed: 100 }, 15, 55)).toBe(55);
  });

  it('slow expires exactly on its tick', () => {
    const e = { ...injectEnemy(slowBoard(), 5, 2), speed: 100, slowUntil: 40 };
    expect(effectiveSpeed(e, 39, 55)).toBe(55);
    expect(effectiveSpeed(e, 40, 55)).toBe(100);
  });

  it('slowed carrier composes carrier-then-slow in integer math (pinned order)', () => {
    const sim = slowBoard();
    const e = injectEnemy(sim, 5, 2, { speed: 130, carriedMg: 5000 });
    sim.tick([]);
    // Pinned order: trunc(trunc(130·4/5)·55/100) = trunc(104·0.55) = 57.
    // The reverse order gives trunc(trunc(130·0.55)·4/5) = trunc(71·0.8) = 56.
    expect(effectiveSpeed(e, sim.state.tick, 55)).toBe(57);
  });

  it('slowImmune stat blocks short-circuit application', () => {
    const brute = { hp: 260, speed: 0, carryCapacity: 40, bounty: 15, slowImmune: true };
    // Sorted keys: brute 0, runner 1.
    const { sim } = makeSim(board(), testBalance({}, { brute }), 42);
    sim.tick(mount(3, 0, 'slow'));
    const e = injectEnemy(sim, 5, 2, { typeId: 0, hp: 260 });
    sim.tick([]);
    expect(e.slowUntil).toBe(0);
    expect(e.hp).toBe(260);
  });
});

describe('within-tick firing order (design D7)', () => {
  it('a later tower never shoots an enemy killed earlier in the tick and holds its fire tick', () => {
    const { sim } = makeSim(board(), testBalance(), 42);
    sim.tick(mount(3, 0, 'area')); // earlier: kills the swarm enemy
    sim.tick(mount(6, 0, 'rapid')); // later: only that enemy in range
    injectEnemy(sim, 5, 2, { hp: 10 }); // dies to the 12-damage burst
    sim.tick([]);
    const [area, rapid] = sim.state.structures.filter((x) => x.kind === 'tower');
    expect(sim.state.enemies).toHaveLength(0);
    expect(area!.nextFireTick).toBeGreaterThan(0); // fired
    expect(rapid!.nextFireTick).toBe(0); // held: target was already dead
  });

  it('build order pins same-tick resolution: the earlier-built tower fires first', () => {
    const run = (first: 'rapid' | 'sniper') => {
      const { sim } = makeSim(board(), testBalance(), 42);
      const second = first === 'rapid' ? 'sniper' : 'rapid';
      sim.tick([...mount(3, 0, first), ...mount(6, 0, second)]);
      injectEnemy(sim, 5, 2, { hp: 8 }); // dies to either tower's first shot
      sim.tick([]);
      return sim;
    };
    // Whichever archetype was built first lands the kill; the other holds.
    const towers = (sim: ReturnType<typeof run>) => sim.state.structures.filter((x) => x.kind === 'tower');
    const rapidFirst = towers(run('rapid'));
    expect(rapidFirst[0]!.nextFireTick).toBeGreaterThan(0);
    expect(rapidFirst[1]!.nextFireTick).toBe(0);
    const sniperFirst = towers(run('sniper'));
    expect(sniperFirst[0]!.nextFireTick).toBeGreaterThan(0);
    expect(sniperFirst[1]!.nextFireTick).toBe(0);
    // And two identical runs replay to identical hashes.
    expect(run('rapid').hash()).toBe(run('rapid').hash());
  });

  it('render events never feed back: drained and discarded runs hash identically', () => {
    const run = (drain: boolean) => {
      const { sim } = makeSim(board());
      sim.tick(mount(3, 0));
      injectEnemy(sim, 5, 2);
      injectEnemy(sim, 2, 2);
      for (let t = 0; t < 60; t++) {
        sim.tick([]);
        if (drain) sim.events.length = 0;
      }
      return { hash: sim.hash(), events: sim.events.length };
    };
    const drained = run(true);
    const kept = run(false);
    expect(kept.events).toBeGreaterThan(0); // tracers were actually emitted
    expect(drained.hash).toBe(kept.hash);
  });
});

describe('damage counters (tower-damage-stats spec)', () => {
  const counters = (t: { waveDamage: number; totalDamage: number }) => [t.waveDamage, t.totalDamage];
  // mount() places the wall first, so the tower is the stack's second structure.

  it('a hit within the target\'s hp counts the stat value in full', () => {
    const { sim } = makeSim(board());
    sim.tick(mount(3, 0));
    injectEnemy(sim, 5, 2, { hp: 130 });
    sim.tick([]);
    expect(counters(sim.state.structures[1]!)).toEqual([8, 8]);
  });

  it('overkill counts only what landed', () => {
    const { sim } = makeSim(board());
    sim.tick(mount(3, 0, 'sniper')); // 40 damage
    injectEnemy(sim, 5, 2, { hp: 8 });
    sim.tick([]);
    expect(sim.state.enemies).toHaveLength(0);
    expect(counters(sim.state.structures[1]!)).toEqual([8, 8]);
  });

  it('an area burst counts each struck enemy\'s own effective damage', () => {
    const { sim } = makeSim(board(), testBalance(), 42);
    sim.tick(mount(3, 0, 'area')); // 12 damage
    injectEnemy(sim, 5, 2, { hp: 130 }); // the target
    injectEnemy(sim, 5, 3, { hp: 130 }); // 1.0 tiles away
    injectEnemy(sim, 4, 2, { hp: 5 }); // 1.0 tiles away, dies to the burst
    sim.tick([]);
    expect(counters(sim.state.structures[1]!)).toEqual([12 + 12 + 5, 12 + 12 + 5]);
  });

  it('a slow tower records nothing', () => {
    const { sim } = makeSim(board(), testBalance(), 42);
    sim.tick(mount(3, 0, 'slow'));
    const e = injectEnemy(sim, 5, 2);
    for (let t = 0; t < 40; t++) sim.tick([]);
    expect(e.slowUntil).toBeGreaterThan(0); // it did fire
    expect(counters(sim.state.structures[1]!)).toEqual([0, 0]);
  });

  it('walls carry both counters at zero', () => {
    const { sim } = makeSim(board());
    sim.tick([place('wall', 3, 0)]);
    expect(counters(sim.state.structures[0]!)).toEqual([0, 0]);
  });

  // Three trivial waves whose one runner parks at the spawn (speed 0), out of
  // range of a tower at (5,0): the wave's damage comes only from injected
  // enemies, and settlement is forced by zeroing hp.
  const wavesBoard = () =>
    openLevel(9, 5, { x: 0, y: 2 }, { x: 8, y: 2 }, [], {
      waves: [trivialWave(), trivialWave(), trivialWave()],
    });

  it('settlement leaves the wave figure standing; the next start zeroes it and keeps the total', () => {
    const { sim } = makeSim(wavesBoard());
    sim.tick(mount(5, 0));
    const tower = sim.state.structures.find((x) => x.kind === 'tower')!;
    sim.tick([startWave()]);
    expect(sim.state.runPhase).toBe('wave');
    const e = injectEnemy(sim, 5, 2, { hp: 130 });
    for (let t = 0; t < 10; t++) sim.tick([]); // fires at ticks 2 and 7
    expect(counters(tower)).toEqual([16, 16]);
    // Kill everything standing: the wave drains and settles this tick.
    for (const enemy of sim.state.enemies) enemy.hp = 0;
    sim.tick([]);
    expect(sim.state.enemies).toHaveLength(0);
    expect(sim.state.runPhase).toBe('build');
    expect(e.alive).toBe(false);
    // Between waves the counter is the previous wave's figure — no rollover.
    for (let t = 0; t < 5; t++) sim.tick([]);
    expect(counters(tower)).toEqual([16, 16]);
    // The wave-start tick zeroes the wave counter and leaves the total alone.
    sim.tick([startWave()]);
    expect(sim.state.runPhase).toBe('wave');
    expect(counters(tower)).toEqual([0, 16]);
    // Damage in the new wave accumulates from zero onto the standing total.
    injectEnemy(sim, 5, 2, { hp: 130 });
    sim.tick([]);
    expect(counters(tower)).toEqual([8, 24]);
  });

  it('a tower placed mid-wave counts only from its placement', () => {
    const { sim } = makeSim(wavesBoard());
    sim.tick(mount(5, 0));
    sim.tick([startWave()]);
    injectEnemy(sim, 5, 2, { hp: 130 });
    for (let t = 0; t < 10; t++) sim.tick([]);
    const [veteran] = sim.state.structures.filter((x) => x.kind === 'tower');
    expect(veteran!.waveDamage).toBe(16);
    // The newcomer fires the tick it lands and starts from zero.
    sim.tick(mount(6, 0));
    const rookie = sim.state.structures.filter((x) => x.kind === 'tower')[1]!;
    expect(counters(rookie)).toEqual([8, 8]);
    expect(veteran!.waveDamage).toBeGreaterThan(rookie.waveDamage);
  });

  it('an upgrade continues the totals', () => {
    const { sim } = makeSim(board());
    sim.tick(mount(3, 0));
    const tower = sim.state.structures.find((x) => x.kind === 'tower')!;
    injectEnemy(sim, 5, 2, { hp: 130 });
    sim.tick([]); // tick 1: 8 landed; next shot due at tick 6
    expect(counters(tower)).toEqual([8, 8]);
    sim.tick([upgrade(3, 0)]); // tick 2: level 2 (11 damage), no shot due
    expect(tower.level).toBe(2);
    expect(counters(tower)).toEqual([8, 8]);
    let guard = 0;
    while (tower.totalDamage === 8 && guard++ < 10) sim.tick([]);
    expect(counters(tower)).toEqual([8 + 11, 8 + 11]);
  });

  it('a build-phase move keeps the history on the same structure', () => {
    const { sim } = makeSim(board());
    sim.tick(mount(3, 0));
    const tower = sim.state.structures.find((x) => x.kind === 'tower')!;
    tower.waveDamage = 120;
    tower.totalDamage = 900;
    sim.tick([move(3, 0, 6, 0)]);
    const moved = sim.state.structures.find((s) => s.kind === 'tower' && s.tx === 6 && s.ty === 0);
    expect(moved).toBeDefined();
    expect(moved!.id).toBe(tower.id);
    expect(counters(moved!)).toEqual([120, 900]);
  });
});
