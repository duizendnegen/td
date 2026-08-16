// See ARCHITECTURE.md §12 and the phase-2/phase-4 structure-placement specs
import { describe, expect, it } from 'vitest';
import balanceJson from '../src/data/balance.json';
import level01Json from '../src/data/levels/level_01.json';
import { loadGameData } from '../src/data/schema';
import { tileCentre, toTile } from '../src/sim/fixed';
import { Sim } from '../src/sim/sim';
import {
  injectEnemy,
  makeSim,
  move,
  openLevel,
  place,
  remove,
  spawnCmd,
  startWave,
  testBalance,
  trivialWave,
  upgrade,
} from './helpers';

describe('placement validation', () => {
  it('rejects a placement that seals every spawn from the treasury', () => {
    // 5×3 with walls above and below the middle lane; walling (2,1) seals.
    const { sim } = makeSim(openLevel(5, 3, { x: 0, y: 1 }, { x: 4, y: 1 }));
    sim.tick([place('wall', 2, 0)]);
    sim.tick([place('wall', 2, 2)]);
    expect(sim.state.structures).toHaveLength(2);
    expect(sim.state.treasuryMg).toBe(200_000 - 8000);

    sim.tick([place('wall', 2, 1)]);
    expect(sim.state.structures).toHaveLength(2);
    expect(sim.state.treasuryMg).toBe(200_000 - 8000);
    expect(sim.grid.isBlocked(2, 1)).toBe(false);
    expect(sim.events.some((e) => e.kind === 'placementRejected')).toBe(true);
  });

  it('rejects a placement that strands a live enemy inside the maze', () => {
    // Pocket the parked enemy at (3,0): walls west and south, then close east.
    const { sim } = makeSim(openLevel(7, 5, { x: 0, y: 0 }, { x: 6, y: 0 }));
    injectEnemy(sim, 3, 0);
    sim.tick([place('wall', 2, 0)]);
    sim.tick([place('wall', 3, 1)]);
    expect(sim.state.structures).toHaveLength(2);

    sim.tick([place('wall', 4, 0)]);
    expect(sim.state.structures).toHaveLength(2);
    expect(sim.grid.isBlocked(4, 0)).toBe(false);
    expect(sim.events.some((e) => e.kind === 'placementRejected')).toBe(true);
  });

  it('rejects a placement whose footprint tile contains an enemy', () => {
    const { sim } = makeSim(openLevel(7, 5, { x: 0, y: 0 }, { x: 6, y: 0 }));
    injectEnemy(sim, 3, 2);
    // Wall directly on the enemy.
    sim.tick([place('wall', 3, 2)]);
    expect(sim.state.structures).toHaveLength(0);
    // Tower directly on the enemy — the 1×1 check is the same single tile.
    sim.tick([place('tower', 3, 2)]);
    expect(sim.state.structures).toHaveLength(0);
    // The neighbouring tile is fine.
    sim.tick([place('tower', 4, 3)]);
    expect(sim.state.structures).toHaveLength(1);
  });

  it('a tower occupies exactly one tile and slots into a wall line', () => {
    // Wall line across x=3 with gaps at (3,1) and (3,2).
    const { sim } = makeSim(openLevel(7, 5, { x: 0, y: 2 }, { x: 6, y: 2 }));
    sim.tick([place('wall', 3, 0), place('wall', 3, 3), place('wall', 3, 4)]);
    expect(sim.state.structures).toHaveLength(3);

    // The tower slots into the line at (3,1) like any wall segment: exactly
    // one tile blocked and charged, neighbours untouched.
    const before = sim.state.treasuryMg;
    sim.tick([place('tower', 3, 1)]);
    expect(sim.state.structures).toHaveLength(4);
    expect(sim.state.treasuryMg).toBe(before - 50_000);
    expect(sim.grid.isBlocked(3, 1)).toBe(true);
    expect(sim.grid.isBlocked(4, 1)).toBe(false);
    expect(sim.grid.isBlocked(3, 2)).toBe(false);

    // A tower in the last gap would seal the corridor — same pipeline, same
    // rejection as a wall.
    sim.tick([place('tower', 3, 2)]);
    expect(sim.state.structures).toHaveLength(4);
    expect(sim.grid.isBlocked(3, 2)).toBe(false);
  });

  it('rejection is atomic: post-tick hash equals the run without the attempt', () => {
    const build = () => {
      const { sim } = makeSim(openLevel(5, 3, { x: 0, y: 1 }, { x: 4, y: 1 }));
      sim.tick([place('wall', 2, 0)]);
      sim.tick([place('wall', 2, 2)]);
      return sim;
    };
    const withAttempt = build();
    const without = build();
    withAttempt.tick([place('wall', 2, 1)]); // rejected: seals
    without.tick([]);
    for (let t = 0; t < 20; t++) {
      withAttempt.tick([]);
      without.tick([]);
    }
    expect(withAttempt.hash()).toBe(without.hash());
  });

  it('spending is allowed into debt at balance ≥ 0 and blocked below 0', () => {
    const { sim } = makeSim(openLevel(9, 9, { x: 0, y: 4 }, { x: 8, y: 4 }));
    // Four towers at 50g against a 200g treasury → balance 0, still spendable.
    sim.tick([place('tower', 1, 0), place('tower', 3, 0), place('tower', 5, 0)]);
    sim.tick([place('tower', 1, 6)]);
    expect(sim.state.treasuryMg).toBe(0);
    // Balance 0 → the debt purchase is permitted and goes negative.
    sim.tick([place('wall', 3, 6)]);
    expect(sim.state.structures).toHaveLength(5);
    expect(sim.state.treasuryMg).toBe(-4000);
    // Below 0 → all spending is blocked, nothing changes.
    sim.tick([place('wall', 5, 6)]);
    expect(sim.state.structures).toHaveLength(5);
    expect(sim.state.treasuryMg).toBe(-4000);
  });

  it('removal unblocks, refunds and drops the structure in the command tick', () => {
    const { sim } = makeSim(openLevel(5, 3, { x: 0, y: 1 }, { x: 4, y: 1 }));
    sim.tick([place('wall', 2, 0)]);
    const afterBuildMg = sim.state.treasuryMg;
    expect(afterBuildMg).toBe(196_000);
    expect(sim.grid.isBlocked(2, 0)).toBe(true);
    expect(sim.inbound.cost[sim.grid.idx(2, 0)]).toBe(-1); // walled off the field

    sim.tick([remove(2, 0)]);

    // One tick, no countdown: gone, unblocked, refunded. The wall never faced
    // a wave tick, so the refund is the full price (provisional-construction
    // design D3); the committed fraction is asserted in 'the provisional
    // window' below.
    expect(sim.state.structures).toHaveLength(0);
    expect(sim.grid.isBlocked(2, 0)).toBe(false);
    expect(sim.state.treasuryMg).toBe(afterBuildMg + 4000);
    // And both live fields reflect the reopened mask that same tick.
    expect(sim.inbound.cost[sim.grid.idx(2, 0)]).toBeGreaterThan(0);
    expect(sim.returning.cost[sim.grid.idx(2, 0)]).toBeGreaterThan(0);
  });

  it('a removal refused mid-wave leaves the state hash untouched', () => {
    const build = () => {
      const { sim } = makeSim(
        openLevel(5, 3, { x: 0, y: 1 }, { x: 4, y: 1 }, [], {
          waves: [trivialWave(), trivialWave()],
        }),
      );
      sim.tick([place('wall', 2, 0)]);
      sim.tick([startWave()]);
      expect(sim.state.runPhase).toBe('wave');
      return sim;
    };
    const withAttempt = build();
    const without = build();

    withAttempt.tick([remove(2, 0)]);
    without.tick([]);

    // Refused: still standing, still blocked, not a milli-gold refunded.
    expect(withAttempt.state.structures).toHaveLength(1);
    expect(withAttempt.grid.isBlocked(2, 0)).toBe(true);
    expect(withAttempt.state.treasuryMg).toBe(without.state.treasuryMg);
    expect(withAttempt.hash()).toBe(without.hash());
    expect(withAttempt.events.some((e) => e.kind === 'placementRejected')).toBe(true);

    // Building mid-wave is still legitimate — only selling is gated.
    withAttempt.tick([place('wall', 2, 2)]);
    expect(withAttempt.state.structures).toHaveLength(2);
    expect(withAttempt.grid.isBlocked(2, 2)).toBe(true);
  });

  it('the same removal succeeds once the wave settles', () => {
    const { sim } = makeSim(
      openLevel(5, 3, { x: 0, y: 1 }, { x: 4, y: 1 }, [], {
        waves: [trivialWave(), trivialWave()],
      }),
    );
    sim.tick([place('wall', 2, 0)]);
    const afterBuildMg = sim.state.treasuryMg;
    sim.tick([startWave()]);
    sim.tick([remove(2, 0)]); // refused: the wave is running
    expect(sim.state.structures).toHaveLength(1);

    // Drain the wave; settlement returns the run to the build phase.
    sim.state.enemies.forEach((e) => (e.hp = 0));
    sim.tick([]);
    expect(sim.state.runPhase).toBe('build');

    sim.tick([remove(2, 0)]);
    expect(sim.state.structures).toHaveLength(0);
    expect(sim.state.treasuryMg).toBe(afterBuildMg + 2000 + 6000); // refund + bounty
  });

  it('a removal opens the route for live enemies in its own tick', () => {
    const { sim } = makeSim(
      openLevel(7, 3, { x: 0, y: 1 }, { x: 6, y: 1 }),
      testBalance({ speed: 128 }),
    );
    sim.tick([place('wall', 3, 1)]);
    const e = injectEnemy(sim, 2, 1, { speed: 128 });
    sim.tick([]);
    // Steering around the wall: committed off row 1, and the walled tile is
    // out of the field entirely.
    expect(toTile(e.waypoint.y)).not.toBe(1);
    expect(sim.inbound.cost[sim.grid.idx(3, 1)]).toBe(-1);

    sim.tick([remove(3, 1)]);

    // The tile is walkable and back in both fields in the removal's own tick.
    expect(sim.grid.isBlocked(3, 1)).toBe(false);
    expect(sim.inbound.cost[sim.grid.idx(3, 1)]).toBeGreaterThan(0);
    expect(sim.returning.cost[sim.grid.idx(3, 1)]).toBeGreaterThan(0);

    // The enemy keeps its standing one-tile commitment — an unblock never
    // invalidates one — and routes through the reopened tile once it re-reads.
    let guard = 0;
    while (!(toTile(e.waypoint.x) === 3 && toTile(e.waypoint.y) === 1) && guard++ < 40) {
      sim.tick([]);
    }
    expect(toTile(e.waypoint.x)).toBe(3);
    expect(toTile(e.waypoint.y)).toBe(1);
  });

  it('walling a committed waypoint forces a same-tick re-commit and the tile is never entered', () => {
    const { sim } = makeSim(
      openLevel(7, 3, { x: 0, y: 1 }, { x: 6, y: 1 }),
      testBalance({ speed: 128 }),
    );
    // Walk one commanded spawn until it has committed to (3,1) from (2,1).
    sim.tick([spawnCmd('runner')]);
    let guard = 0;
    const committedTo = (tx: number, ty: number): boolean => {
      const e = sim.state.enemies[0];
      return (
        e !== undefined &&
        toTile(e.waypoint.x) === tx &&
        toTile(e.waypoint.y) === ty &&
        toTile(e.pos.x) === 2 &&
        toTile(e.pos.y) === 1
      );
    };
    while (!committedTo(3, 1) && guard++ < 200) sim.tick([]);
    expect(committedTo(3, 1)).toBe(true);

    sim.tick([place('wall', 3, 1)]);
    expect(sim.state.structures).toHaveLength(1);
    const e = sim.state.enemies[0]!;
    // Re-committed away from the walled tile in the same tick…
    expect(toTile(e.waypoint.x) === 3 && toTile(e.waypoint.y) === 1).toBe(false);
    // …and the walled tile is never entered from here on.
    for (let t = 0; t < 120; t++) {
      for (const enemy of sim.state.enemies) {
        expect(toTile(enemy.pos.x) === 3 && toTile(enemy.pos.y) === 1).toBe(false);
      }
      sim.tick([]);
    }
  });

  it("blocking a committed diagonal's flank forces a re-commit that never clips the corner", () => {
    const { sim } = makeSim(
      openLevel(4, 4, { x: 0, y: 0 }, { x: 3, y: 3 }),
      testBalance({ speed: 64 }),
    );
    // Wait for one commanded spawn to be mid-way through its (0,0) → (1,1) diagonal.
    sim.tick([spawnCmd('runner')]);
    let guard = 0;
    const midDiagonal = (): boolean => {
      const e = sim.state.enemies[0];
      return (
        e !== undefined &&
        toTile(e.pos.x) === 0 &&
        toTile(e.pos.y) === 0 &&
        toTile(e.waypoint.x) === 1 &&
        toTile(e.waypoint.y) === 1 &&
        (e.pos.x !== tileCentre(0) || e.pos.y !== tileCentre(0))
      );
    };
    while (!midDiagonal() && guard++ < 200) sim.tick([]);
    expect(midDiagonal()).toBe(true);

    // Block the northern flank of the diagonal.
    sim.tick([place('wall', 1, 0)]);
    expect(sim.state.structures).toHaveLength(1);
    const e = sim.state.enemies[0]!;
    // The diagonal was abandoned this tick even though (1,1) itself is open.
    expect(toTile(e.waypoint.x) === 1 && toTile(e.waypoint.y) === 1).toBe(false);
    // The enemy never enters the walled flank tile.
    for (let t = 0; t < 120; t++) {
      for (const enemy of sim.state.enemies) {
        expect(toTile(enemy.pos.x) === 1 && toTile(enemy.pos.y) === 0).toBe(false);
      }
      sim.tick([]);
    }
  });
});

