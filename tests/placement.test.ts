// See ARCHITECTURE.md §12 and the phase-2/phase-4 structure-placement specs
import { describe, expect, it } from 'vitest';
import balanceJson from '../src/data/balance.json';
import level01Json from '../src/data/levels/level_01.json';
import { loadGameData } from '../src/data/schema';
import { REMOVAL_TICKS, tileCentre, toTile } from '../src/sim/fixed';
import { Sim } from '../src/sim/sim';
import { injectEnemy, makeSim, openLevel, place, remove, spawnCmd, testBalance } from './helpers';

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

  it('removal keeps the tile blocked for all 80 ticks and refunds at expiry', () => {
    const { sim } = makeSim(openLevel(5, 3, { x: 0, y: 1 }, { x: 4, y: 1 }));
    sim.tick([place('wall', 2, 0)]);
    const afterBuildMg = sim.state.treasuryMg;
    expect(afterBuildMg).toBe(196_000);

    sim.tick([remove(2, 0)]);
    const removalIssuedTick = sim.state.tick - 1; // the tick the command applied on
    expect(sim.state.structures[0]!.removalCompleteTick).toBe(removalIssuedTick + REMOVAL_TICKS);

    // Blocked, unrefunded, and pathed-around for the whole countdown.
    while (sim.state.tick < removalIssuedTick + REMOVAL_TICKS) {
      expect(sim.grid.isBlocked(2, 0)).toBe(true);
      expect(sim.state.treasuryMg).toBe(afterBuildMg);
      sim.tick([]);
    }
    // The expiry tick: unblocked, structure gone, half the paid cost credited.
    sim.tick([]);
    expect(sim.grid.isBlocked(2, 0)).toBe(false);
    expect(sim.state.structures).toHaveLength(0);
    expect(sim.state.treasuryMg).toBe(afterBuildMg + 2000);
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
    const removalIssuedTick = sim.state.tick - 1;
    while (sim.state.tick <= removalIssuedTick + REMOVAL_TICKS) {
      expect(sim.grid.isBlocked(3, 0)).toBe(true);
      sim.tick([]);
    }
    // Removed and refunded — and the tile is still terrain-blocked.
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
