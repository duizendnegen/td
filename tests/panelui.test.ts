// See the energy-infrastructure build-ui delta ("The panel is placeable and
// removable like a wall") and the add-battery delta ("The battery is
// placeable and removable like a panel"): the panel and the battery through
// the shared input core — the same command path as a wall, wall-style ghost
// tinting, the remove tool covering them, and no inspector for either — over
// the stubbed rig pattern from movetool.test.ts. The palette's hotkey table
// is asserted here too, since the cards and the hint line both read it.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { FxRenderer, GhostPreview } from '../src/render/fx';
import type { LaneRibbon } from '../src/render/ribbon';
import { CommandQueue } from '../src/sim/commands';
import { InputCore } from '../src/ui/inputcore';
import type { InspectorUI } from '../src/ui/inspector';
import { TOOL_KEYS, toolStructure, type PaletteUI, type Tool } from '../src/ui/palette';
import type { Structure } from '../src/sim/types';
import { makeSim, openLevel, place } from './helpers';

class StubPalette {
  selected: Tool | null = null;
  onChange: ((tool: Tool | null) => void) | null = null;
  private readonly costs: Partial<Record<Tool, number>>;
  constructor(costs: Partial<Record<Tool, number>>) {
    this.costs = costs;
  }
  costOf(tool: Tool): number {
    return this.costs[tool] ?? 0;
  }
  select(tool: Tool | null): void {
    this.selected = tool;
    this.onChange?.(tool);
  }
}

function rig() {
  // 7×3 corridor with a socket at (3,0): panels are dirt-only.
  const { sim } = makeSim(
    openLevel(7, 3, { x: 0, y: 1 }, { x: 6, y: 1 }, [], { map: ['...o...', '.......', '.......'] }),
  );
  const commands = new CommandQueue();
  const canvas = {
    addEventListener: () => {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 700, height: 300 }),
  } as unknown as HTMLCanvasElement;
  const palette = new StubPalette({ panel: 40_000, battery: 30_000, wall: 4000 });
  const shown: { kind: string; tint: string; rangeUnits: number }[] = [];
  const ghost = {
    show: (kind: string, _tx: number, _ty: number, tint: string, rangeUnits: number) =>
      shown.push({ kind, tint, rangeUnits }),
    hide: () => {},
    showRingAt: () => {},
    showPreviewRingAt: () => {},
  };
  const ribbon = { update: () => {}, hide: () => {} };
  const selected: (Structure | null)[] = [];
  const inspector = {
    select: (s: Structure | null) => selected.push(s),
    current: null,
    previewStats: null,
    onMove: null,
  };
  let flashes = 0;
  const fx = { flashReject: () => flashes++ };
  const core = new InputCore(
    canvas,
    new THREE.OrthographicCamera(),
    sim,
    commands,
    palette as unknown as PaletteUI,
    inspector as unknown as InspectorUI,
    ghost as unknown as GhostPreview,
    ribbon as unknown as LaneRibbon,
    fx as unknown as FxRenderer,
  );
  return { sim, commands, palette, core, shown, selected, flashes: () => flashes };
}

describe('the panel tool through the input core', () => {
  it('toolStructure maps the panel tool to the panel kind, alongside wall, battery and towers', () => {
    expect(toolStructure('panel')).toEqual({ kind: 'panel' });
    expect(toolStructure('battery')).toEqual({ kind: 'battery' });
    expect(toolStructure('wall')).toEqual({ kind: 'wall' });
    expect(toolStructure('rapid')).toEqual({ kind: 'tower', archetype: 'rapid' });
    expect(toolStructure('remove')).toBeNull();
    expect(toolStructure('move')).toBeNull();
  });

  it('places a panel through the same command path as a wall, and the sim accepts it', () => {
    const r = rig();
    r.palette.select('panel');
    expect(r.core.commitPlace({ tx: 2, ty: 0 })).toBe(true);
    const drained = r.commands.drain();
    expect(drained).toHaveLength(1);
    expect(drained[0]).toMatchObject({ kind: 'place', structure: 'panel', tx: 2, ty: 0 });
    expect((drained[0] as { archetype?: unknown }).archetype).toBeUndefined();
    r.sim.tick(drained);
    expect(r.sim.state.structures[0]).toMatchObject({ kind: 'panel', tx: 2, ty: 0, paidMg: 40_000 });
  });

  it('drives the ghost with wall-style tinting: valid on dirt, invalid on a socket, debt when it cannot afford', () => {
    const r = rig();
    r.palette.select('panel');
    r.core.updateBuildGhost({ tx: 2, ty: 0 });
    expect(r.shown.at(-1)).toEqual({ kind: 'panel', tint: 'valid', rangeUnits: 0 });
    r.core.updateBuildGhost({ tx: 3, ty: 0 }); // the socket
    expect(r.shown.at(-1)).toEqual({ kind: 'panel', tint: 'invalid', rangeUnits: 0 });
    // A socket commit is refused locally with the flash, no command.
    expect(r.core.commitPlace({ tx: 3, ty: 0 })).toBe(false);
    expect(r.flashes()).toBe(1);
    expect(r.commands.drain()).toHaveLength(0);
    r.sim.state.treasuryMg = 30_000; // below the 40g panel, still ≥ 0
    r.sim.tick([]);
    r.core.updateBuildGhost({ tx: 4, ty: 0 });
    expect(r.shown.at(-1)).toEqual({ kind: 'panel', tint: 'debt', rangeUnits: 0 });
  });

  it('is removed with the remove tool under the wall\'s rules and is not inspectable', () => {
    const r = rig();
    r.sim.tick([place('panel', 2, 0)]);
    // A click on the panel with no tool selects nothing: panels have no inspector.
    r.core.selectAt({ tx: 2, ty: 0 });
    expect(r.selected).toEqual([null]);
    // The remove tool issues the removal; the sim refunds in full (provisional).
    r.palette.select('remove');
    const before = r.sim.state.treasuryMg;
    r.core.commitRemove({ tx: 2, ty: 0 });
    const drained = r.commands.drain();
    expect(drained[0]).toMatchObject({ kind: 'remove', tx: 2, ty: 0 });
    r.sim.tick(drained);
    expect(r.sim.state.structures).toHaveLength(0);
    expect(r.sim.state.treasuryMg).toBe(before + 40_000);
  });
});