// A 7×3 corridor with a socket at (3,0), grass at (5,0), rock at (1,0):
// the middle lane (y=1) stays the only spawn→treasury path.
const paletteLevel = () =>
  openLevel(7, 3, { x: 0, y: 1 }, { x: 6, y: 1 }, [], {
    map: ['.r.o.g.', '.......', '.......'],
  });

describe('terrain buildability (phase-4)', () => {
  it('grass and rock refuse every structure as not-buildable', () => {
    const { sim } = makeSim(paletteLevel());
    expect(sim.previewPlacement('wall', 5, 0)).toBe('not-buildable'); // grass
    expect(sim.previewPlacement('tower', 5, 0)).toBe('not-buildable');
    expect(sim.previewPlacement('wall', 1, 0)).toBe('not-buildable'); // rock
    expect(sim.previewPlacement('tower', 1, 0)).toBe('not-buildable');
    sim.tick([place('wall', 5, 0), place('tower', 1, 0)]);
    expect(sim.state.structures).toHaveLength(0);
    expect(sim.state.treasuryMg).toBe(200_000);
    expect(sim.events.filter((e) => e.kind === 'placementRejected')).toHaveLength(2);
  });

  it('a wall on a socket is rejected; a tower is accepted', () => {
    const { sim } = makeSim(paletteLevel());
    expect(sim.previewPlacement('wall', 3, 0)).toBe('not-buildable');
    expect(sim.previewPlacement('tower', 3, 0)).toBe('ok');
    sim.tick([place('wall', 3, 0)]);
    expect(sim.state.structures).toHaveLength(0);
    sim.tick([place('tower', 3, 0)]);
    expect(sim.state.structures).toHaveLength(1);
    expect(sim.state.treasuryMg).toBe(150_000);
  });

  it('a socket tower skips path checks entirely and rebuilds no field (D6)', () => {
    // Wall off the whole corridor except the middle lane, then park an
    // enemy: any dirt placement in the lane would seal or strand, but the
    // socket tower is validation-free because its tile was never navigable.
    const { sim } = makeSim(paletteLevel());
    injectEnemy(sim, 2, 1);
    const inboundBefore = sim.inbound;
    const costsBefore = Array.from(sim.inbound.cost);
    sim.tick([place('tower', 3, 0)]);
    expect(sim.state.structures).toHaveLength(1);
    // No swap, no rebuild: the live field object and its costs are untouched.
    expect(sim.inbound).toBe(inboundBefore);
    expect(Array.from(sim.inbound.cost)).toEqual(costsBefore);
    expect(sim.grid.isBlocked(3, 0)).toBe(true); // terrain-blocked as ever
  });

  it('an occupied socket rejects a second tower', () => {
    const { sim } = makeSim(paletteLevel());
    sim.tick([place('tower', 3, 0)]);
    expect(sim.previewPlacement('tower', 3, 0)).toBe('occupied');
    sim.tick([place('tower', 3, 0)]);
    expect(sim.state.structures).toHaveLength(1);
  });

  it('socket removal refunds without unblocking the tile or rebuilding fields (D6)', () => {
    const { sim } = makeSim(paletteLevel());
    sim.tick([place('tower', 3, 0)]);
    const afterBuildMg = sim.state.treasuryMg;

    sim.tick([remove(3, 0)]);

    // Removed and refunded in that tick — and the tile is still terrain-blocked.
    // Provisional, so the refund is the full 50 000 the tower cost.
    expect(sim.state.structures).toHaveLength(0);
    expect(sim.state.treasuryMg).toBe(afterBuildMg + 50_000);
    expect(sim.grid.isBlocked(3, 0)).toBe(true);
    // The socket is placeable again.
    expect(sim.previewPlacement('tower', 3, 0)).toBe('ok');
  });

  it('rejects a placement that seals a dormant spawn (D4)', () => {
    // The dormant north spawn (0,0) exits only east through (1,0): the rocks
    // at (0,1)/(1,1) block both the southern step and the diagonal.
    const level = {
      id: 'test',
      grid: { width: 7, height: 3 },
      treasury: { x: 6, y: 1 },
      spawns: [
        { id: 'main', x: 0, y: 2, activeFromWave: 1 },
        { id: 'north', x: 0, y: 0, activeFromWave: 2 },
      ],
      terrain: { legend: { '.': 'dirt', r: 'rock' }, map: ['.......', 'rr.....', '.......'] },
      economy: { startingTreasury: 200, interestRatePerTick: 0 },
      waves: [
        { groups: [{ spawn: 'main', type: 'runner', count: 1, spawnInterval: 1, delay: 0 }] },
        { groups: [{ spawn: 'north', type: 'runner', count: 1, spawnInterval: 1, delay: 0 }] },
      ],
    };
    const { sim } = makeSim(level);
    expect(sim.previewPlacement('wall', 1, 0)).toBe('seals-spawn');
    sim.tick([place('wall', 1, 0)]);
    expect(sim.state.structures).toHaveLength(0);
    // A placement that seals nobody is still fine.
    sim.tick([place('wall', 3, 2)]);
    expect(sim.state.structures).toHaveLength(1);
  });
});

