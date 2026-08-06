// See ARCHITECTURE.md §12 and the phase-2/phase-4 structure-placement specs
import { describe, expect, it } from 'vitest';
import { tileCentre, toTile } from '../src/sim/fixed';
import {
  injectEnemy,
  makeSim,
  openLevel,
  place,
  remove,
  spawnCmd,
  startWave,
  testBalance,
  trivialWave,
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

    // One tick, no countdown: gone, unblocked, half the paid cost credited.
    expect(sim.state.structures).toHaveLength(0);
    expect(sim.grid.isBlocked(2, 0)).toBe(false);
    expect(sim.state.treasuryMg).toBe(afterBuildMg + 2000);
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
    expect(sim.state.structures).toHaveLength(0);
    expect(sim.state.treasuryMg).toBe(afterBuildMg + 25_000);
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
