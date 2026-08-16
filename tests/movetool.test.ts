// See the tower-drag-move change: the desktop lift/carry/drop lifecycle
// (build-ui delta, design D6) — towers and walls, the origin tile as the
// put-down, and the inspector's Move action as arm-then-lift (design D9) —
// over the stubbed-canvas pattern from mousecam.test.ts. The InputCore + PointerDriver pair runs against a real
// Sim and CommandQueue; picking is stubbed to a flat 100px-per-tile mapping
// so the slop arithmetic stays real while the camera does not exist.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { FxRenderer, GhostPreview } from '../src/render/fx';
import type { LaneRibbon } from '../src/render/ribbon';
import { CommandQueue, type Command } from '../src/sim/commands';
import { PointerDriver } from '../src/ui/input';
import { InputCore, type Tile } from '../src/ui/inputcore';
import type { InspectorUI } from '../src/ui/inspector';
import type { PaletteUI, Tool } from '../src/ui/palette';
import type { Structure } from '../src/sim/types';
import { makeSim, openLevel, place } from './helpers';

/**
 * Palette double: the mode machine alone — selection state + onChange, plus
 * the move tool's phase gate (a refused select leaves the selection alone,
 * as the real palette does outside the build phase).
 */
class StubPalette {
  selected: Tool | null = 'move';
  moveGated = false;
  onChange: ((tool: Tool | null) => void) | null = null;
  costOf(): number {
    return 0;
  }
  select(tool: Tool | null): void {
    if (tool === 'move' && this.moveGated) return;
    this.selected = tool;
    this.onChange?.(tool);
  }
}

/** Inspector double: the selection sink plus the Move action's hook. */
interface StubInspector {
  select: (s: Structure | null) => void;
  current: Structure | null;
  previewStats: null;
  onMove: ((s: Structure) => void) | null;
  /** Every select(null) the core issued — the tool-change deselect. */
  deselects: number;
}

interface Rig {
  core: InputCore;
  palette: StubPalette;
  inspector: StubInspector;
  commands: CommandQueue;
  flashes: number;
  /** Every origin the core's onLift hook reported (the touch driver's cue). */
  lifts: Tile[];
  /** The last ghost.show call, or null after hide. */
  ghostShown: { kind: string; tint: string; rangeUnits: number } | null;
  sim: ReturnType<typeof makeSim>['sim'];
  drain: () => Command[];
  /** One frame of the driver's per-frame maintenance. */
  frame: () => void;
  pointer: (
    type: 'pointermove' | 'pointerdown' | 'pointerup',
    clientX: number,
    clientY: number,
  ) => void;
}

/** A 7×3 corridor with a tower at (3,0); 100 CSS pixels per tile. */
function rig(): Rig {
  const { sim } = makeSim(openLevel(7, 3, { x: 0, y: 1 }, { x: 6, y: 1 }));
  sim.tick([place('tower', 3, 0)]);
  const commands = new CommandQueue();
  const handlers = new Map<string, (e: unknown) => void>();
  const canvas = {
    addEventListener: (t: string, h: (e: unknown) => void) => handlers.set(t, h),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 700, height: 300 }),
  } as unknown as HTMLCanvasElement;
  const palette = new StubPalette();
  const noop = (): void => {};
  const ghost = {
    show: (kind: string, _tx: number, _ty: number, tint: string, rangeUnits: number) => {
      r.ghostShown = { kind, tint, rangeUnits };
    },
    hide: () => (r.ghostShown = null),
    showRingAt: noop,
    showPreviewRingAt: noop,
  };
  const ribbon = { update: noop, hide: noop };
  const inspector: StubInspector = {
    select: (s) => {
      if (s === null) inspector.deselects += 1;
    },
    current: null,
    previewStats: null,
    onMove: null,
    deselects: 0,
  };
  const r: Partial<Rig> = { flashes: 0, ghostShown: null, lifts: [] };
  const fx = { flashReject: () => (r.flashes = (r.flashes ?? 0) + 1) };

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
  // Flat picking: tile (⌊x/100⌋, ⌊y/100⌋), off the board → null.
  core.pickTile = (clientX: number, clientY: number): Tile | null => {
    const tx = Math.floor(clientX / 100);
    const ty = Math.floor(clientY / 100);
    return sim.grid.inBounds(tx, ty) ? { tx, ty } : null;
  };
  const driver = new PointerDriver(canvas, core);
  core.onLift = (origin) => r.lifts!.push(origin);

  r.core = core;
  r.palette = palette;
  r.inspector = inspector;
  r.commands = commands;
  r.sim = sim;
  r.drain = () => commands.drain();
  r.frame = () => driver.update();
  r.pointer = (type, clientX, clientY) =>
    handlers.get(type)!({ pointerType: 'mouse', button: 0, clientX, clientY });
  return r as Rig;
}

