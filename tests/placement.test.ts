// See ARCHITECTURE.md §12 and the phase-2 structure-placement spec
import { describe, expect, it } from 'vitest';
import { REMOVAL_TICKS, tileCentre, toTile } from '../src/sim/fixed';
import { injectEnemy, makeSim, openLevel, place, remove, testBalance } from './helpers';

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
    // Walk the first spawned enemy until it has committed to (3,1) from (2,1).
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
    // Wait for the first enemy to be mid-way through its (0,0) → (1,1) diagonal.
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