describe('the battery tool through the input core (add-battery)', () => {
  it('hotkeys: the battery takes 7 after Solar; Remove and Move shift to 8 and 9', () => {
    expect(TOOL_KEYS).toEqual({
      wall: '1',
      rapid: '2',
      sniper: '3',
      area: '4',
      slow: '5',
      panel: '6',
      battery: '7',
      remove: '8',
      move: '9',
    });
    // Every tool has its own key: no two cards answer the same press.
    expect(new Set(Object.values(TOOL_KEYS)).size).toBe(Object.keys(TOOL_KEYS).length);
  });

  it('places a battery through the same command path as a wall, and the sim accepts it at its own price', () => {
    const r = rig();
    r.palette.select('battery');
    expect(r.core.commitPlace({ tx: 2, ty: 0 })).toBe(true);
    const drained = r.commands.drain();
    expect(drained).toHaveLength(1);
    expect(drained[0]).toMatchObject({ kind: 'place', structure: 'battery', tx: 2, ty: 0 });
    expect((drained[0] as { archetype?: unknown }).archetype).toBeUndefined();
    r.sim.tick(drained);
    expect(r.sim.state.structures[0]).toMatchObject({ kind: 'battery', tx: 2, ty: 0, paidMg: 30_000 });
  });

  it('drives the ghost with wall-style tinting and badges its price low like a wall', () => {
    const r = rig();
    r.palette.select('battery');
    r.core.updateBuildGhost({ tx: 2, ty: 0 });
    expect(r.shown.at(-1)).toEqual({ kind: 'battery', tint: 'valid', rangeUnits: 0 });
    // One badge, on the wall box: a ground tool's price sits low (no tower badge).
    expect(r.core.ghostCosts).toEqual({ tile: { tx: 2, ty: 0 }, towerMg: null, wallMg: 30_000 });
    r.core.updateBuildGhost({ tx: 3, ty: 0 }); // the socket
    expect(r.shown.at(-1)).toEqual({ kind: 'battery', tint: 'invalid', rangeUnits: 0 });
    expect(r.core.ghostCosts).toBeNull();
    expect(r.core.commitPlace({ tx: 3, ty: 0 })).toBe(false);
    expect(r.flashes()).toBe(1);
    expect(r.commands.drain()).toHaveLength(0);
    r.sim.state.treasuryMg = 20_000; // below the 30g battery, still ≥ 0
    r.sim.tick([]);
    r.core.updateBuildGhost({ tx: 4, ty: 0 });
    expect(r.shown.at(-1)).toEqual({ kind: 'battery', tint: 'debt', rangeUnits: 0 });
  });

  it('the panel badges its price low too: the ground-tool branch, not the tower one', () => {
    const r = rig();
    r.palette.select('panel');
    r.core.updateBuildGhost({ tx: 2, ty: 0 });
    expect(r.core.ghostCosts).toEqual({ tile: { tx: 2, ty: 0 }, towerMg: null, wallMg: 40_000 });
  });

  it('is removed with the remove tool under the wall\'s rules and is not inspectable', () => {
    const r = rig();
    r.sim.tick([place('battery', 2, 0)]);
    r.core.selectAt({ tx: 2, ty: 0 });
    expect(r.selected).toEqual([null]);
    r.palette.select('remove');
    const before = r.sim.state.treasuryMg;
    r.core.commitRemove({ tx: 2, ty: 0 });
    const drained = r.commands.drain();
    expect(drained[0]).toMatchObject({ kind: 'remove', tx: 2, ty: 0 });
    r.sim.tick(drained);
    expect(r.sim.state.structures).toHaveLength(0);
    expect(r.sim.state.treasuryMg).toBe(before + 30_000);
  });
});