describe('move tool, pointer driver', () => {
  it('press-drag-release drops at the release tile with exactly one command', () => {
    const r = rig();
    r.pointer('pointermove', 350, 50);
    r.pointer('pointerdown', 350, 50); // press on the tower lifts it
    expect(r.core.lifted).toEqual({ id: 0, tx: 3, ty: 0 });
    expect(r.drain()).toHaveLength(0); // the lift itself issues nothing

    r.pointer('pointermove', 350, 250); // past the slop: a drag
    r.pointer('pointerup', 350, 250);
    const drained = r.drain();
    expect(drained).toHaveLength(1);
    expect(drained[0]).toMatchObject({ kind: 'move', tx: 3, ty: 0, toTx: 3, toTy: 2 });

    // Once the move applies, the per-frame sweep ends the lift.
    r.sim.tick(drained);
    r.frame();
    expect(r.core.lifted).toBeNull();
    expect([r.sim.state.structures[0]!.tx, r.sim.state.structures[0]!.ty]).toEqual([3, 2]);
  });

  it('a sub-slop release keeps carrying; the second click drops', () => {
    const r = rig();
    r.pointer('pointermove', 350, 50);
    r.pointer('pointerdown', 350, 50);
    r.pointer('pointermove', 353, 52); // within the slop
    r.pointer('pointerup', 353, 52); // a click: still carrying
    expect(r.core.lifted).not.toBeNull();
    expect(r.drain()).toHaveLength(0);

    r.pointer('pointermove', 350, 250);
    r.pointer('pointerdown', 350, 250); // the second click attempts the drop
    const drained = r.drain();
    expect(drained).toHaveLength(1);
    expect(drained[0]).toMatchObject({ kind: 'move', tx: 3, ty: 0, toTx: 3, toTy: 2 });
    r.pointer('pointerup', 350, 250); // its release is inert
    expect(r.drain()).toHaveLength(0);
  });

  it('a drag released back over the origin puts the tower down: no flash, no command', () => {
    const r = rig();
    const before = r.sim.hash();
    r.pointer('pointermove', 350, 50);
    r.pointer('pointerdown', 350, 50);
    r.pointer('pointermove', 350, 250); // latches the drag…
    r.frame();
    expect(r.ghostShown?.tint).toBe('valid'); // (3,2) is open dirt
    r.pointer('pointermove', 351, 52); // …then wanders back within the slop
    r.frame();
    expect(r.ghostShown).toMatchObject({ kind: 'tower', tint: 'valid' }); // the origin reads legal
    r.pointer('pointerup', 351, 52); // release over the origin: the put-down
    expect(r.flashes).toBe(0);
    expect(r.drain()).toHaveLength(0);
    expect(r.core.lifted).toBeNull();
    expect([r.sim.state.structures[0]!.tx, r.sim.state.structures[0]!.ty]).toEqual([3, 0]);
    expect(r.sim.hash()).toBe(before);
  });

  it('the second click on the origin puts the tower down', () => {
    const r = rig();
    r.pointer('pointermove', 350, 50);
    r.pointer('pointerdown', 350, 50);
    r.pointer('pointerup', 351, 50); // a click: carrying
    expect(r.core.lifted).not.toBeNull();
    r.pointer('pointermove', 352, 48);
    r.pointer('pointerdown', 352, 48); // second click, same tile
    expect(r.flashes).toBe(0);
    expect(r.drain()).toHaveLength(0);
    expect(r.core.lifted).toBeNull();
    r.pointer('pointerup', 352, 48); // its release is inert
    expect(r.drain()).toHaveLength(0);
  });

  it('a wall lifts and drops like a tower, with a wall ghost and no range ring', () => {
    const r = rig();
    r.sim.tick([place('wall', 2, 2)]);
    r.pointer('pointermove', 250, 250);
    r.pointer('pointerdown', 250, 250); // press on the wall lifts it
    expect(r.core.lifted).toEqual({ id: 1, tx: 2, ty: 2 });
    r.pointer('pointermove', 150, 250); // past the slop, over open dirt
    r.frame();
    expect(r.ghostShown).toEqual({ kind: 'wall', tint: 'valid', rangeUnits: 0 });
    r.pointer('pointerup', 150, 250);
    const drained = r.drain();
    expect(drained).toHaveLength(1);
    expect(drained[0]).toMatchObject({ kind: 'move', tx: 2, ty: 2, toTx: 1, toTy: 2 });
    r.sim.tick(drained);
    r.frame();
    expect(r.core.lifted).toBeNull();
    expect([r.sim.state.structures[1]!.tx, r.sim.state.structures[1]!.ty]).toEqual([1, 2]);
  });

  it('Esc (tool deselect) cancels the lift with no command', () => {
    const r = rig();
    r.pointer('pointermove', 350, 50);
    r.pointer('pointerdown', 350, 50);
    r.pointer('pointerup', 351, 50);
    expect(r.core.lifted).not.toBeNull();

    r.palette.select(null); // what the Esc binding does
    expect(r.core.lifted).toBeNull();
    expect(r.drain()).toHaveLength(0);
    expect([r.sim.state.structures[0]!.tx, r.sim.state.structures[0]!.ty]).toEqual([3, 0]);
  });

  it('a failed drop flashes, issues nothing, and keeps the lift', () => {
    const r = rig();
    r.sim.tick([place('tower', 5, 0)]); // the drop target below is occupied
    r.pointer('pointermove', 350, 50);
    r.pointer('pointerdown', 350, 50);
    r.pointer('pointermove', 550, 50);
    r.pointer('pointerup', 550, 50); // occupied: rejected locally
    expect(r.flashes).toBe(1);
    expect(r.drain()).toHaveLength(0);
    expect(r.core.lifted).toEqual({ id: 0, tx: 3, ty: 0 });

    // Still carrying: the next drop needs no re-lift.
    r.pointer('pointermove', 350, 250);
    r.pointer('pointerdown', 350, 250);
    expect(r.drain()).toHaveLength(1);
  });

  it('presses on empty tiles with nothing lifted do nothing', () => {
    const r = rig();
    r.pointer('pointermove', 150, 150);
    r.pointer('pointerdown', 150, 150); // bare dirt
    expect(r.core.lifted).toBeNull();
    r.pointer('pointerup', 150, 150);
    expect(r.core.lifted).toBeNull();
    expect(r.drain()).toHaveLength(0);
    expect(r.flashes).toBe(0);
  });
});

