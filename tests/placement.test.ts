// See ARCHITECTURE.md §12 and the phase-2/phase-4 structure-placement specs
import { describe, expect, it } from 'vitest';
import balanceJson from '../src/data/balance.json';
import level01Json from '../src/data/levels/level_01.json';
import { loadGameData } from '../src/data/schema';
import { liquidationTotalMg } from '../src/sim/economy';
import { tileCentre, toTile } from '../src/sim/fixed';
import { Sim } from '../src/sim/sim';
import {
  INERT_POWER,
  injectEnemy,
  makeSim,
  mount,
  move,
  openLevel,
  place,
  placeWithWall,
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
    // A tower needs that wall first, so it never reaches the enemy check:
    // bare dirt refuses it as needs-wall, enemy or no enemy (build-over-walls).
    expect(sim.previewPlacement('tower', 3, 2)).toBe('needs-wall');
    sim.tick([place('tower', 3, 2)]);
    expect(sim.state.structures).toHaveLength(0);
    // The neighbouring tile is fine — wall, then the tower on it.
    sim.tick(mount(4, 3));
    expect(sim.state.structures).toHaveLength(2);
  });

  it('rejects cutting a carrier off from its origin even with another spawn reachable', () => {
    // West (0,0) and mid (2,2) both active; treasury (4,0). The pocket row
    // (2,3)–(4,3) exits two ways: east up column 4, and north over the mid
    // spawn tile — which no route may transit. Walling (4,3) therefore cuts
    // a west-origin carrier at (2,3) off from ITS spawn even though the mid
    // spawn sits directly beside it, still reachable as an endpoint.
    const wave = (spawn: string) => ({
      groups: [{ spawn, type: 'runner', count: 1, spawnInterval: 1, delay: 0 }],
    });
    const level = () => ({
      id: 'test',
      grid: { width: 5, height: 4 },
      treasury: { x: 4, y: 0 },
      spawns: [
        { id: 'west', x: 0, y: 0, activeFromWave: 1 },
        { id: 'mid', x: 2, y: 2, activeFromWave: 1 },
      ],
      terrain: { legend: { '.': 'dirt', r: 'rock' }, map: ['.....', '.....', 'rr.r.', 'rr...'] },
      economy: { startingTreasury: 200, interestRatePerTick: 0 },
      power: INERT_POWER,
      waves: [wave('west'), wave('mid')],
    });
    const strand = makeSim(level()).sim;
    injectEnemy(strand, 2, 3, { mode: 'returning', carriedMg: 10_000, originSpawn: 0 });
    expect(strand.previewPlacement('wall', 4, 3)).toBe('strands-enemy');
    strand.tick([place('wall', 4, 3)]);
    expect(strand.state.structures).toHaveLength(0);
    expect(strand.events.some((e) => e.kind === 'placementRejected')).toBe(true);

    // The identical placement is legal when the pocket carrier's origin IS
    // the adjacent mid spawn — the strand check is genuinely per-origin.
    const legal = makeSim(level()).sim;
    injectEnemy(legal, 2, 3, { mode: 'returning', carriedMg: 10_000, originSpawn: 1 });
    expect(legal.previewPlacement('wall', 4, 3)).toBe('ok');
    legal.tick([place('wall', 4, 3)]);
    expect(legal.state.structures).toHaveLength(1);
  });

  it('a tower stands on a wall segment: one tile, the tower cost, the line unchanged', () => {
    // Wall line across x=3 with gaps at (3,1) and (3,2).
    const { sim } = makeSim(openLevel(7, 5, { x: 0, y: 2 }, { x: 6, y: 2 }));
    sim.tick([place('wall', 3, 0), place('wall', 3, 3), place('wall', 3, 4)]);
    expect(sim.state.structures).toHaveLength(3);

    // A wall closes the (3,1) gap like any segment, and the tower then stands
    // on it: exactly that tile carries the tower, the tower's cost alone is
    // charged, and the mask is what the wall made it — the tower is a wall
    // segment that shoots.
    sim.tick([place('wall', 3, 1)]);
    const before = sim.state.treasuryMg;
    sim.tick([place('tower', 3, 1)]);
    expect(sim.state.structures).toHaveLength(5);
    expect(sim.state.treasuryMg).toBe(before - 50_000);
    expect(sim.grid.isBlocked(3, 1)).toBe(true);
    expect(sim.grid.isBlocked(4, 1)).toBe(false);
    expect(sim.grid.isBlocked(3, 2)).toBe(false);

    // A wall in the last gap would seal the corridor — rejected as ever.
    sim.tick([place('wall', 3, 2)]);
    expect(sim.state.structures).toHaveLength(5);
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
    // Three mounted towers (rapid 54g, sniper 74g, slow 64g) and two walls
    // against a 200g treasury → balance 0, still spendable.
    sim.tick([...mount(1, 0, 'rapid'), ...mount(3, 0, 'sniper'), ...mount(5, 0, 'slow')]);
    sim.tick([place('wall', 1, 6), place('wall', 1, 8)]);
    expect(sim.state.treasuryMg).toBe(0);
    // Balance 0 → the debt purchase is permitted and goes negative.
    sim.tick([place('wall', 3, 6)]);
    expect(sim.state.structures).toHaveLength(9);
    expect(sim.state.treasuryMg).toBe(-4000);
    // Below 0 → all spending is blocked, nothing changes.
    sim.tick([place('wall', 5, 6)]);
    expect(sim.state.structures).toHaveLength(9);
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
    expect(sim.returning[0]!.cost[sim.grid.idx(2, 0)]).toBeGreaterThan(0);
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
    expect(sim.returning[0]!.cost[sim.grid.idx(3, 1)]).toBeGreaterThan(0);

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

  it('a panel is a wall on the terrain rules: dirt yes, socket no, scenery no', () => {
    const { sim } = makeSim(paletteLevel());
    expect(sim.previewPlacement('panel', 3, 0)).toBe('not-buildable'); // socket
    expect(sim.previewPlacement('panel', 5, 0)).toBe('not-buildable'); // grass
    expect(sim.previewPlacement('panel', 1, 0)).toBe('not-buildable'); // rock
    expect(sim.previewPlacement('panel', 2, 0)).toBe('ok'); // dirt
    sim.tick([place('panel', 3, 0), place('panel', 5, 0)]);
    expect(sim.state.structures).toHaveLength(0);
    expect(sim.events.filter((e) => e.kind === 'placementRejected')).toHaveLength(2);
    // On dirt: one tile blocked, charged at the panel's price (40g in the
    // test balance), archetype-less at level 0 like a wall, provisional.
    const before = sim.state.treasuryMg;
    sim.tick([place('panel', 2, 0)]);
    expect(sim.state.structures).toHaveLength(1);
    expect(sim.state.structures[0]).toMatchObject({
      kind: 'panel',
      tx: 2,
      ty: 0,
      archetypeId: -1,
      level: 0,
      paidMg: 40_000,
      provisional: true,
    });
    expect(sim.state.treasuryMg).toBe(before - 40_000);
    expect(sim.grid.isBlocked(2, 0)).toBe(true);
    // Blocked like a wall: the inbound field routes around it.
    expect(sim.inbound.cost[sim.grid.idx(2, 0)]).toBe(-1);
  });

  it('a panel that would seal every path is rejected, unpaid', () => {
    const { sim } = makeSim(openLevel(5, 3, { x: 0, y: 1 }, { x: 4, y: 1 }));
    sim.tick([place('panel', 2, 0), place('wall', 2, 2)]);
    expect(sim.state.structures).toHaveLength(2);
    const before = sim.state.treasuryMg;
    expect(sim.previewPlacement('panel', 2, 1)).toBe('seals-spawn');
    sim.tick([place('panel', 2, 1)]);
    expect(sim.state.structures).toHaveLength(2);
    expect(sim.state.treasuryMg).toBe(before);
    expect(sim.grid.isBlocked(2, 1)).toBe(false);
  });

  it('a panel is ground only: no tower on it, no panel on a wall, no wall on a panel', () => {
    const { sim } = makeSim(openLevel(7, 3, { x: 0, y: 1 }, { x: 6, y: 1 }));
    const twin = makeSim(openLevel(7, 3, { x: 0, y: 1 }, { x: 6, y: 1 })).sim;
    for (const s of [sim, twin]) s.tick([place('panel', 2, 0), place('wall', 4, 0)]);
    expect(sim.state.structures).toHaveLength(2);
    const before = sim.state.treasuryMg;
    // Not a foundation: a tower on a panel reads exactly like bare dirt.
    expect(sim.previewPlacement('tower', 2, 0)).toBe('needs-wall');
    expect(sim.previewPlacement('tower', 2, 1)).toBe('needs-wall');
    // One ground structure per tile, whichever kind stands there.
    expect(sim.previewPlacement('panel', 4, 0)).toBe('occupied');
    expect(sim.previewPlacement('wall', 2, 0)).toBe('occupied');
    sim.tick([place('tower', 2, 0), place('panel', 4, 0), place('wall', 2, 0)]);
    twin.tick([]);
    expect(sim.state.structures).toHaveLength(2);
    expect(sim.state.treasuryMg).toBe(before);
    expect(sim.hash()).toBe(twin.hash());
    expect(sim.events.filter((e) => e.kind === 'placementRejected')).toHaveLength(3);
    // The wall beside it still takes the tower: the rule is the panel's, not the tile's.
    expect(sim.previewPlacement('tower', 4, 0)).toBe('ok');
  });

  it('a panel cannot be upgraded: it is not a tower', () => {
    const { sim } = makeSim(openLevel(5, 3, { x: 0, y: 1 }, { x: 4, y: 1 }));
    sim.tick([place('panel', 2, 0)]);
    const before = sim.state.treasuryMg;
    sim.tick([upgrade(2, 0)]);
    expect(sim.state.structures[0]!.level).toBe(0);
    expect(sim.state.treasuryMg).toBe(before);
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
      power: INERT_POWER,
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


/** A 5×3 corridor with two waves — one for committing, one still to run. */
const twoWaveCorridor = () =>
  openLevel(5, 3, { x: 0, y: 1 }, { x: 4, y: 1 }, [], {
    waves: [trivialWave(), trivialWave()],
  });

// Towers stand on foundations (build-over-walls, structure-placement delta):
// a tower goes on a bare wall or an empty socket, never on bare dirt; wall
// and tower are two structures on one tile with separate books; only walls
// own the mask, so a tower placement never validates a route or rebuilds a
// field.
describe('towers stand on foundations (build-over-walls)', () => {
  const corridor = () => openLevel(7, 3, { x: 0, y: 1 }, { x: 6, y: 1 });

  it('mounting on a bare wall charges the tower only and touches no field', () => {
    const { sim } = makeSim(corridor());
    sim.tick([place('wall', 3, 0)]);
    const wall = sim.state.structures[0]!;
    const afterWallMg = sim.state.treasuryMg;
    const inboundBefore = sim.inbound;
    const returningBefore = sim.returning;
    const costsBefore = Array.from(sim.inbound.cost);

    expect(sim.previewPlacement('tower', 3, 0)).toBe('ok');
    sim.tick([place('tower', 3, 0)]);
    expect(sim.state.structures).toHaveLength(2);
    expect(sim.state.structures[0]).toBe(wall); // the wall stands, same record
    const tower = sim.state.structures[1]!;
    expect(tower.kind).toBe('tower');
    expect([tower.tx, tower.ty]).toEqual([3, 0]);
    expect(sim.state.treasuryMg).toBe(afterWallMg - 50_000);
    // No swap, no rebuild: the live field objects and their costs are untouched.
    expect(sim.inbound).toBe(inboundBefore);
    expect(sim.returning).toBe(returningBefore);
    expect(Array.from(sim.inbound.cost)).toEqual(costsBefore);
    expect(sim.grid.isBlocked(3, 0)).toBe(true);
    expect(sim.events.some((e) => e.kind === 'placementRejected')).toBe(false);
  });

  it('bare dirt needs a wall — rejected atomically', () => {
    const build = () => makeSim(corridor()).sim;
    const withAttempt = build();
    const without = build();
    expect(withAttempt.previewPlacement('tower', 3, 0)).toBe('needs-wall');
    withAttempt.tick([place('tower', 3, 0)]);
    without.tick([]);
    expect(withAttempt.state.structures).toHaveLength(0);
    expect(withAttempt.state.treasuryMg).toBe(200_000);
    expect(withAttempt.grid.isBlocked(3, 0)).toBe(false);
    expect(withAttempt.events.some((e) => e.kind === 'placementRejected')).toBe(true);
    expect(withAttempt.hash()).toBe(without.hash());
    // The same tile takes the tower once a wall stands on it.
    withAttempt.tick([place('wall', 3, 0)]);
    expect(withAttempt.previewPlacement('tower', 3, 0)).toBe('ok');
  });

  it('one tower per foundation: a mounted wall and a full socket are occupied', () => {
    const { sim } = makeSim(paletteLevel());
    sim.tick([...mount(2, 2), place('tower', 3, 0)]);
    expect(sim.state.structures).toHaveLength(3);
    expect(sim.previewPlacement('tower', 2, 2)).toBe('occupied');
    expect(sim.previewPlacement('tower', 3, 0)).toBe('occupied');
    sim.tick([place('tower', 2, 2), place('tower', 3, 0)]);
    expect(sim.state.structures).toHaveLength(3);
    expect(sim.events.filter((e) => e.kind === 'placementRejected')).toHaveLength(2);
  });

  it('a wall never accepts a second wall, tower or no tower', () => {
    const { sim } = makeSim(corridor());
    sim.tick([place('wall', 2, 0), ...mount(4, 0)]);
    expect(sim.previewPlacement('wall', 2, 0)).toBe('occupied'); // bare wall
    expect(sim.previewPlacement('wall', 4, 0)).toBe('occupied'); // mounted wall
    sim.tick([place('wall', 2, 0), place('wall', 4, 0)]);
    expect(sim.state.structures).toHaveLength(3);
  });

  it('a tower on a wall runs no path check: confirmed where a wall would seal', () => {
    // Wall line down x=3 with (3,2) the only gap: a fresh wall there seals,
    // and the standing walls flank the one lane. A tower on (3,1) never
    // enters the path pipeline — the tile was blocked already — so it is
    // confirmed with the fields left exactly as they were.
    const { sim } = makeSim(openLevel(7, 5, { x: 0, y: 2 }, { x: 6, y: 2 }));
    sim.tick([place('wall', 3, 0), place('wall', 3, 1), place('wall', 3, 3), place('wall', 3, 4)]);
    expect(sim.previewPlacement('wall', 3, 2)).toBe('seals-spawn');
    const inboundBefore = sim.inbound;
    const costsBefore = Array.from(sim.inbound.cost);
    expect(sim.previewPlacement('tower', 3, 1)).toBe('ok');
    sim.tick([place('tower', 3, 1)]);
    expect(sim.state.structures).toHaveLength(5);
    expect(sim.inbound).toBe(inboundBefore);
    expect(Array.from(sim.inbound.cost)).toEqual(costsBefore);
    expect(sim.grid.isBlocked(3, 2)).toBe(false); // the lane is still open
  });

  it('wall and tower keep separate books: mounting on a committed wall', () => {
    const { sim } = makeSim(twoWaveCorridor());
    sim.tick([place('wall', 2, 0)]);
    sim.tick([startWave()]); // commits the wall
    sim.state.enemies.forEach((e) => (e.hp = 0));
    sim.tick([]); // settles back to the build phase
    expect(sim.state.runPhase).toBe('build');
    const wall = sim.state.structures[0]!;
    expect(wall.provisional).toBe(false);

    const beforeMountMg = sim.state.treasuryMg;
    sim.tick([place('tower', 2, 0)]);
    const tower = sim.state.structures[1]!;
    expect(tower.provisional).toBe(true);
    expect(wall.provisional).toBe(false);
    expect(wall.paidMg).toBe(4000);
    expect(tower.paidMg).toBe(50_000);
    expect(sim.state.treasuryMg).toBe(beforeMountMg - 50_000);

    // The tower comes off at its full price; the wall's basis is unchanged
    // and refunds at the committed fraction afterwards.
    sim.tick([remove(2, 0)]);
    expect(sim.state.structures).toEqual([wall]);
    expect(sim.state.treasuryMg).toBe(beforeMountMg);
    sim.tick([remove(2, 0)]);
    expect(sim.state.structures).toHaveLength(0);
    expect(sim.state.treasuryMg).toBe(beforeMountMg + 2000);
  });

  it('mounting mid-wave on a committed wall is confirmed', () => {
    const { sim } = makeSim(twoWaveCorridor());
    sim.tick([place('wall', 2, 0)]);
    sim.tick([startWave()]); // commits the wall
    expect(sim.state.runPhase).toBe('wave');
    const wall = sim.state.structures[0]!;
    const before = sim.state.treasuryMg;
    const inboundBefore = sim.inbound;

    // Stopped wave: commit only, so the flag can be read before an advance.
    sim.commit([place('tower', 2, 0)]);
    expect(sim.state.structures).toHaveLength(2);
    expect(sim.state.structures[1]!.provisional).toBe(true);
    expect(wall.provisional).toBe(false);
    expect(sim.state.treasuryMg).toBe(before - 50_000);
    expect(sim.inbound).toBe(inboundBefore); // no rebuild for a tower
    expect(sim.grid.isBlocked(2, 0)).toBe(true);
    // The next advance commits the tower as it commits any placement.
    sim.advance();
    expect(sim.state.structures[1]!.provisional).toBe(false);
  });
});

// Removal peels a stacked tile top-down (build-over-walls design D3): the
// tower first, the wall once bare; a tower's removal never touches the mask.
describe('a tower placed with its wall (build-over-walls design D6)', () => {
  const corridor = () => openLevel(7, 3, { x: 0, y: 1 }, { x: 6, y: 1 });

  it('lands the wall and the tower on it, each its own structure, exactly as two commands would', () => {
    const { sim } = makeSim(corridor());
    const inboundBefore = sim.inbound;
    expect(sim.previewPlacement('tower', 3, 0, true)).toBe('ok');
    sim.tick([placeWithWall(3, 0)]);
    expect(sim.state.structures.map((s) => [s.kind, s.tx, s.ty, s.paidMg, s.provisional])).toEqual([
      ['wall', 3, 0, 4_000, true],
      ['tower', 3, 0, 50_000, true],
    ]);
    expect(sim.state.treasuryMg).toBe(200_000 - 54_000);
    expect(sim.grid.isBlocked(3, 0)).toBe(true);
    expect(sim.inbound).not.toBe(inboundBefore); // the wall's one rebuild
    expect(sim.events.some((e) => e.kind === 'placementRejected')).toBe(false);

    const twin = makeSim(corridor()).sim;
    twin.tick(mount(3, 0));
    expect(sim.hash()).toBe(twin.hash());
  });

  it('validates as the wall placement it contains: sealing, occupancy, enemies', () => {
    const { sim } = makeSim(openLevel(5, 3, { x: 0, y: 1 }, { x: 4, y: 1 }));
    sim.tick([place('wall', 2, 0), place('wall', 2, 2)]);
    expect(sim.previewPlacement('tower', 2, 1, true)).toBe('seals-spawn');
    expect(sim.previewPlacement('tower', 2, 0, true)).toBe('occupied'); // a wall stands: no second wall
    expect(sim.previewPlacement('tower', 2, 0)).toBe('ok'); // …but the tower alone mounts
    injectEnemy(sim, 1, 1);
    expect(sim.previewPlacement('tower', 1, 1, true)).toBe('enemy-in-footprint');
  });

  it('is gated on both purchases, and rejects atomically', () => {
    // 3g buys a wall alone (into debt) but not a wall and then a tower.
    const poor = () =>
      makeSim(
        openLevel(7, 3, { x: 0, y: 1 }, { x: 6, y: 1 }, [], {
          economy: { startingTreasury: 3, interestRatePerTick: 0 },
        }),
      ).sim;
    const sim = poor();
    expect(sim.previewPlacement('wall', 3, 0)).toBe('ok');
    expect(sim.previewPlacement('tower', 3, 0, true)).toBe('no-funds');
    const without = poor();
    sim.tick([placeWithWall(3, 0)]);
    without.tick([]);
    expect(sim.state.structures).toHaveLength(0);
    expect(sim.state.treasuryMg).toBe(3_000);
    expect(sim.grid.isBlocked(3, 0)).toBe(false);
    expect(sim.events.filter((e) => e.kind === 'placementRejected')).toHaveLength(1);
    expect(sim.hash()).toBe(without.hash());

    // A routing rejection is just as atomic: no wall is left behind.
    const build = () => {
      const { sim: s } = makeSim(openLevel(5, 3, { x: 0, y: 1 }, { x: 4, y: 1 }));
      s.tick([place('wall', 2, 0), place('wall', 2, 2)]);
      return s;
    };
    const withAttempt = build();
    const twin = build();
    withAttempt.tick([placeWithWall(2, 1)]);
    twin.tick([]);
    expect(withAttempt.state.structures).toHaveLength(2);
    expect(withAttempt.hash()).toBe(twin.hash());
  });

  it('projects routing like the wall it lays; the bare tower projects nothing', () => {
    const { sim } = makeSim(openLevel(5, 3, { x: 0, y: 1 }, { x: 4, y: 1 }));
    sim.tick([place('wall', 2, 0)]);
    const bare = sim.previewRoutes('tower', 2, 1);
    expect(bare.verdict).toBe('needs-wall');
    expect(bare.lanes).toBeNull();
    const compound = sim.previewRoutes('tower', 2, 1, true);
    expect(compound.verdict).toBe('ok');
    expect(compound.lanes).not.toBeNull();
    expect(compound.lanes!.length).toBeGreaterThan(0);
    expect(compound.lanes!.some((lane) => lane.some((t) => t.x === 2 && t.y === 2))).toBe(true);
    sim.tick([place('wall', 2, 2)]);
    const sealing = sim.previewRoutes('tower', 2, 1, true);
    expect(sealing.verdict).toBe('seals-spawn');
    expect(sealing.orphaned).not.toBeNull();
    const settled = sim.hash();
    sim.previewRoutes('tower', 2, 1, true);
    sim.previewPlacement('tower', 1, 1, true);
    expect(sim.hash()).toBe(settled); // previewing changed nothing
  });
});

describe('removal peels a stacked tile', () => {
  it('the tower comes off first, the wall stands, no rebuild', () => {
    const { sim } = makeSim(openLevel(7, 3, { x: 0, y: 1 }, { x: 6, y: 1 }));
    sim.tick(mount(3, 0));
    const [wall, tower] = sim.state.structures;
    const afterBuildMg = sim.state.treasuryMg;
    expect(liquidationTotalMg(sim.state.structures, 500)).toBe(4000 + 50_000);
    const inboundBefore = sim.inbound;
    const returningBefore = sim.returning;
    const costsBefore = Array.from(sim.inbound.cost);
    expect(sim.inbound.cost[sim.grid.idx(3, 0)]).toBe(-1);

    sim.tick([remove(3, 0)]);
    expect(sim.state.structures).toEqual([wall]);
    expect(sim.state.structures).not.toContain(tower);
    expect(sim.state.treasuryMg).toBe(afterBuildMg + 50_000); // provisional: full refund
    expect(sim.grid.isBlocked(3, 0)).toBe(true);
    expect(sim.inbound).toBe(inboundBefore);
    expect(sim.returning).toBe(returningBefore);
    expect(Array.from(sim.inbound.cost)).toEqual(costsBefore);
    expect(sim.inbound.cost[sim.grid.idx(3, 0)]).toBe(-1);

    // Then the wall: gone, refunded, walkable, both fields reflect it.
    sim.tick([remove(3, 0)]);
    expect(sim.state.structures).toHaveLength(0);
    expect(sim.state.treasuryMg).toBe(afterBuildMg + 50_000 + 4000);
    expect(sim.grid.isBlocked(3, 0)).toBe(false);
    expect(sim.inbound.cost[sim.grid.idx(3, 0)]).toBeGreaterThan(0);
    expect(sim.returning[0]!.cost[sim.grid.idx(3, 0)]).toBeGreaterThan(0);
  });

  it('mid-wave a provisional tower comes off a committed wall with the mask unchanged', () => {
    const { sim } = makeSim(twoWaveCorridor());
    sim.tick([place('wall', 2, 0)]);
    sim.tick([startWave()]); // commits the wall
    sim.commit([place('tower', 2, 0)]); // provisional while the wave is stopped
    const wall = sim.state.structures[0]!;
    const before = sim.state.treasuryMg;
    const inboundBefore = sim.inbound;

    sim.commit([remove(2, 0)]);
    expect(sim.state.structures).toEqual([wall]);
    expect(sim.state.treasuryMg).toBe(before + 50_000);
    expect(sim.grid.isBlocked(2, 0)).toBe(true);
    expect(sim.inbound).toBe(inboundBefore);
    expect(sim.events.some((e) => e.kind === 'placementRejected')).toBe(false);
  });

  it('mid-wave a committed tower is refused and the wall is not touched either', () => {
    const build = () => {
      const { sim } = makeSim(twoWaveCorridor());
      sim.tick(mount(2, 0));
      sim.tick([startWave()]); // commits both layers
      expect(sim.state.structures.every((s) => !s.provisional)).toBe(true);
      return sim;
    };
    const withAttempt = build();
    const without = build();
    withAttempt.tick([remove(2, 0)]);
    without.tick([]);
    expect(withAttempt.state.structures).toHaveLength(2);
    expect(withAttempt.grid.isBlocked(2, 0)).toBe(true);
    expect(withAttempt.hash()).toBe(without.hash());
    expect(withAttempt.events.some((e) => e.kind === 'placementRejected')).toBe(true);
  });
});

// The provisional window (provisional-construction design D1–D3): a structure
// is uncommitted until an advance runs under a live wave, and while
// uncommitted it refunds in full and may be sold in any live phase.
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
    sim.tick(mount(2, 0)); // wall 4000 + tower 50 000
    sim.tick([upgrade(2, 0)]); // + 85 000 into the tower's paidMg
    expect(sim.state.structures[1]!.paidMg).toBe(135_000);
    expect(sim.state.treasuryMg).toBe(before - 4000 - 135_000);

    sim.tick([remove(2, 0)]); // peels the tower
    expect(sim.state.treasuryMg).toBe(before - 4000);
    sim.tick([remove(2, 0)]); // then the wall
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
    expect(sim.returning[0]!.cost[sim.grid.idx(2, 0)]).toBeGreaterThan(0);
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

  it('a panel refunds like any structure: in full while provisional, the fraction once committed, never mid-wave once committed', () => {
    const { sim } = makeSim(twoWaveCorridor());
    const start = sim.state.treasuryMg;
    sim.tick([place('panel', 2, 0)]); // 40 000, provisional
    sim.tick([remove(2, 0)]);
    expect(sim.state.structures).toHaveLength(0);
    expect(sim.state.treasuryMg).toBe(start); // full refund
    expect(sim.grid.isBlocked(2, 0)).toBe(false);

    sim.tick([place('panel', 2, 0)]);
    sim.tick([startWave()]); // commits it
    // Committed and the wave is live: refused, hash untouched.
    const beforeAttempt = sim.hash();
    sim.commit([remove(2, 0)]);
    expect(sim.state.structures).toHaveLength(1);
    expect(sim.hash()).toBe(beforeAttempt);

    sim.state.enemies.forEach((e) => (e.hp = 0));
    sim.tick([]); // settles
    expect(sim.state.runPhase).toBe('build');
    const beforeSale = sim.state.treasuryMg;
    sim.tick([remove(2, 0)]);
    expect(sim.state.structures).toHaveLength(0);
    expect(sim.state.treasuryMg).toBe(beforeSale + 20_000); // half of 40 000
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

// Stack moves (structure-placement delta, build-over-walls design D4): a
// validated, atomic, build-phase-only move of what stands on a tile. The
// destination decides what lands — bare dirt takes the wall with its tower
// (relocate: origin freed, destination blocked, full path validation), a
// foundation takes the tower alone (transfer: no mask change at all) — free
// of charge, every structure's identity preserved.
describe('move command', () => {
  it('a confirmed stack move relocates wall and tower and reroutes in its tick', () => {
    const { sim } = makeSim(openLevel(7, 3, { x: 0, y: 1 }, { x: 6, y: 1 }));
    sim.tick(mount(3, 0));
    const [wall, tower] = sim.state.structures;
    const afterBuildMg = sim.state.treasuryMg;

    expect(sim.previewMove(3, 0, 3, 2)).toBe('ok');
    sim.tick([move(3, 0, 3, 2)]);

    expect(sim.state.structures).toEqual([wall, tower]); // same records, same order
    expect([wall!.tx, wall!.ty]).toEqual([3, 2]);
    expect([tower!.tx, tower!.ty]).toEqual([3, 2]);
    expect(sim.state.treasuryMg).toBe(afterBuildMg);
    expect(sim.grid.isBlocked(3, 0)).toBe(false);
    expect(sim.grid.isBlocked(3, 2)).toBe(true);
    // Both live fields reflect the new mask in the move's own tick.
    expect(sim.inbound.cost[sim.grid.idx(3, 0)]).toBeGreaterThan(0);
    expect(sim.inbound.cost[sim.grid.idx(3, 2)]).toBe(-1);
    expect(sim.returning[0]!.cost[sim.grid.idx(3, 0)]).toBeGreaterThan(0);
    expect(sim.returning[0]!.cost[sim.grid.idx(3, 2)]).toBe(-1);
    expect(sim.events.some((e) => e.kind === 'placementRejected')).toBe(false);
  });

  it('a tower hops onto a neighbouring bare wall: the origin wall stays, nothing rebuilds', () => {
    const { sim } = makeSim(openLevel(7, 3, { x: 0, y: 1 }, { x: 6, y: 1 }));
    sim.tick([...mount(3, 0), place('wall', 4, 0)]);
    const [wall, tower, other] = sim.state.structures;
    const afterBuildMg = sim.state.treasuryMg;
    const inboundBefore = sim.inbound;
    const returningBefore = sim.returning;
    const costsBefore = Array.from(sim.inbound.cost);

    expect(sim.previewMove(3, 0, 4, 0)).toBe('ok');
    sim.tick([move(3, 0, 4, 0)]);

    expect([tower!.tx, tower!.ty]).toEqual([4, 0]);
    expect([wall!.tx, wall!.ty]).toEqual([3, 0]); // stays put
    expect([other!.tx, other!.ty]).toEqual([4, 0]);
    expect(sim.state.treasuryMg).toBe(afterBuildMg);
    expect(sim.grid.isBlocked(3, 0)).toBe(true);
    expect(sim.grid.isBlocked(4, 0)).toBe(true);
    // No mask change: the live field objects and their costs are untouched.
    expect(sim.inbound).toBe(inboundBefore);
    expect(sim.returning).toBe(returningBefore);
    expect(Array.from(sim.inbound.cost)).toEqual(costsBefore);
    // And the vacated wall takes a tower again — a slide along the line.
    expect(sim.previewMove(4, 0, 3, 0)).toBe('ok');
  });

  it('moving is free and preserves both refund bases of a committed stack', () => {
    const { sim } = makeSim(
      openLevel(5, 3, { x: 0, y: 1 }, { x: 4, y: 1 }, [], {
        waves: [trivialWave(), trivialWave()],
      }),
    );
    sim.tick(mount(2, 0)); // 4000 + 50 000
    sim.tick([upgrade(2, 0)]); // + 85 000 into the tower's paidMg
    sim.tick([startWave()]); // commits both
    sim.state.enemies.forEach((e) => (e.hp = 0));
    sim.tick([]); // settles back to the build phase
    expect(sim.state.runPhase).toBe('build');
    const [wall, tower] = sim.state.structures;
    expect(wall!.provisional).toBe(false);
    expect(tower!.provisional).toBe(false);

    const beforeMoveMg = sim.state.treasuryMg;
    sim.tick([move(2, 0, 2, 2)]);
    expect([tower!.tx, tower!.ty]).toEqual([2, 2]);
    expect([wall!.tx, wall!.ty]).toEqual([2, 2]);
    expect(tower!.paidMg).toBe(135_000);
    expect(tower!.level).toBe(2);
    expect(tower!.provisional).toBe(false);
    expect(wall!.paidMg).toBe(4000);
    expect(wall!.provisional).toBe(false);
    expect(sim.state.treasuryMg).toBe(beforeMoveMg);

    // The later removals credit exactly what an unmoved stack would return:
    // 50% of the 135 000 tower, then 50% of the 4000 wall.
    sim.tick([remove(2, 2)]);
    expect(sim.state.treasuryMg).toBe(beforeMoveMg + 67_500);
    sim.tick([remove(2, 2)]);
    expect(sim.state.treasuryMg).toBe(beforeMoveMg + 67_500 + 2000);
  });

  it('provisional flags travel with each structure', () => {
    const { sim } = makeSim(
      openLevel(5, 3, { x: 0, y: 1 }, { x: 4, y: 1 }, [], {
        waves: [trivialWave(), trivialWave()],
      }),
    );
    sim.tick([place('wall', 2, 0)]);
    sim.tick([startWave()]); // commits the wall
    sim.state.enemies.forEach((e) => (e.hp = 0));
    sim.tick([]);
    const before = sim.state.treasuryMg;
    sim.tick([place('tower', 2, 0)]); // provisional tower on a committed wall
    const [wall, tower] = sim.state.structures;

    sim.tick([move(2, 0, 2, 2)]);
    expect([wall!.tx, wall!.ty]).toEqual([2, 2]);
    expect(wall!.provisional).toBe(false);
    expect(tower!.provisional).toBe(true);
    // Still provisional, so the tower's removal still refunds in full.
    sim.tick([remove(2, 2)]);
    expect(sim.state.treasuryMg).toBe(before);
  });

  it('a panel moves like a wall: mask, both fields, free, kind and refund basis kept', () => {
    const { sim } = makeSim(openLevel(7, 3, { x: 0, y: 1 }, { x: 6, y: 1 }));
    sim.tick([place('panel', 3, 0)]);
    const panel = sim.state.structures[0]!;
    const before = sim.state.treasuryMg;
    sim.tick([move(3, 0, 3, 2)]);
    expect(sim.state.structures[0]).toBe(panel);
    expect(panel).toMatchObject({ kind: 'panel', tx: 3, ty: 2, paidMg: 40_000, provisional: true });
    expect(sim.state.treasuryMg).toBe(before);
    expect(sim.grid.isBlocked(3, 0)).toBe(false);
    expect(sim.grid.isBlocked(3, 2)).toBe(true);
    expect(sim.inbound.cost[sim.grid.idx(3, 0)]).toBeGreaterThan(0);
    expect(sim.inbound.cost[sim.grid.idx(3, 2)]).toBe(-1);
    // And, like a wall, it cannot move onto a socket.
    const socketed = makeSim(paletteLevel()).sim;
    socketed.tick([place('panel', 2, 0)]);
    expect(socketed.previewMove(2, 0, 3, 0)).toBe('not-buildable');
  });

  it('nothing lands on a panel: a stack, a bare wall and a socket tower are all occupied there', () => {
    const { sim } = makeSim(paletteLevel());
    const twin = makeSim(paletteLevel()).sim;
    const setup = () => [place('panel', 2, 2), ...mount(4, 2), place('wall', 2, 0), place('tower', 3, 0)];
    sim.tick(setup());
    twin.tick(setup());
    expect(sim.state.structures).toHaveLength(5);
    expect(sim.previewMove(4, 2, 2, 2)).toBe('occupied'); // wall + tower
    expect(sim.previewMove(2, 0, 2, 2)).toBe('occupied'); // bare wall
    expect(sim.previewMove(3, 0, 2, 2)).toBe('occupied'); // socket tower
    sim.tick([move(4, 2, 2, 2), move(2, 0, 2, 2), move(3, 0, 2, 2)]);
    twin.tick([]);
    expect(sim.hash()).toBe(twin.hash());
    expect(sim.state.structures.filter((s) => s.tx === 2 && s.ty === 2)).toHaveLength(1);
  });

  it('a bare wall moves like before: mask, both fields, free, refund basis kept', () => {
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
    expect(sim.returning[0]!.cost[sim.grid.idx(3, 0)]).toBeGreaterThan(0);
    expect(sim.returning[0]!.cost[sim.grid.idx(3, 2)]).toBe(-1);
    expect(sim.events.some((e) => e.kind === 'placementRejected')).toBe(false);

    // Still provisional, so removal still refunds in full — the move changed
    // nothing about what the wall is worth.
    sim.tick([remove(3, 2)]);
    expect(sim.state.treasuryMg).toBe(before);
  });

  it('a bare wall cannot land on a socket or on another wall, as a wall placement could not', () => {
    const { sim } = makeSim(
      openLevel(7, 3, { x: 0, y: 1 }, { x: 6, y: 1 }, [], {
        map: ['.o.....', '.......', '.......'],
      }),
    );
    sim.tick([place('wall', 3, 0), place('wall', 4, 0)]);
    expect(sim.previewPlacement('wall', 1, 0)).toBe('not-buildable');
    expect(sim.previewMove(3, 0, 1, 0)).toBe('not-buildable'); // socket: no tower to transfer
    expect(sim.previewMove(3, 0, 4, 0)).toBe('occupied'); // bare wall: nothing to land
    sim.tick([move(3, 0, 1, 0), move(3, 0, 4, 0)]);
    const s = sim.state.structures[0]!;
    expect([s.tx, s.ty]).toEqual([3, 0]);
    expect(sim.grid.isBlocked(3, 0)).toBe(true);
    expect(sim.events.filter((e) => e.kind === 'placementRejected')).toHaveLength(2);
    // The same socket takes a stack's tower.
    sim.tick(mount(5, 0));
    expect(sim.previewMove(5, 0, 1, 0)).toBe('ok');
  });

  it('rejects every move while a wave runs, provisional structures included', () => {
    const { sim } = makeSim(
      openLevel(7, 3, { x: 0, y: 1 }, { x: 6, y: 1 }, [], {
        waves: [trivialWave(), trivialWave()],
      }),
    );
    sim.tick(mount(3, 0));
    sim.tick([startWave()]); // commits the stack
    expect(sim.state.runPhase).toBe('wave');
    sim.tick([move(3, 0, 3, 2)]);
    expect([sim.state.structures[1]!.tx, sim.state.structures[1]!.ty]).toEqual([3, 0]);
    expect(sim.events.some((e) => e.kind === 'placementRejected')).toBe(true);

    // A stack placed during the stopped wave is provisional — and still
    // immovable: the gate reads the phase, not the flag.
    sim.commit(mount(3, 2));
    const fresh = sim.state.structures[3]!;
    expect(fresh.provisional).toBe(true);
    sim.commit([move(3, 2, 4, 2)]);
    expect([fresh.tx, fresh.ty]).toEqual([3, 2]);
  });

  it('rejects moves in the settled-locked state', () => {
    const { sim } = makeSim(
      openLevel(9, 3, { x: 0, y: 1 }, { x: 8, y: 1 }),
      testBalance({ bounty: 0 }),
    );
    // Drain the treasury to exactly 0, start the only wave, then overdraw
    // mid-wave: the settlement lands in debt after the final wave.
    sim.tick([...mount(1, 0, 'rapid'), ...mount(3, 0, 'sniper'), ...mount(5, 0, 'slow')]);
    sim.tick([place('wall', 7, 0), place('wall', 7, 2)]);
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
    // Wall line down x=3 with the stack at (3,2) and the only gap at (3,4):
    // relocating the stack into the gap is legal ONLY because its own tile
    // opens in the same evaluation.
    const { sim } = makeSim(openLevel(7, 5, { x: 0, y: 2 }, { x: 6, y: 2 }));
    sim.tick([place('wall', 3, 0), place('wall', 3, 1), place('wall', 3, 3)]);
    sim.tick(mount(3, 2));
    expect(sim.state.structures).toHaveLength(5);
    const [, , , wall, tower] = sim.state.structures;

    // A plain wall placement at the gap would seal — the origin is still standing.
    expect(sim.previewPlacement('wall', 3, 4)).toBe('seals-spawn');
    // The move sees the origin freed and accepts.
    expect(sim.previewMove(3, 2, 3, 4)).toBe('ok');
    sim.tick([move(3, 2, 3, 4)]);
    expect([wall!.tx, wall!.ty]).toEqual([3, 4]);
    expect([tower!.tx, tower!.ty]).toEqual([3, 4]);
    // The reroute now runs through the vacated origin, in the same tick.
    expect(sim.grid.isBlocked(3, 2)).toBe(false);
    expect(sim.inbound.cost[sim.grid.idx(3, 2)]).toBeGreaterThan(0);
    expect(sim.inbound.cost[sim.grid.idx(3, 4)]).toBe(-1);
  });

  it('a tower hop onto a wall in a sealing position is confirmed: no path checks', () => {
    // Walls at x=3 leave (3,2) as the only pass; the wall at (3,1) would seal
    // if it were a fresh placement at the gap. The stack at (1,1) hops its
    // tower onto (3,1): only the tower transfers, no tile changes
    // walkability, no rebuild.
    const { sim } = makeSim(openLevel(7, 5, { x: 0, y: 2 }, { x: 6, y: 2 }));
    sim.tick([place('wall', 3, 0), place('wall', 3, 1), place('wall', 3, 3), place('wall', 3, 4)]);
    sim.tick(mount(1, 1));
    expect(sim.previewPlacement('wall', 3, 2)).toBe('seals-spawn'); // routing is that tight
    const inboundBefore = sim.inbound;
    const costsBefore = Array.from(sim.inbound.cost);
    expect(sim.previewMove(1, 1, 3, 1)).toBe('ok');
    sim.tick([move(1, 1, 3, 1)]);
    const tower = sim.state.structures.find((s) => s.kind === 'tower')!;
    expect([tower.tx, tower.ty]).toEqual([3, 1]);
    expect(sim.grid.isBlocked(1, 1)).toBe(true); // the origin wall stays
    expect(sim.grid.isBlocked(3, 2)).toBe(false);
    expect(sim.inbound).toBe(inboundBefore);
    expect(Array.from(sim.inbound.cost)).toEqual(costsBefore);
  });

  it('rejects sealing, stranding, enemy-held, mounted and same-tile destinations', () => {
    // Sealing: walls leave (3,2) as the only pass; the stack at (1,1) cannot
    // plug it — its freed origin does not reconnect the spawn.
    const seal = makeSim(openLevel(7, 5, { x: 0, y: 2 }, { x: 6, y: 2 })).sim;
    seal.tick([place('wall', 3, 0), place('wall', 3, 1), place('wall', 3, 3), place('wall', 3, 4)]);
    seal.tick(mount(1, 1));
    expect(seal.previewMove(1, 1, 3, 2)).toBe('seals-spawn');
    seal.tick([move(1, 1, 3, 2)]);
    expect([seal.state.structures[4]!.tx, seal.state.structures[4]!.ty]).toEqual([1, 1]);
    expect([seal.state.structures[5]!.tx, seal.state.structures[5]!.ty]).toEqual([1, 1]);
    expect(seal.grid.isBlocked(3, 2)).toBe(false);
    expect(seal.events.some((e) => e.kind === 'placementRejected')).toBe(true);

    // Stranding: the parked enemy at (3,0) is pocketed once (4,0) closes.
    const strand = makeSim(openLevel(7, 5, { x: 0, y: 0 }, { x: 6, y: 0 })).sim;
    injectEnemy(strand, 3, 0);
    strand.tick([place('wall', 2, 0), place('wall', 3, 1)]);
    strand.tick(mount(5, 2));
    expect(strand.previewMove(5, 2, 4, 0)).toBe('strands-enemy');
    strand.tick([move(5, 2, 4, 0)]);
    expect([strand.state.structures[2]!.tx, strand.state.structures[2]!.ty]).toEqual([5, 2]);

    // Enemy-held, a foundation already carrying a tower, and the stack's own tile.
    const rest = makeSim(openLevel(7, 5, { x: 0, y: 0 }, { x: 6, y: 0 })).sim;
    injectEnemy(rest, 3, 2);
    rest.tick([...mount(1, 3), ...mount(1, 4)]);
    expect(rest.previewMove(1, 3, 3, 2)).toBe('enemy-in-footprint');
    expect(rest.previewMove(1, 3, 1, 4)).toBe('occupied');
    expect(rest.previewMove(1, 3, 1, 3)).toBe('occupied');
    rest.tick([move(1, 3, 3, 2), move(1, 3, 1, 4), move(1, 3, 1, 3)]);
    expect([rest.state.structures[0]!.tx, rest.state.structures[0]!.ty]).toEqual([1, 3]);
    expect([rest.state.structures[1]!.tx, rest.state.structures[1]!.ty]).toEqual([1, 3]);
    expect(rest.events.filter((e) => e.kind === 'placementRejected')).toHaveLength(3);
  });

  it('moves through the socket matrix: stack→socket, socket→socket, socket→wall, socket→dirt', () => {
    const { sim } = makeSim(
      openLevel(7, 3, { x: 0, y: 1 }, { x: 6, y: 1 }, [], {
        map: ['.o.o...', '.......', '.......'],
      }),
    );
    sim.tick([...mount(4, 0), place('wall', 5, 0)]);
    const [wall, tower] = sim.state.structures;
    expect(sim.inbound.cost[sim.grid.idx(4, 0)]).toBe(-1);

    // stack→socket: a transfer — the tower lands, the wall stays, nothing
    // about the mask or the fields changes.
    const inboundBefore = sim.inbound;
    const costsBefore = Array.from(sim.inbound.cost);
    sim.tick([move(4, 0, 1, 0)]);
    expect([tower!.tx, tower!.ty]).toEqual([1, 0]);
    expect([wall!.tx, wall!.ty]).toEqual([4, 0]);
    expect(sim.grid.isBlocked(4, 0)).toBe(true); // the wall still owns it
    expect(sim.grid.isBlocked(1, 0)).toBe(true); // terrain-blocked as ever
    expect(sim.inbound).toBe(inboundBefore);
    expect(Array.from(sim.inbound.cost)).toEqual(costsBefore);

    // socket→socket: the same transfer.
    sim.tick([move(1, 0, 3, 0)]);
    expect([tower!.tx, tower!.ty]).toEqual([3, 0]);
    expect(sim.inbound).toBe(inboundBefore);
    expect(Array.from(sim.inbound.cost)).toEqual(costsBefore);

    // socket→bare dirt: a socket stack has no wall to relocate.
    expect(sim.previewMove(3, 0, 2, 0)).toBe('needs-wall');
    sim.tick([move(3, 0, 2, 0)]);
    expect([tower!.tx, tower!.ty]).toEqual([3, 0]);
    expect(sim.grid.isBlocked(2, 0)).toBe(false);
    expect(sim.events.some((e) => e.kind === 'placementRejected')).toBe(true);

    // socket→bare wall: a transfer onto the wall at (5,0).
    expect(sim.previewMove(3, 0, 5, 0)).toBe('ok');
    sim.tick([move(3, 0, 5, 0)]);
    expect([tower!.tx, tower!.ty]).toEqual([5, 0]);
    expect(sim.inbound).toBe(inboundBefore);
    // …and the socket is empty and still terrain-blocked.
    expect(sim.previewPlacement('tower', 3, 0)).toBe('ok');
    expect(sim.grid.isBlocked(3, 0)).toBe(true);
  });

  it('move rejection is atomic: post-tick hash equals the run without the attempt', () => {
    const build = () => {
      const { sim } = makeSim(openLevel(7, 5, { x: 0, y: 2 }, { x: 6, y: 2 }));
      sim.tick([place('wall', 3, 0), place('wall', 3, 1), place('wall', 3, 3), place('wall', 3, 4)]);
      sim.tick(mount(1, 1));
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
      sim.tick([place('wall', 4, 3), place('wall', 4, 4), ...mount(4, 1)]);
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
        swept.previewMove(4, 3, tx, ty); // a bare wall's stack too
        swept.previewMoveRoutes(4, 3, tx, ty);
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
    sim.tick(mount(4, 1));
    const held = sim.previewMoveRoutes(4, 1, 4, 2);
    expect(held.verdict).toBe('ok');
    expect(held.lanes).not.toBeNull();
    const snapshot = JSON.stringify(held);

    // A second evaluation overwrites `scratch`…
    sim.previewMoveRoutes(4, 1, 6, 3);
    expect(JSON.stringify(held)).toBe(snapshot);

    // …and a confirmed move swaps `scratch` into live state.
    sim.tick([move(4, 1, 6, 3)]);
    expect([sim.state.structures[1]!.tx, sim.state.structures[1]!.ty]).toEqual([6, 3]);
    expect(JSON.stringify(held)).toBe(snapshot);
  });

  it('projected lanes route through the freed origin tile', () => {
    // The slide fixture: the gap at (3,4) is the current route; the candidate
    // blocks it and the projection must run through the vacated (3,2).
    const { sim } = makeSim(openLevel(7, 5, { x: 0, y: 2 }, { x: 6, y: 2 }));
    sim.tick([place('wall', 3, 0), place('wall', 3, 1), place('wall', 3, 3)]);
    sim.tick(mount(3, 2));
    expect(sim.currentLanes()[0]!.some((t) => t.x === 3 && t.y === 4)).toBe(true);

    const preview = sim.previewMoveRoutes(3, 2, 3, 4);
    expect(preview.verdict).toBe('ok');
    expect(preview.orphaned).toBeNull();
    expect(preview.lanes![0]!.some((t) => t.x === 3 && t.y === 2)).toBe(true); // the freed origin
    expect(preview.lanes![0]!.some((t) => t.x === 3 && t.y === 4)).toBe(false); // the blocked candidate
    // …while the live lanes are unchanged: nothing was committed.
    expect(sim.currentLanes()[0]!.some((t) => t.x === 3 && t.y === 4)).toBe(true);
  });

  it('yields null lanes for every routing-independent verdict, transfers included', () => {
    const level = () =>
      openLevel(7, 3, { x: 0, y: 1 }, { x: 6, y: 1 }, [], {
        map: ['.rgo.o.', '.......', '.......'],
      });
    const { sim } = makeSim(level());
    sim.tick([...mount(4, 2), place('wall', 2, 2), place('tower', 3, 0), ...mount(6, 2)]);
    injectEnemy(sim, 5, 1);

    // Nothing movable at the origin (a bare tile).
    expect(sim.previewMoveRoutes(1, 2, 4, 1)).toEqual({ verdict: 'not-buildable', lanes: null, orphaned: null });
    // A bare wall bound for a free socket: nothing to transfer, no routing.
    expect(sim.previewMoveRoutes(2, 2, 5, 0)).toEqual({ verdict: 'not-buildable', lanes: null, orphaned: null });
    // Out of bounds, terrain, own tile, enemy-held.
    expect(sim.previewMoveRoutes(4, 2, -1, 1)).toEqual({ verdict: 'out-of-bounds', lanes: null, orphaned: null });
    expect(sim.previewMoveRoutes(4, 2, 1, 0).verdict).toBe('not-buildable'); // rock
    expect(sim.previewMoveRoutes(4, 2, 1, 0).lanes).toBeNull();
    expect(sim.previewMoveRoutes(4, 2, 2, 0).verdict).toBe('not-buildable'); // grass
    expect(sim.previewMoveRoutes(4, 2, 4, 2).verdict).toBe('occupied'); // own tile
    expect(sim.previewMoveRoutes(4, 2, 4, 2).lanes).toBeNull();
    expect(sim.previewMoveRoutes(4, 2, 5, 1).verdict).toBe('enemy-in-footprint');
    expect(sim.previewMoveRoutes(4, 2, 5, 1).lanes).toBeNull();
    // A foundation already carrying a tower: occupied, no routing.
    expect(sim.previewMoveRoutes(4, 2, 6, 2)).toEqual({ verdict: 'occupied', lanes: null, orphaned: null });
    expect(sim.previewMoveRoutes(4, 2, 3, 0)).toEqual({ verdict: 'occupied', lanes: null, orphaned: null });
    // A socket tower bound for bare dirt: needs-wall, no routing.
    expect(sim.previewMoveRoutes(3, 0, 4, 1)).toEqual({ verdict: 'needs-wall', lanes: null, orphaned: null });
    // Transfers rebuild nothing — and cannot leak the previous evaluation's
    // fields as their own: onto a bare wall, onto a socket, socket to socket.
    sim.previewMoveRoutes(4, 2, 4, 1); // primes `scratch` with another tile's fields
    expect(sim.previewMoveRoutes(4, 2, 2, 2)).toEqual({ verdict: 'ok', lanes: null, orphaned: null });
    sim.previewMoveRoutes(4, 2, 4, 1);
    expect(sim.previewMoveRoutes(4, 2, 5, 0)).toEqual({ verdict: 'ok', lanes: null, orphaned: null });
    sim.previewMoveRoutes(4, 2, 4, 1);
    expect(sim.previewMoveRoutes(3, 0, 5, 0)).toEqual({ verdict: 'ok', lanes: null, orphaned: null });
    sim.previewMoveRoutes(4, 2, 4, 1);
    expect(sim.previewMoveRoutes(3, 0, 2, 2)).toEqual({ verdict: 'ok', lanes: null, orphaned: null });
  });

  it('populates the orphan set for a sealing move, freed origin included', () => {
    const { sim } = makeSim(openLevel(7, 5, { x: 0, y: 2 }, { x: 6, y: 2 }));
    sim.tick([place('wall', 3, 0), place('wall', 3, 1), place('wall', 3, 3), place('wall', 3, 4)]);
    sim.tick(mount(1, 1));

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

    // The same for a tower on a bare wall (build-over-walls): accepted, no
    // routing — and bare dirt under a tower tool is needs-wall, no routing.
    const mounted = makeSim(level()).sim;
    mounted.tick([place('wall', 2, 2)]);
    mounted.previewRoutes('wall', 4, 2); // primes `scratch`
    expect(mounted.previewRoutes('tower', 2, 2)).toEqual({
      verdict: 'ok',
      lanes: null,
      orphaned: null,
    });
    mounted.previewRoutes('wall', 4, 2);
    expect(mounted.previewRoutes('tower', 4, 2)).toEqual({
      verdict: 'needs-wall',
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
      power: INERT_POWER,
      waves: [wave('north'), wave('south')],
    });

    const preview = sim.previewRoutes('wall', 1, 0);
    expect(preview.verdict).toBe('seals-spawn');
    expect(preview.orphaned).toEqual([{ x: 0, y: 0 }]);
    // Four lanes: north-in, south-in, north-return, south-return. North
    // blanks in both directions; south still routes both ways.
    expect(preview.lanes).toHaveLength(4);
    expect(preview.lanes![0]).toEqual([]);
    expect(preview.lanes![1]!.at(-1)).toEqual({ x: 6, y: 1 });
    expect(preview.lanes![2]).toEqual([]);
    expect(preview.lanes![3]![0]).toEqual({ x: 6, y: 1 });
    expect(preview.lanes![3]!.at(-1)).toEqual({ x: 0, y: 2 });
  });
});
