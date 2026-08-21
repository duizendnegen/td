// See the energy-infrastructure build-ui delta ("Rated power is shown now and
// next"): the inspector's stat rows and upgrade label as pure derivations —
// the DOM component itself is verified by playing, per ARCHITECTURE.md §12.
import { describe, expect, it } from 'vitest';
import { towerStats } from '../src/sim/tower';
import { statRows, upgradeLabel } from '../src/ui/inspector';
import { makeSim, mount, openLevel, testBalance, upgrade } from './helpers';

// 9×5 board, lane on row 2; every tower stands on a wall (build-over-walls).
const board = () => openLevel(9, 5, { x: 0, y: 2 }, { x: 8, y: 2 });

describe('inspector rated-power rows', () => {
  it('shows the current rated power among the stats, for every archetype', () => {
    const { sim, data } = makeSim(board(), testBalance());
    sim.state.treasuryMg = 1_000_000;
    sim.tick([
      ...mount(1, 0, 'rapid'),
      ...mount(3, 0, 'sniper'),
      ...mount(5, 0, 'area'),
      ...mount(7, 0, 'slow'),
    ]);
    const towers = sim.state.structures.filter((s) => s.kind === 'tower');
    const power = towers.map((s) => statRows(data, s, towerStats(s, data)).find(([l]) => l === 'Power')![1]);
    expect(power).toEqual(['1.0 kW', '1.5 kW', '1.2 kW', '0.8 kW']);
    // The other rows are unchanged: range still first, rate still present.
    const rapid = statRows(data, towers[0]!, towerStats(towers[0]!, data));
    expect(rapid[0]![0]).toBe('Range');
    expect(rapid.map(([l]) => l)).toContain('Rate');
  });

  it('the upgrade action names the next level, its cost, and its rated power', () => {
    const { sim, data } = makeSim(board(), testBalance());
    sim.tick(mount(3, 0));
    const t = sim.state.structures[1]!; // the tower on its wall
    expect(upgradeLabel(data, t)).toBe('Upgrade → L2 · 85g · 1.3 kW');
    sim.tick([upgrade(3, 0)]);
    expect(upgradeLabel(data, t)).toBe('Upgrade → L3 · 145g · 1.6 kW');
    // …and the current row follows the level.
    expect(statRows(data, t, towerStats(t, data)).find(([l]) => l === 'Power')![1]).toBe('1.3 kW');
  });
});