describe('inspector Move action', () => {
  it('arms the move tool and lifts the inspected tower, as a palette click and a press would', () => {
    const r = rig();
    r.palette.selected = null; // no tool armed: the tower was clicked to inspect
    const tower = r.sim.state.structures[0]!;
    expect(r.inspector.onMove).not.toBeNull(); // the core wired the hook

    r.inspector.onMove!(tower);
    expect(r.palette.selected).toBe('move');
    expect(r.inspector.deselects).toBe(1); // the tool change closed the inspector
    expect(r.core.lifted).toEqual({ id: 0, tx: 3, ty: 0 });
    expect(r.lifts).toEqual([{ tx: 3, ty: 0 }]); // touch's cue to stage the pending ghost
    expect(r.drain()).toHaveLength(0); // arming and lifting issue nothing

    // No press is standing, so this is the click-click carry: hover shows the
    // tower ghost, and the next click drops.
    r.pointer('pointermove', 350, 250);
    r.frame();
    expect(r.ghostShown).toMatchObject({ kind: 'tower', tint: 'valid' });
    r.pointer('pointerdown', 350, 250);
    const drained = r.drain();
    expect(drained).toHaveLength(1);
    expect(drained[0]).toMatchObject({ kind: 'move', tx: 3, ty: 0, toTx: 3, toTy: 2 });
    r.pointer('pointerup', 350, 250); // its release is inert
    expect(r.drain()).toHaveLength(0);
  });

  it('a second click on the origin after the inspector lift puts the tower down', () => {
    const r = rig();
    r.palette.selected = null;
    const before = r.sim.hash();
    r.inspector.onMove!(r.sim.state.structures[0]!);
    r.pointer('pointermove', 350, 50);
    r.pointer('pointerdown', 350, 50);
    expect(r.flashes).toBe(0);
    expect(r.drain()).toHaveLength(0);
    expect(r.core.lifted).toBeNull();
    expect(r.palette.selected).toBe('move'); // the tool stays armed, as after any put-down
    expect(r.sim.hash()).toBe(before);
  });

  it('does nothing when the palette refuses the move tool (outside the build phase)', () => {
    const r = rig();
    r.palette.selected = null;
    r.palette.moveGated = true; // what a running wave does to the tool
    r.inspector.onMove!(r.sim.state.structures[0]!);
    expect(r.palette.selected).toBeNull();
    expect(r.core.lifted).toBeNull();
    expect(r.lifts).toHaveLength(0);
    expect(r.inspector.deselects).toBe(0);
    expect(r.drain()).toHaveLength(0);
    expect(r.flashes).toBe(0);
  });
});
