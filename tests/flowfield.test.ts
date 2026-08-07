// See ARCHITECTURE.md §12
import { describe, expect, it } from 'vitest';
import { DIAG, TILE } from '../src/sim/fixed';
import { DIR_DX, DIR_DY, UNREACHABLE, buildField, nextTile, tracePath } from '../src/sim/flowfield';
import { Grid } from '../src/sim/grid';

/** Build a grid from an ASCII map: '#' blocked, anything else walkable. */
function gridFrom(rows: string[]): Grid {
  const grid = new Grid(rows[0]!.length, rows.length);
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch === '#') grid.setBlocked(x, y, true);
    });
  });
  return grid;
}

describe('flow fields', () => {
  it('every walkable tile reaches the treasury on open terrain', () => {
    const grid = new Grid(30, 20);
    const field = buildField(grid, [{ x: 27, y: 10 }]);
    for (let y = 0; y < 20; y++) {
      for (let x = 0; x < 30; x++) {
        expect(field.cost[grid.idx(x, y)]).toBeGreaterThanOrEqual(0);
      }
    }
    // Following directions tile-by-tile from anywhere arrives at the source.
    let tile: { x: number; y: number } | null = { x: 0, y: 0 };
    for (let steps = 0; steps < 600 && tile; steps++) {
      const next: { x: number; y: number } | null = nextTile(field, grid, tile.x, tile.y);
      if (!next) break;
      tile = next;
    }
    expect(tile).toEqual({ x: 27, y: 10 });
    expect(field.cost[grid.idx(27, 10)]).toBe(0);
  });

  it('never points diagonally between two blocked tiles', () => {
    const grid = gridFrom([
      '........',
      '...#....',
      '....#...',
      '........',
    ]);
    const field = buildField(grid, [{ x: 7, y: 0 }]);
    // General invariant: any expressed diagonal step has both orthogonal
    // in-between tiles walkable.
    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        const d = field.dir[grid.idx(x, y)]!;
        if (d === UNREACHABLE || (d & 1) === 0) continue;
        const nx = x + DIR_DX[d]!;
        const ny = y + DIR_DY[d]!;
        expect(grid.isWalkable(nx, y)).toBe(true);
        expect(grid.isWalkable(x, ny)).toBe(true);
      }
    }
    // The specific corner: (4,1) → (3,2) would cut between (3,1) and (4,2).
    // Both tiles are walkable and reachable, just never via that diagonal.
    const dirAt = (x: number, y: number) => field.dir[grid.idx(x, y)]!;
    const stepOf = (x: number, y: number) => ({
      x: x + DIR_DX[dirAt(x, y)]!,
      y: y + DIR_DY[dirAt(x, y)]!,
    });
    expect(stepOf(4, 1)).not.toEqual({ x: 3, y: 2 });
    expect(stepOf(3, 2)).not.toEqual({ x: 4, y: 1 });
  });

  it('costs decrease monotonically toward the source by exactly the step cost', () => {
    const grid = gridFrom([
      '..........',
      '.####.....',
      '....#..#..',
      '.#..#..#..',
      '.#.....#..',
      '..........',
    ]);
    const field = buildField(grid, [{ x: 9, y: 5 }]);
    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        const d = field.dir[grid.idx(x, y)]!;
        if (d === UNREACHABLE) continue;
        const step = (d & 1) === 1 ? DIAG : TILE;
        const next = nextTile(field, grid, x, y)!;
        expect(field.cost[grid.idx(x, y)]).toBe(field.cost[grid.idx(next.x, next.y)]! + step);
      }
    }
  });

  it('marks an enclosed walkable tile unreachable', () => {
    const grid = gridFrom([
      '.....',
      '.###.',
      '.#.#.',
      '.###.',
    ]);
    const field = buildField(grid, [{ x: 0, y: 0 }]);
    expect(field.cost[grid.idx(2, 2)]).toBe(UNREACHABLE);
    expect(field.dir[grid.idx(2, 2)]).toBe(UNREACHABLE);
    // The wall tiles themselves are also not given costs.
    expect(field.cost[grid.idx(1, 1)]).toBe(UNREACHABLE);
  });

  it('returning field costs equal the cheapest path to any active spawn', () => {
    const grid = new Grid(12, 8);
    const spawnA = { x: 0, y: 0 };
    const spawnB = { x: 11, y: 7 };
    const multi = buildField(grid, [spawnA, spawnB]);
    const onlyA = buildField(grid, [spawnA]);
    const onlyB = buildField(grid, [spawnB]);
    for (let i = 0; i < 12 * 8; i++) {
      expect(multi.cost[i]).toBe(Math.min(onlyA.cost[i]!, onlyB.cost[i]!));
    }
  });

  it('same blocked mask produces an identical field', () => {
    const rows = ['..#....', '...#...', '.#.....', '....#..'];
    const a = buildField(gridFrom(rows), [{ x: 6, y: 3 }]);
    const b = buildField(gridFrom(rows), [{ x: 6, y: 3 }]);
    expect([...a.dir]).toEqual([...b.dir]);
    expect([...a.cost]).toEqual([...b.cost]);
  });
});

describe('tracePath (path-preview spec)', () => {
  // A corridor forced around two rock stubs, so the trace has to turn.
  const rows = ['..........', '.####.....', '....#..#..', '.#..#..#..', '.#.....#..', '..........'];

  it('traces from a spawn to the treasury following the field directions', () => {
    const grid = gridFrom(rows);
    const treasury = { x: 9, y: 5 };
    const field = buildField(grid, [treasury]);
    const path = tracePath(field, grid, { x: 0, y: 0 });

    expect(path[0]).toEqual({ x: 0, y: 0 });
    expect(path[path.length - 1]).toEqual(treasury);
    // Every consecutive pair is exactly that tile's field step.
    for (let i = 0; i < path.length - 1; i++) {
      const here = path[i]!;
      expect(nextTile(field, grid, here.x, here.y)).toEqual(path[i + 1]);
    }
    // A route, not a wander: no tile is visited twice.
    expect(new Set(path.map((t) => `${t.x},${t.y}`)).size).toBe(path.length);
  });

  it('yields no onward route from a walkable but unreachable tile', () => {
    const grid = gridFrom(['.....', '.###.', '.#.#.', '.###.']);
    const field = buildField(grid, [{ x: 0, y: 0 }]);
    expect(field.cost[grid.idx(2, 2)]).toBe(UNREACHABLE);
    expect(tracePath(field, grid, { x: 2, y: 2 })).toEqual([{ x: 2, y: 2 }]);
  });

  it('traces a source tile to itself alone', () => {
    const grid = gridFrom(rows);
    const field = buildField(grid, [{ x: 9, y: 5 }]);
    expect(field.cost[grid.idx(9, 5)]).toBe(0);
    expect(tracePath(field, grid, { x: 9, y: 5 })).toEqual([{ x: 9, y: 5 }]);
  });

  it('terminates from every tile of a board, blocked tiles included', () => {
    const grid = gridFrom(rows);
    const field = buildField(grid, [{ x: 9, y: 5 }]);
    const cap = grid.width * grid.height;
    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        const path = tracePath(field, grid, { x, y });
        expect(path.length).toBeGreaterThanOrEqual(1);
        // Under the cap means the walk stopped at a source, not at the guard.
        expect(path.length).toBeLessThan(cap + 1);
      }
    }
  });
});