// The provisional window (provisional-construction design D1–D3): a structure
// is uncommitted until an advance runs under a live wave, and while
// uncommitted it refunds in full and may be sold in any live phase.
const twoWaveCorridor = () =>
  openLevel(5, 3, { x: 0, y: 1 }, { x: 4, y: 1 }, [], {
    waves: [trivialWave(), trivialWave()],
  });

describe('the provisional window', () => {
  it('survives a whole build phase, however many ticks it spans', () => {
    const { sim } = makeSim(twoWaveCorridor());
    sim.tick([place('wall', 2, 0)]);
    for (let t = 0; t < 500; t++) sim.tick([]);
    expect(sim.state.runPhase).toBe('build');
    expect(sim.state.structures[0]!.provisional).toBe(true);
  });

  it("a wave's first advanced tick commits everything standing", () => {
    const { sim } = makeSim(twoWaveCorridor());
    sim.tick([place('wall', 2, 0)]);
    sim.tick([place('wall', 2, 2)]);
    expect(sim.state.structures.every((s) => s.provisional)).toBe(true);

    sim.tick([startWave()]);
    expect(sim.state.structures.every((s) => !s.provisional)).toBe(true);
  });

  it('a startWave that is committed but never advanced commits nothing', () => {
    const { sim } = makeSim(twoWaveCorridor());
    sim.tick([place('wall', 2, 0)]);

    // The paused shape: intent lands, time does not pass.
    sim.commit([startWave()]);
    expect(sim.state.runPhase).toBe('wave');
    expect(sim.state.structures[0]!.provisional).toBe(true);
    sim.commit([place('wall', 2, 2)]);
    expect(sim.state.structures.every((s) => s.provisional)).toBe(true);

    // The first advance under the live wave is the commit point.
    sim.advance();
    expect(sim.state.structures.every((s) => !s.provisional)).toBe(true);
  });

  it('a placement during a live wave commits on the next advance', () => {
    const { sim } = makeSim(twoWaveCorridor());
    sim.tick([startWave()]);
    sim.commit([place('wall', 2, 0)]);
    expect(sim.state.structures[0]!.provisional).toBe(true);
    sim.advance();
    expect(sim.state.structures[0]!.provisional).toBe(false);

    // Live play therefore has no free undo: placing through tick() — commit
    // and advance together — is committed by the end of its own tick.
    sim.tick([place('wall', 2, 2)]);
    expect(sim.state.structures.every((s) => !s.provisional)).toBe(true);
  });

  it('refunds a provisional structure in full, restoring the balance exactly', () => {
    const { sim } = makeSim(twoWaveCorridor());
    const before = sim.state.treasuryMg;
    sim.tick([place('wall', 2, 0)]);
    expect(sim.state.treasuryMg).toBe(before - 4000);

    sim.tick([remove(2, 0)]);
    expect(sim.state.structures).toHaveLength(0);
    expect(sim.state.treasuryMg).toBe(before);
    expect(sim.grid.isBlocked(2, 0)).toBe(false);
  });

  it("returns a provisional tower's upgrades with it", () => {
    const { sim } = makeSim(twoWaveCorridor());
    const before = sim.state.treasuryMg;
    sim.tick([place('tower', 2, 0)]); // 50 000
    sim.tick([upgrade(2, 0)]); // + 85 000 into paidMg
    expect(sim.state.structures[0]!.paidMg).toBe(135_000);
    expect(sim.state.treasuryMg).toBe(before - 135_000);

    sim.tick([remove(2, 0)]);
    expect(sim.state.treasuryMg).toBe(before);
  });

  it('still refunds the fraction once a wave tick has run over it', () => {
    const { sim } = makeSim(twoWaveCorridor());
    sim.tick([place('wall', 2, 0)]);
    sim.tick([startWave()]); // commits it
    sim.state.enemies.forEach((e) => (e.hp = 0));
    sim.tick([]); // settles back to the build phase
    expect(sim.state.runPhase).toBe('build');
    expect(sim.state.structures[0]!.provisional).toBe(false);

    const beforeSale = sim.state.treasuryMg;
    sim.tick([remove(2, 0)]);
    expect(sim.state.treasuryMg).toBe(beforeSale + 2000); // half of 4000
  });

  it('unwinds a provisional structure placed during a stopped wave', () => {
    const { sim } = makeSim(twoWaveCorridor());
    sim.tick([startWave()]);
    const beforeBuild = sim.state.treasuryMg;

    // Stopped: commits only, no advance — exactly what the paused loop does.
    sim.commit([place('wall', 2, 0)]);
    expect(sim.grid.isBlocked(2, 0)).toBe(true);
    sim.commit([remove(2, 0)]);

    expect(sim.state.structures).toHaveLength(0);
    expect(sim.state.treasuryMg).toBe(beforeBuild); // net zero round trip
    expect(sim.grid.isBlocked(2, 0)).toBe(false);
    expect(sim.inbound.cost[sim.grid.idx(2, 0)]).toBeGreaterThan(0);
    expect(sim.returning.cost[sim.grid.idx(2, 0)]).toBeGreaterThan(0);
  });

  it('closes the window the moment time advances', () => {
    const { sim } = makeSim(twoWaveCorridor());
    sim.tick([startWave()]);
    sim.commit([place('wall', 2, 0)]);
    const afterBuildMg = sim.state.treasuryMg;

    sim.advance(); // one tick of the live wave commits it

    sim.tick([remove(2, 0)]);
    expect(sim.state.structures).toHaveLength(1);
    expect(sim.grid.isBlocked(2, 0)).toBe(true);
    expect(sim.state.treasuryMg).toBe(afterBuildMg);
    expect(sim.events.some((e) => e.kind === 'placementRejected')).toBe(true);
  });

  it('rejects the committed mid-wave removal atomically', () => {
    const build = () => {
      const { sim } = makeSim(twoWaveCorridor());
      sim.tick([place('wall', 2, 0)]);
      sim.tick([startWave()]); // the wall is committed by this tick's advance
      expect(sim.state.structures[0]!.provisional).toBe(false);
      return sim;
    };
    const withAttempt = build();
    const without = build();

    withAttempt.tick([remove(2, 0)]);
    without.tick([]);
    expect(withAttempt.state.structures).toHaveLength(1);
    expect(withAttempt.hash()).toBe(without.hash());
  });
});

