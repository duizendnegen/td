// Anti-drift coverage for the PR-preview capture scenario (design D6 of the
// add-pr-wave-preview change): the demo clip may never silently fall behind
// the game's roster. The scenario lives CI-side (.github/capture/) by design
// — the application knows nothing about it — so this test deliberately
// reaches across that boundary.
//
// If this test fails after editing balance.json, extend
// .github/capture/scenario.json so the new archetype/enemy appears in the
// clip — do not exempt it here.
import { describe, expect, it } from 'vitest';
import scenario from '../.github/capture/scenario.json';
import balanceJson from '../src/data/balance.json';
import levelJson from '../src/data/levels/level_01.json';

interface ScenarioCommand {
  tick: number;
  body: { kind: string; archetype?: string; structure?: string; type?: string };
}

const commands = scenario.commands as ScenarioCommand[];

describe('capture scenario coverage', () => {
  it('places every tower archetype declared in balance.json', () => {
    const declared = Object.keys(balanceJson.towers).sort();
    const placed = [
      ...new Set(
        commands
          .filter((c) => c.body.kind === 'place' && c.body.structure === 'tower')
          .map((c) => c.body.archetype),
      ),
    ].sort();
    expect(placed).toEqual(declared);
  });

  it('spawns every enemy type declared in balance.json', () => {
    const declared = Object.keys(balanceJson.enemies).sort();
    // Enemy types reach the board two ways: the level waves the scenario
    // actually starts, and explicitly injected spawn commands.
    const wavesStarted = commands.filter((c) => c.body.kind === 'startWave').length;
    const fromWaves = levelJson.waves
      .slice(0, wavesStarted)
      .flatMap((w) => w.groups.map((g) => g.type));
    const injected = commands.filter((c) => c.body.kind === 'spawn').map((c) => c.body.type ?? '');
    const spawned = [...new Set([...fromWaves, ...injected])].sort();
    expect(spawned).toEqual(declared);
  });

  it('runs on the level and seed the driver will use', () => {
    // The driver opens ?capture=1&seed=<seed> on the default level; a
    // scenario authored against another level would desync silently.
    expect(scenario.level).toBe(levelJson.id);
    expect(Number.isInteger(scenario.seed)).toBe(true);
  });
});
