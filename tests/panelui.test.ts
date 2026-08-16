// See the energy-infrastructure build-ui delta ("The panel is placeable and
// removable like a wall"): the panel through the shared input core — the
// same command path as a wall, wall-style ghost tinting, the remove tool
// covering it, and no inspector for it — over the stubbed rig pattern from
// movetool.test.ts.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { FxRenderer, GhostPreview } from '../src/render/fx';
import type { LaneRibbon } from '../src/render/ribbon';
import { CommandQueue } from '../src/sim/commands';
import { InputCore } from '../src/ui/inputcore';
import type { InspectorUI } from '../src/ui/inspector';
import { toolStructure, type PaletteUI, type Tool } from '../src/ui/palette';
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
  const palette = new StubPalette({ panel: 40_000, wall: 4000 });
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
  it('toolStructure maps the panel tool to the panel kind, alongside wall and towers', () => {
    expect(toolStructure('panel')).toEqual({ kind: 'panel' });
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