// Tower drag-move (structure-placement delta): a validated, atomic,
// build-phase-only relocation of towers and walls that evaluates the
// destination with the origin freed under the mover's terrain rule, is free
// of charge, and preserves the structure's identity.
describe('move command', () => {
  it('a confirmed move updates the mask and both fields in its tick', () => {
    const { sim } = makeSim(openLevel(7, 3, { x: 0, y: 1 }, { x: 6, y: 1 }));
    sim.tick([place('tower', 3, 0)]);
    const id = sim.state.structures[0]!.id;
    const afterBuildMg = sim.state.treasuryMg;

    sim.tick([move(3, 0, 3, 2)]);

    const s = sim.state.structures[0]!;
    expect(s.id).toBe(id);
    expect([s.tx, s.ty]).toEqual([3, 2]);
    expect(sim.state.treasuryMg).toBe(afterBuildMg);
    expect(sim.grid.isBlocked(3, 0)).toBe(false);
    expect(sim.grid.isBlocked(3, 2)).toBe(true);
    // Both live fields reflect the new mask in the move's own tick.
    expect(sim.inbound.cost[sim.grid.idx(3, 0)]).toBeGreaterThan(0);
    expect(sim.inbound.cost[sim.grid.idx(3, 2)]).toBe(-1);
    expect(sim.returning.cost[sim.grid.idx(3, 0)]).toBeGreaterThan(0);
    expect(sim.returning.cost[sim.grid.idx(3, 2)]).toBe(-1);
  });

  it('moving is free and preserves the refund basis of a committed tower', () => {
    const { sim } = makeSim(
      openLevel(5, 3, { x: 0, y: 1 }, { x: 4, y: 1 }, [], {
        waves: [trivialWave(), trivialWave()],
      }),
    );
    sim.tick([place('tower', 2, 0)]); // 50 000
    sim.tick([upgrade(2, 0)]); // + 85 000 into paidMg
    sim.tick([startWave()]); // commits it
    sim.state.enemies.forEach((e) => (e.hp = 0));
    sim.tick([]); // settles back to the build phase
    expect(sim.state.runPhase).toBe('build');
    expect(sim.state.structures[0]!.provisional).toBe(false);

    const beforeMoveMg = sim.state.treasuryMg;
    sim.tick([move(2, 0, 2, 2)]);
    const s = sim.state.structures[0]!;
    expect([s.tx, s.ty]).toEqual([2, 2]);
    expect(s.paidMg).toBe(135_000);
    expect(s.level).toBe(2);
    expect(s.provisional).toBe(false);
    expect(sim.state.treasuryMg).toBe(beforeMoveMg);

    // The later removal credits exactly what an unmoved tower would return:
    // 50% of the 135 000 invested.
    sim.tick([remove(2, 2)]);
    expect(sim.state.treasuryMg).toBe(beforeMoveMg + 67_500);
  });

  it('a provisional tower stays provisional across a move', () => {
    const { sim } = makeSim(
      openLevel(5, 3, { x: 0, y: 1 }, { x: 4, y: 1 }, [], {
        waves: [trivialWave(), trivialWave()],
      }),
    );
    const before = sim.state.treasuryMg;
    sim.tick([place('tower', 2, 0)]);
    sim.tick([move(2, 0, 2, 2)]);
    expect(sim.state.structures[0]!.provisional).toBe(true);
    // Still provisional, so removal still refunds in full.
    sim.tick([remove(2, 2)]);
    expect(sim.state.treasuryMg).toBe(before);
  });

  it('a wall moves like a tower: mask, both fields, free, refund basis kept', () => {
    const { sim } = makeSim(
      openLevel(7, 3, { x: 0, y: 1 }, { x: 6, y: 1 }, [], {
        waves: [trivialWave(), trivialWave()],
      }),
    );
    const before = sim.state.treasuryMg;
    sim.tick([place('wall', 3, 0)]);
    const wall = sim.state.structures[0]!;
    const paid = wall.paidMg;
    const afterBuildMg = sim.state.treasuryMg;

    sim.tick([move(3, 0, 3, 2)]);
    const s = sim.state.structures[0]!;
    expect(s.id).toBe(wall.id);
    expect(s.kind).toBe('wall');
    expect([s.tx, s.ty]).toEqual([3, 2]);
    expect(s.paidMg).toBe(paid);
    expect(s.provisional).toBe(true);
    expect(sim.state.treasuryMg).toBe(afterBuildMg);
    expect(sim.grid.isBlocked(3, 0)).toBe(false);
    expect(sim.grid.isBlocked(3, 2)).toBe(true);
    expect(sim.inbound.cost[sim.grid.idx(3, 0)]).toBeGreaterThan(0);
    expect(sim.inbound.cost[sim.grid.idx(3, 2)]).toBe(-1);
    expect(sim.returning.cost[sim.grid.idx(3, 0)]).toBeGreaterThan(0);
    expect(sim.returning.cost[sim.grid.idx(3, 2)]).toBe(-1);
    expect(sim.events.some((e) => e.kind === 'placementRejected')).toBe(false);

    // Still provisional, so removal still refunds in full — the move changed
    // nothing about what the wall is worth.
    sim.tick([remove(3, 2)]);
    expect(sim.state.treasuryMg).toBe(before);
  });

  it('a wall cannot move onto a socket, exactly as it cannot be placed on one', () => {
    const { sim } = makeSim(
      openLevel(7, 3, { x: 0, y: 1 }, { x: 6, y: 1 }, [], {
        map: ['.o.....', '.......', '.......'],
      }),
    );
    sim.tick([place('wall', 3, 0)]);
    expect(sim.previewPlacement('wall', 1, 0)).toBe('not-buildable');
    expect(sim.previewMove(3, 0, 1, 0)).toBe('not-buildable');
    sim.tick([move(3, 0, 1, 0)]);
    const s = sim.state.structures[0]!;
    expect([s.tx, s.ty]).toEqual([3, 0]);
    expect(sim.grid.isBlocked(3, 0)).toBe(true);
    expect(sim.events.some((e) => e.kind === 'placementRejected')).toBe(true);
    // The same socket takes a tower's move.
    sim.tick([place('tower', 5, 0)]);
    expect(sim.previewMove(5, 0, 1, 0)).toBe('ok');
  });

  it('rejects every move while a wave runs, provisional structures included', () => {
    const { sim } = makeSim(
      openLevel(7, 3, { x: 0, y: 1 }, { x: 6, y: 1 }, [], {
        waves: [trivialWave(), trivialWave()],
      }),
    );
    sim.tick([place('tower', 3, 0)]);
    sim.tick([startWave()]); // commits the tower
    expect(sim.state.runPhase).toBe('wave');
    sim.tick([move(3, 0, 3, 2)]);
    expect([sim.state.structures[0]!.tx, sim.state.structures[0]!.ty]).toEqual([3, 0]);
    expect(sim.events.some((e) => e.kind === 'placementRejected')).toBe(true);

    // A tower placed during the stopped wave is provisional — and still
    // immovable: the gate reads the phase, not the flag.
    sim.commit([place('tower', 3, 2)]);
    expect(sim.state.structures[1]!.provisional).toBe(true);
    sim.commit([move(3, 2, 4, 2)]);
    expect([sim.state.structures[1]!.tx, sim.state.structures[1]!.ty]).toEqual([3, 2]);
  });

  it('rejects moves in the settled-locked state', () => {
    const { sim } = makeSim(
      openLevel(9, 3, { x: 0, y: 1 }, { x: 8, y: 1 }),
      testBalance({ bounty: 0 }),
    );
    // Drain the treasury to exactly 0, start the only wave, then overdraw
    // mid-wave: the settlement lands in debt after the final wave.
    sim.tick([place('tower', 1, 0), place('tower', 3, 0), place('tower', 5, 0)]);
    sim.tick([place('tower', 7, 0)]);
    expect(sim.state.treasuryMg).toBe(0);
    sim.tick([startWave()]);
    sim.tick([place('wall', 1, 2)]); // → -4000, legal at balance 0
    expect(sim.state.treasuryMg).toBe(-4000);
    sim.state.enemies.forEach((e) => (e.hp = 0));
    sim.tick([]);
    expect(sim.state.runPhase).toBe('settled-locked');

    sim.tick([move(1, 0, 1, 1)]);
    expect([sim.state.structures[0]!.tx, sim.state.structures[0]!.ty]).toEqual([1, 0]);
    expect(sim.events.some((e) => e.kind === 'placementRejected')).toBe(true);
  });

  it('the freed origin makes the slide along a wall line legal', () => {
    // Wall line down x=3 with the tower at (3,2) and the only gap at (3,4):
    // moving the tower into the gap is legal ONLY because its own tile opens
    // in the same evaluation.
    const { sim } = makeSim(openLevel(7, 5, { x: 0, y: 2 }, { x: 6, y: 2 }));
    sim.tick([place('wall', 3, 0), place('wall', 3, 1), place('wall', 3, 3)]);
    sim.tick([place('tower', 3, 2)]);
    expect(sim.state.structures).toHaveLength(4);

    // A plain placement at the gap would seal — the origin is still standing.
    expect(sim.previewPlacement('tower', 3, 4)).toBe('seals-spawn');
    // The move sees the origin freed and accepts.
    expect(sim.previewMove(3, 2, 3, 4)).toBe('ok');
    sim.tick([move(3, 2, 3, 4)]);
    expect([sim.state.structures[3]!.tx, sim.state.structures[3]!.ty]).toEqual([3, 4]);
    // The reroute now runs through the vacated origin, in the same tick.
    expect(sim.grid.isBlocked(3, 2)).toBe(false);
    expect(sim.inbound.cost[sim.grid.idx(3, 2)]).toBeGreaterThan(0);
    expect(sim.inbound.cost[sim.grid.idx(3, 4)]).toBe(-1);
  });

  it('rejects sealing, stranding, enemy-held, occupied and same-tile destinations', () => {
    // Sealing: walls leave (3,2) as the only pass; the tower at (1,1) cannot
    // plug it — its freed origin does not reconnect the spawn.
    const seal = makeSim(openLevel(7, 5, { x: 0, y: 2 }, { x: 6, y: 2 })).sim;
    seal.tick([place('wall', 3, 0), place('wall', 3, 1), place('wall', 3, 3), place('wall', 3, 4)]);
    seal.tick([place('tower', 1, 1)]);
    expect(seal.previewMove(1, 1, 3, 2)).toBe('seals-spawn');
    seal.tick([move(1, 1, 3, 2)]);
    expect([seal.state.structures[4]!.tx, seal.state.structures[4]!.ty]).toEqual([1, 1]);
    expect(seal.grid.isBlocked(3, 2)).toBe(false);
    expect(seal.events.some((e) => e.kind === 'placementRejected')).toBe(true);

    // Stranding: the parked enemy at (3,0) is pocketed once (4,0) closes.
    const strand = makeSim(openLevel(7, 5, { x: 0, y: 0 }, { x: 6, y: 0 })).sim;
    injectEnemy(strand, 3, 0);
    strand.tick([place('wall', 2, 0), place('wall', 3, 1)]);
    strand.tick([place('tower', 5, 2)]);
    expect(strand.previewMove(5, 2, 4, 0)).toBe('strands-enemy');
    strand.tick([move(5, 2, 4, 0)]);
    expect([strand.state.structures[2]!.tx, strand.state.structures[2]!.ty]).toEqual([5, 2]);

    // Enemy-held, occupied (structure), and the tower's own tile.
    const rest = makeSim(openLevel(7, 5, { x: 0, y: 0 }, { x: 6, y: 0 })).sim;
    injectEnemy(rest, 3, 2);
    rest.tick([place('tower', 1, 3), place('wall', 1, 4)]);
    expect(rest.previewMove(1, 3, 3, 2)).toBe('enemy-in-footprint');
    expect(rest.previewMove(1, 3, 1, 4)).toBe('occupied');
    expect(rest.previewMove(1, 3, 1, 3)).toBe('occupied');
    rest.tick([move(1, 3, 3, 2), move(1, 3, 1, 4), move(1, 3, 1, 3)]);
    expect([rest.state.structures[0]!.tx, rest.state.structures[0]!.ty]).toEqual([1, 3]);
    expect(rest.events.filter((e) => e.kind === 'placementRejected')).toHaveLength(3);
  });

  it('moves through the socket matrix: dirt→socket, socket→dirt, socket→socket', () => {
    // dirt→socket: no path checks apply, but the freed origin still rebuilds
    // the fields — unlike a socket placement, which touches nothing (D6).
    const { sim } = makeSim(
      openLevel(7, 3, { x: 0, y: 1 }, { x: 6, y: 1 }, [], {
        map: ['.o.o...', '.......', '.......'],
      }),
    );
    sim.tick([place('tower', 4, 0)]); // dirt
    expect(sim.inbound.cost[sim.grid.idx(4, 0)]).toBe(-1);
    sim.tick([move(4, 0, 1, 0)]); // → socket
    expect([sim.state.structures[0]!.tx, sim.state.structures[0]!.ty]).toEqual([1, 0]);
    expect(sim.grid.isBlocked(4, 0)).toBe(false);
    expect(sim.inbound.cost[sim.grid.idx(4, 0)]).toBeGreaterThan(0); // freed this tick
    expect(sim.grid.isBlocked(1, 0)).toBe(true); // terrain-blocked as ever

    // socket→socket: no mask change, no rebuild — the live field object and
    // its costs are untouched, like the socket placement fast-path.
    const inboundBefore = sim.inbound;
    const costsBefore = Array.from(sim.inbound.cost);
    sim.tick([move(1, 0, 3, 0)]);
    expect([sim.state.structures[0]!.tx, sim.state.structures[0]!.ty]).toEqual([3, 0]);
    expect(sim.inbound).toBe(inboundBefore);
    expect(Array.from(sim.inbound.cost)).toEqual(costsBefore);

    // socket→dirt: validates exactly as a placement at the destination; the
    // socket origin stays terrain-blocked, the dirt destination blocks.
    sim.tick([move(3, 0, 2, 0)]);
    expect([sim.state.structures[0]!.tx, sim.state.structures[0]!.ty]).toEqual([2, 0]);
    expect(sim.grid.isBlocked(3, 0)).toBe(true);
    expect(sim.grid.isBlocked(2, 0)).toBe(true);
    expect(sim.inbound.cost[sim.grid.idx(2, 0)]).toBe(-1);
  });

  it('move rejection is atomic: post-tick hash equals the run without the attempt', () => {
    const build = () => {
      const { sim } = makeSim(openLevel(7, 5, { x: 0, y: 2 }, { x: 6, y: 2 }));
      sim.tick([place('wall', 3, 0), place('wall', 3, 1), place('wall', 3, 3), place('wall', 3, 4)]);
      sim.tick([place('tower', 1, 1)]);
      return sim;
    };
    const withAttempt = build();
    const without = build();
    withAttempt.tick([move(1, 1, 3, 2)]); // rejected: seals
    without.tick([]);
    for (let t = 0; t < 20; t++) {
      withAttempt.tick([]);
      without.tick([]);
    }
    expect(withAttempt.hash()).toBe(without.hash());
  });
});

describe('move previews (path-preview delta)', () => {
  it('sweeping every candidate leaves the state hash untouched', () => {
    const build = () => {
      const { sim } = makeSim(
        openLevel(9, 5, { x: 0, y: 2 }, { x: 8, y: 2 }, [], {
          map: ['....o....', '.........', '.........', '.........', '.........'],
        }),
      );
      sim.tick([place('wall', 4, 3), place('wall', 4, 4), place('tower', 4, 1)]);
      return sim;
    };
    const swept = build();
    const untouched = build();
    injectEnemy(swept, 2, 2);
    injectEnemy(untouched, 2, 2);

    for (let ty = -1; ty <= 5; ty++) {
      for (let tx = -1; tx <= 9; tx++) {
        swept.previewMove(4, 1, tx, ty);
        swept.previewMoveRoutes(4, 1, tx, ty);
      }
    }
    for (let t = 0; t < 20; t++) {
      swept.tick([]);
      untouched.tick([]);
    }
    expect(swept.hash()).toBe(untouched.hash());
  });

  it('a held result survives a later evaluation and a confirmed move', () => {
    const { sim } = makeSim(openLevel(9, 5, { x: 0, y: 2 }, { x: 8, y: 2 }));
    sim.tick([place('tower', 4, 1)]);
    const held = sim.previewMoveRoutes(4, 1, 4, 2);
    expect(held.verdict).toBe('ok');
    expect(held.lanes).not.toBeNull();
    const snapshot = JSON.stringify(held);

    // A second evaluation overwrites `scratch`…
    sim.previewMoveRoutes(4, 1, 6, 3);
    expect(JSON.stringify(held)).toBe(snapshot);

    // …and a confirmed move swaps `scratch` into live state.
    sim.tick([move(4, 1, 6, 3)]);
    expect([sim.state.structures[0]!.tx, sim.state.structures[0]!.ty]).toEqual([6, 3]);
    expect(JSON.stringify(held)).toBe(snapshot);
  });

  it('projected lanes route through the freed origin tile', () => {
    // The slide fixture: the gap at (3,4) is the current route; the candidate
    // blocks it and the projection must run through the vacated (3,2).
    const { sim } = makeSim(openLevel(7, 5, { x: 0, y: 2 }, { x: 6, y: 2 }));
    sim.tick([place('wall', 3, 0), place('wall', 3, 1), place('wall', 3, 3)]);
    sim.tick([place('tower', 3, 2)]);
    expect(sim.currentLanes()[0]!.some((t) => t.x === 3 && t.y === 4)).toBe(true);

    const preview = sim.previewMoveRoutes(3, 2, 3, 4);
    expect(preview.verdict).toBe('ok');
    expect(preview.orphaned).toBeNull();
    expect(preview.lanes![0]!.some((t) => t.x === 3 && t.y === 2)).toBe(true); // the freed origin
    expect(preview.lanes![0]!.some((t) => t.x === 3 && t.y === 4)).toBe(false); // the blocked candidate
    // …while the live lanes are unchanged: nothing was committed.
    expect(sim.currentLanes()[0]!.some((t) => t.x === 3 && t.y === 4)).toBe(true);
  });

  it('yields null lanes for every routing-independent rejection', () => {
    const level = () =>
      openLevel(7, 3, { x: 0, y: 1 }, { x: 6, y: 1 }, [], {
        map: ['.rgo.o.', '.......', '.......'],
      });
    const { sim } = makeSim(level());
    sim.tick([place('tower', 4, 2), place('wall', 2, 2), place('tower', 3, 0)]);
    injectEnemy(sim, 5, 1);

    // Nothing movable at the origin (a bare tile).
    expect(sim.previewMoveRoutes(6, 2, 4, 1)).toEqual({ verdict: 'not-buildable', lanes: null, orphaned: null });
    // A wall bound for a free socket: the mover's terrain rule, no routing.
    expect(sim.previewMoveRoutes(2, 2, 5, 0)).toEqual({ verdict: 'not-buildable', lanes: null, orphaned: null });
    // Out of bounds, terrain, occupied, own tile, enemy-held.
    expect(sim.previewMoveRoutes(4, 2, -1, 1)).toEqual({ verdict: 'out-of-bounds', lanes: null, orphaned: null });
    expect(sim.previewMoveRoutes(4, 2, 1, 0).verdict).toBe('not-buildable'); // rock
    expect(sim.previewMoveRoutes(4, 2, 1, 0).lanes).toBeNull();
    expect(sim.previewMoveRoutes(4, 2, 2, 0).verdict).toBe('not-buildable'); // grass
    expect(sim.previewMoveRoutes(4, 2, 2, 2).verdict).toBe('occupied'); // wall
    expect(sim.previewMoveRoutes(4, 2, 2, 2).lanes).toBeNull();
    expect(sim.previewMoveRoutes(4, 2, 4, 2).verdict).toBe('occupied'); // own tile
    expect(sim.previewMoveRoutes(4, 2, 4, 2).lanes).toBeNull();
    expect(sim.previewMoveRoutes(4, 2, 5, 1).verdict).toBe('enemy-in-footprint');
    expect(sim.previewMoveRoutes(4, 2, 5, 1).lanes).toBeNull();
    // The socket→socket move rebuilds nothing — and cannot leak the previous
    // evaluation's fields as its own.
    sim.previewMoveRoutes(4, 2, 4, 1); // primes `scratch` with another tile's fields
    expect(sim.previewMoveRoutes(3, 0, 5, 0)).toEqual({ verdict: 'ok', lanes: null, orphaned: null });
  });

  it('populates the orphan set for a sealing move, freed origin included', () => {
    const { sim } = makeSim(openLevel(7, 5, { x: 0, y: 2 }, { x: 6, y: 2 }));
    sim.tick([place('wall', 3, 0), place('wall', 3, 1), place('wall', 3, 3), place('wall', 3, 4)]);
    sim.tick([place('tower', 1, 1)]);

    const preview = sim.previewMoveRoutes(1, 1, 3, 2);
    expect(preview.verdict).toBe('seals-spawn');
    expect(preview.lanes).toEqual([[], []]);
    const orphaned = preview.orphaned!;
    // Everything west of the closed line is cut off, the spawn included —
    // and so is the vacated origin, walkable only in the projection.
    expect(orphaned.every((t) => t.x < 3)).toBe(true);
    expect(orphaned).toContainEqual({ x: 0, y: 2 });
    expect(orphaned).toContainEqual({ x: 1, y: 1 });
    // The sealing candidate itself is the cause, not part of the region.
    expect(orphaned).not.toContainEqual({ x: 3, y: 2 });
    // Moving off the sealing tile clears it.
    expect(sim.previewMoveRoutes(1, 1, 2, 1).orphaned).toBeNull();
  });
});

describe('previewRoutes (path-preview spec)', () => {
  it('sweeping every tile leaves the state hash untouched', () => {
    const build = () => makeSim(openLevel(9, 5, { x: 0, y: 2 }, { x: 8, y: 2 })).sim;
    const swept = build();
    const untouched = build();
    swept.tick([place('wall', 4, 0), place('wall', 4, 4)]);
    untouched.tick([place('wall', 4, 0), place('wall', 4, 4)]);

    for (let ty = -1; ty <= 5; ty++) {
      for (let tx = -1; tx <= 9; tx++) {
        swept.previewRoutes('wall', tx, ty);
        swept.previewRoutes('tower', tx, ty);
      }
    }
    for (let t = 0; t < 20; t++) {
      swept.tick([]);
      untouched.tick([]);
    }
    expect(swept.hash()).toBe(untouched.hash());
  });

  it('a held result survives a later evaluation and a confirmed placement', () => {
    const { sim } = makeSim(openLevel(9, 5, { x: 0, y: 2 }, { x: 8, y: 2 }));
    const held = sim.previewRoutes('wall', 4, 1);
    expect(held.verdict).toBe('ok');
    expect(held.lanes).not.toBeNull();
    const snapshot = JSON.stringify(held);

    // A second evaluation overwrites `scratch`…
    sim.previewRoutes('wall', 6, 3);
    expect(JSON.stringify(held)).toBe(snapshot);

    // …and a confirmed placement swaps `scratch` into live state (sim.ts).
    sim.tick([place('wall', 6, 3)]);
    expect(sim.state.structures).toHaveLength(1);
    expect(JSON.stringify(held)).toBe(snapshot);
  });

  it('projects the lanes a routing-valid placement would produce', () => {
    const { sim } = makeSim(openLevel(9, 5, { x: 0, y: 2 }, { x: 8, y: 2 }));
    const current = sim.currentLanes();
    // One inbound lane per active spawn, then the return lane.
    expect(current).toHaveLength(2);
    expect(current[0]![0]).toEqual({ x: 0, y: 2 });
    expect(current[0]!.at(-1)).toEqual({ x: 8, y: 2 });
    expect(current[1]![0]).toEqual({ x: 8, y: 2 });
    expect(current[1]!.at(-1)).toEqual({ x: 0, y: 2 });

    // A wall in the straight lane pushes the projected route off it.
    const preview = sim.previewRoutes('wall', 4, 2);
    expect(preview.verdict).toBe('ok');
    expect(preview.orphaned).toBeNull();
    expect(preview.lanes).toHaveLength(2);
    expect(preview.lanes![0]!.some((t) => t.x === 4 && t.y === 2)).toBe(false);
    // …while the live lanes are unchanged: nothing was committed.
    expect(sim.currentLanes()).toEqual(current);
  });

  it('returns no lanes for every verdict reached before the fields are rebuilt', () => {
    // 7×3 with rock (1,0), socket (3,0), grass (5,0) — the palette level.
    const level = () =>
      openLevel(7, 3, { x: 0, y: 1 }, { x: 6, y: 1 }, [], { map: ['.r.o.g.', '.......', '.......'] });

    const oob = makeSim(level()).sim;
    expect(oob.previewRoutes('wall', -1, 1)).toEqual({
      verdict: 'out-of-bounds',
      lanes: null,
      orphaned: null,
    });

    const terrain = makeSim(level()).sim;
    expect(terrain.previewRoutes('wall', 1, 0).verdict).toBe('not-buildable'); // rock
    expect(terrain.previewRoutes('wall', 1, 0).lanes).toBeNull();
    expect(terrain.previewRoutes('tower', 5, 0).verdict).toBe('not-buildable'); // grass
    expect(terrain.previewRoutes('tower', 5, 0).lanes).toBeNull();

    const occupied = makeSim(level()).sim;
    occupied.tick([place('wall', 2, 2)]);
    expect(occupied.previewRoutes('wall', 2, 2).verdict).toBe('occupied');
    expect(occupied.previewRoutes('wall', 2, 2).lanes).toBeNull();

    const enemyOn = makeSim(level()).sim;
    injectEnemy(enemyOn, 2, 1);
    expect(enemyOn.previewRoutes('wall', 2, 1).verdict).toBe('enemy-in-footprint');
    expect(enemyOn.previewRoutes('wall', 2, 1).lanes).toBeNull();

    // A socket tower is accepted without ever rebuilding the fields (D6), so
    // it too has no projection — and cannot expose the previous hover's.
    const socket = makeSim(level()).sim;
    socket.previewRoutes('wall', 2, 2); // primes `scratch` with another tile's fields
    expect(socket.previewRoutes('tower', 3, 0)).toEqual({
      verdict: 'ok',
      lanes: null,
      orphaned: null,
    });

    const broke = makeSim(level()).sim;
    broke.state.treasuryMg = -1;
    expect(broke.previewRoutes('wall', 2, 2)).toEqual({
      verdict: 'no-funds',
      lanes: null,
      orphaned: null,
    });
  });

  it('shades the whole orphaned quarter when the last gap in level_01 closes', () => {
    // Rock wall A runs down x=4 from y=0 to y=7 (the socket at (4,4) is
    // blocked terrain too); walls at (4,8) and (4,9) complete it.
    const sim = new Sim(loadGameData(level01Json, balanceJson), 1);
    sim.tick([place('wall', 4, 9)]);
    expect(sim.state.structures).toHaveLength(1);

    const preview = sim.previewRoutes('wall', 4, 8);
    expect(preview.verdict).toBe('seals-spawn');
    expect(preview.lanes).not.toBeNull();
    // Neither lane has a route left: the west spawn is level_01's only one,
    // so it is also the return field's only source.
    expect(preview.lanes).toEqual([[], []]);

    // Columns 0–3 entirely: 39 walkable tiles (only (0,0) is grass).
    const orphaned = preview.orphaned!;
    expect(orphaned).toHaveLength(39);
    expect(orphaned.every((t) => t.x < 4)).toBe(true);
    expect(orphaned).toContainEqual({ x: 0, y: 5 }); // the spawn itself
    // The ghost tile is the cause, not part of the cut-off region.
    expect(orphaned).not.toContainEqual({ x: 4, y: 8 });

    // Moving off the sealing tile clears it.
    expect(sim.previewRoutes('wall', 10, 5).orphaned).toBeNull();
  });

  it('sealing one of two active spawns leaves the other lane projected', () => {
    // The north spawn (0,0) exits only east through (1,0); the rocks at
    // (0,1)/(1,1) block the southern step and the diagonal alike.
    const wave = (spawn: string) => ({
      groups: [{ spawn, type: 'runner', count: 1, spawnInterval: 1, delay: 0 }],
    });
    const { sim } = makeSim({
      id: 'test',
      grid: { width: 7, height: 3 },
      treasury: { x: 6, y: 1 },
      spawns: [
        { id: 'north', x: 0, y: 0, activeFromWave: 1 },
        { id: 'south', x: 0, y: 2, activeFromWave: 1 },
      ],
      terrain: { legend: { '.': 'dirt', r: 'rock' }, map: ['.......', 'rr.....', '.......'] },
      economy: { startingTreasury: 200, interestRatePerTick: 0 },
      waves: [wave('north'), wave('south')],
    });

    const preview = sim.previewRoutes('wall', 1, 0);
    expect(preview.verdict).toBe('seals-spawn');
    expect(preview.orphaned).toEqual([{ x: 0, y: 0 }]);
    // North blanks; south still routes, and so does the treasury's way out.
    expect(preview.lanes![0]).toEqual([]);
    expect(preview.lanes![1]!.at(-1)).toEqual({ x: 6, y: 1 });
    expect(preview.lanes![2]![0]).toEqual({ x: 6, y: 1 });
    expect(preview.lanes![2]!.at(-1)).toEqual({ x: 0, y: 2 });
  });
});
