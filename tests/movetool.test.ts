// See the tower-drag-move change: the desktop lift/carry/drop lifecycle
// (build-ui delta, design D6) — towers and walls, the origin tile as the
// put-down, and the inspector's Move action as arm-then-lift (design D9) —
// and build-over-walls: the lift carries the tile's stack, the destination
// decides what lands, and the tower tool lays the wall with the tower on
// bare dirt (design D6) — over the stubbed-canvas pattern from
// mousecam.test.ts. The InputCore + PointerDriver pair runs against a real
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
import { makeSim, mount, openLevel, place } from './helpers';

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
  ghostShown: { kind: string; tint: string; rangeUnits: number; withWall: boolean } | null;
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

/**
 * A 7×3 corridor with a wall (id 0) and the tower on it (id 1) at (3,0);
 * 100 CSS pixels per tile.
 */
function rig(): Rig {
  const { sim } = makeSim(openLevel(7, 3, { x: 0, y: 1 }, { x: 6, y: 1 }));
  sim.tick(mount(3, 0));
  const commands = new CommandQueue();
  const handlers = new Map<string, (e: unknown) => void>();
  const canvas = {
    addEventListener: (t: string, h: (e: unknown) => void) => handlers.set(t, h),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 700, height: 300 }),
  } as unknown as HTMLCanvasElement;
  const palette = new StubPalette();
  const noop = (): void => {};
  const ghost = {
    show: (kind: string, _tx: number, _ty: number, tint: string, rangeUnits: number, withWall = false) => {
      r.ghostShown = { kind, tint, rangeUnits, withWall };
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

/** Tile of structure `id`, as [tx, ty]. */
const at = (r: Rig, id: number): [number, number] => {
  const s = r.sim.state.structures.find((x) => x.id === id)!;
  return [s.tx, s.ty];
};

describe('move tool, pointer driver', () => {
  it('press-drag-release drops the stack at the release tile with exactly one command', () => {
    const r = rig();
    r.pointer('pointermove', 350, 50);
    r.pointer('pointerdown', 350, 50); // press on the stack lifts it, naming the tower — the top
    expect(r.core.lifted).toEqual({ id: 1, tx: 3, ty: 0 });
    expect(r.core.liftedIds).toEqual([0, 1]); // the renderer dims both
    expect(r.drain()).toHaveLength(0); // the lift itself issues nothing

    r.pointer('pointermove', 350, 250); // past the slop: a drag
    r.frame();
    // Bare dirt: the ghost is the tower on the wall it lands with.
    expect(r.ghostShown).toMatchObject({ kind: 'tower', tint: 'valid', withWall: false });
    expect(r.core.ghostCosts).toBeNull(); // moves are free: no badges
    r.pointer('pointerup', 350, 250);
    const drained = r.drain();
    expect(drained).toHaveLength(1);
    expect(drained[0]).toMatchObject({ kind: 'move', tx: 3, ty: 0, toTx: 3, toTy: 2 });

    // Once the move applies, the per-frame sweep ends the lift; the tool the
    // player armed stays armed — a mode, not a one-shot. Both structures land.
    r.sim.tick(drained);
    r.frame();
    expect(r.core.lifted).toBeNull();
    expect(r.core.liftedIds).toEqual([]);
    expect(r.palette.selected).toBe('move');
    expect(at(r, 0)).toEqual([3, 2]);
    expect(at(r, 1)).toEqual([3, 2]);
  });

  it('dropping on a bare wall moves only the tower; the origin wall stays', () => {
    const r = rig();
    r.sim.tick([place('wall', 3, 2)]); // id 2: the destination foundation
    r.pointer('pointermove', 350, 50);
    r.pointer('pointerdown', 350, 50);
    r.pointer('pointermove', 350, 250);
    r.frame();
    // A foundation candidate: the tower ghost is raised onto the wall.
    expect(r.ghostShown).toMatchObject({ kind: 'tower', tint: 'valid', withWall: false });
    r.pointer('pointerup', 350, 250);
    const drained = r.drain();
    expect(drained).toHaveLength(1);
    expect(drained[0]).toMatchObject({ kind: 'move', tx: 3, ty: 0, toTx: 3, toTy: 2 });
    r.sim.tick(drained);
    r.frame();
    expect(r.core.lifted).toBeNull(); // the top moved: the lift ended
    expect(at(r, 1)).toEqual([3, 2]); // the tower hopped…
    expect(at(r, 0)).toEqual([3, 0]); // …the origin wall did not
    expect(at(r, 2)).toEqual([3, 2]);
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

  it('a drag released back over the origin puts the stack down: no flash, no command', () => {
    const r = rig();
    const before = r.sim.hash();
    r.pointer('pointermove', 350, 50);
    r.pointer('pointerdown', 350, 50);
    r.pointer('pointermove', 350, 250); // latches the drag…
    r.frame();
    expect(r.ghostShown?.tint).toBe('valid'); // (3,2) is open dirt
    r.pointer('pointermove', 351, 52); // …then wanders back within the slop
    r.frame();
    // The origin reads legal, and the ghost stands on its own wall there.
    expect(r.ghostShown).toMatchObject({ kind: 'tower', tint: 'valid', withWall: false });
    r.pointer('pointerup', 351, 52); // release over the origin: the put-down
    expect(r.flashes).toBe(0);
    expect(r.drain()).toHaveLength(0);
    expect(r.core.lifted).toBeNull();
    expect(r.core.liftedIds).toEqual([]); // every structure dims back
    expect(r.palette.selected).toBe('move'); // the palette-armed tool survives a put-down
    expect(at(r, 0)).toEqual([3, 0]);
    expect(at(r, 1)).toEqual([3, 0]);
    expect(r.sim.hash()).toBe(before);
  });

  it('the second click on the origin puts the stack down', () => {
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

  it('a bare wall lifts and drops as before, with a wall ghost and no range ring', () => {
    const r = rig();
    r.sim.tick([place('wall', 2, 2)]); // id 2
    r.pointer('pointermove', 250, 250);
    r.pointer('pointerdown', 250, 250); // press on the wall lifts it
    expect(r.core.lifted).toEqual({ id: 2, tx: 2, ty: 2 });
    expect(r.core.liftedIds).toEqual([2]);
    r.pointer('pointermove', 150, 250); // past the slop, over open dirt
    r.frame();
    expect(r.ghostShown).toEqual({ kind: 'wall', tint: 'valid', rangeUnits: 0, withWall: false });
    r.pointer('pointerup', 150, 250);
    const drained = r.drain();
    expect(drained).toHaveLength(1);
    expect(drained[0]).toMatchObject({ kind: 'move', tx: 2, ty: 2, toTx: 1, toTy: 2 });
    r.sim.tick(drained);
    r.frame();
    expect(r.core.lifted).toBeNull();
    expect(at(r, 2)).toEqual([1, 2]);
  });

  it('Esc (tool deselect) cancels the lift with no command', () => {
    const r = rig();
    r.pointer('pointermove', 350, 50);
    r.pointer('pointerdown', 350, 50);
    r.pointer('pointerup', 351, 50);
    expect(r.core.lifted).not.toBeNull();

    r.palette.select(null); // what the Esc binding does
    expect(r.core.lifted).toBeNull();
    expect(r.core.liftedIds).toEqual([]);
    expect(r.drain()).toHaveLength(0);
    expect(at(r, 0)).toEqual([3, 0]);
    expect(at(r, 1)).toEqual([3, 0]);
  });

  it('a failed drop flashes, issues nothing, and keeps the lift', () => {
    const r = rig();
    r.sim.tick(mount(5, 0)); // the drop target below already carries a tower
    r.pointer('pointermove', 350, 50);
    r.pointer('pointerdown', 350, 50);
    r.pointer('pointermove', 550, 50);
    r.frame();
    expect(r.ghostShown).toMatchObject({ kind: 'tower', tint: 'invalid', withWall: false });
    r.pointer('pointerup', 550, 50); // occupied: rejected locally
    expect(r.flashes).toBe(1);
    expect(r.drain()).toHaveLength(0);
    expect(r.core.lifted).toEqual({ id: 1, tx: 3, ty: 0 });

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

  it('carrying a stack across the board is hash-neutral', () => {
    const r = rig();
    const twin = rig(); // the same board, never lifted
    r.pointer('pointermove', 350, 50);
    r.pointer('pointerdown', 350, 50);
    r.pointer('pointerup', 351, 50); // click: carrying
    for (let ty = 0; ty < 3; ty++) {
      for (let tx = 0; tx < 7; tx++) {
        r.pointer('pointermove', tx * 100 + 50, ty * 100 + 50);
        r.frame();
      }
    }
    for (let t = 0; t < 10; t++) {
      r.sim.tick([]);
      twin.sim.tick([]);
      r.frame();
    }
    expect(r.core.lifted).not.toBeNull();
    expect(r.sim.hash()).toBe(twin.sim.hash());
  });

  it('a pending move for a stacked tile confirms through the same path (touch)', () => {
    // The touch driver lifts with core.liftAt and confirms with
    // core.commitMove on its pending tile — the very calls the pointer path
    // ends in — so a stack drops the same way from a tap.
    const r = rig();
    expect(r.core.liftAt({ tx: 3, ty: 0 })).toBe(true);
    expect(r.core.lifted).toEqual({ id: 1, tx: 3, ty: 0 });
    expect(r.core.commitMove({ tx: 3, ty: 2 })).toBe(true);
    const drained = r.drain();
    expect(drained).toHaveLength(1);
    expect(drained[0]).toMatchObject({ kind: 'move', tx: 3, ty: 0, toTx: 3, toTy: 2 });
    r.sim.tick(drained);
    expect(at(r, 0)).toEqual([3, 2]);
    expect(at(r, 1)).toEqual([3, 2]);
  });
});

describe('tower tool over walls', () => {
  it('on bare dirt the ghost brings its wall, and a click places both with one command', () => {
    const r = rig();
    r.palette.select('rapid');
    r.pointer('pointermove', 150, 250); // bare dirt
    r.frame();
    expect(r.ghostShown).toMatchObject({ kind: 'tower', tint: 'valid', withWall: true });
    expect(r.ghostShown!.rangeUnits).toBeGreaterThan(0);
    expect(r.core.verdictOk).toBe(true);
    // Both boxes carry a price badge (the stub palette prices every tool at 0).
    expect(r.core.ghostCosts).toEqual({ tile: { tx: 1, ty: 2 }, towerMg: 0, wallMg: 4_000 });
    r.pointer('pointerdown', 150, 250);
    expect(r.flashes).toBe(0);
    const drained = r.drain();
    expect(drained).toHaveLength(1);
    expect(drained[0]).toMatchObject({
      kind: 'place',
      structure: 'tower',
      archetype: 'rapid',
      tx: 1,
      ty: 2,
      withWall: true,
    });
    r.sim.tick(drained);
    expect(r.sim.state.structures.filter((s) => s.tx === 1 && s.ty === 2).map((s) => s.kind)).toEqual(['wall', 'tower']);
    // Placed: the tile is a foundation now, so the ghost there is a plain tower ghost.
    r.frame();
    expect(r.ghostShown).toMatchObject({ kind: 'tower', tint: 'invalid', withWall: false }); // occupied
    expect(r.core.ghostCosts).toBeNull(); // no price on an invalid placement
  });

  it('a compound the wall rules refuse flashes and issues nothing', () => {
    const r = rig();
    // Seal the corridor's middle row: walls above and below (1,1) leave (1,1)
    // the only way through, so a wall there seals the spawn.
    r.sim.tick([place('wall', 1, 0), place('wall', 1, 2)]);
    r.palette.select('rapid');
    r.pointer('pointermove', 150, 150);
    r.frame();
    expect(r.ghostShown).toMatchObject({ kind: 'tower', tint: 'invalid', withWall: true });
    expect(r.core.ghostCosts).toBeNull(); // no price on an invalid placement
    r.pointer('pointerdown', 150, 150);
    expect(r.flashes).toBe(1);
    expect(r.drain()).toHaveLength(0);
  });

  it('a click on a bare wall issues one plain place; the ghost is a plain tower ghost', () => {
    const r = rig();
    r.sim.tick([place('wall', 1, 2)]);
    r.palette.select('rapid');
    r.pointer('pointermove', 150, 250);
    r.frame();
    expect(r.ghostShown).toMatchObject({ kind: 'tower', tint: 'valid', withWall: false });
    expect(r.ghostShown!.rangeUnits).toBeGreaterThan(0); // the level-1 ring
    expect(r.core.ghostCosts).toEqual({ tile: { tx: 1, ty: 2 }, towerMg: 0, wallMg: null }); // one badge
    r.pointer('pointerdown', 150, 250);
    expect(r.flashes).toBe(0);
    const drained = r.drain();
    expect(drained).toHaveLength(1);
    expect(drained[0]).toMatchObject({ kind: 'place', structure: 'tower', archetype: 'rapid', tx: 1, ty: 2 });
    expect(drained[0]).not.toHaveProperty('withWall');
    r.sim.tick(drained);
    expect(r.sim.state.structures.filter((s) => s.tx === 1 && s.ty === 2).map((s) => s.kind)).toEqual(['wall', 'tower']);
  });

  it('over a wall that already carries a tower the ghost reads invalid and brings no wall', () => {
    const r = rig();
    r.palette.select('rapid');
    r.pointer('pointermove', 350, 50); // the mounted stack
    r.frame();
    expect(r.ghostShown).toMatchObject({ kind: 'tower', tint: 'invalid', withWall: false });
    r.pointer('pointerdown', 350, 50);
    expect(r.flashes).toBe(1);
    expect(r.drain()).toHaveLength(0);
  });

  it('a wall ghost is a wall ghost', () => {
    const r = rig();
    r.palette.select('wall');
    r.pointer('pointermove', 150, 250);
    r.frame();
    expect(r.ghostShown).toEqual({ kind: 'wall', tint: 'valid', rangeUnits: 0, withWall: false });
    expect(r.core.ghostCosts).toEqual({ tile: { tx: 1, ty: 2 }, towerMg: null, wallMg: 0 }); // the wall's badge
  });
});

describe('selection on a stacked tile', () => {
  it('inspects the tower, and a bare wall deselects', () => {
    const r = rig();
    r.palette.selected = null; // no tool: a click selects
    r.sim.tick([place('wall', 2, 2)]);
    const selections: (Structure | null)[] = [];
    r.inspector.select = (s) => selections.push(s);
    r.pointer('pointermove', 350, 50);
    r.pointer('pointerdown', 350, 50); // the stack
    expect(selections.at(-1)).toMatchObject({ id: 1, kind: 'tower' });
    r.pointer('pointerup', 350, 50);
    r.pointer('pointermove', 250, 250);
    r.pointer('pointerdown', 250, 250); // the bare wall
    expect(selections.at(-1)).toBeNull();
  });

  it("the inspector's remove peels the tower and the wall stays", () => {
    // The inspector issues a remove for the tower's tile; the sim takes the
    // top structure — the tower — and the wall it stood on is untouched.
    const r = rig();
    r.commands.issue({ kind: 'remove', tx: 3, ty: 0 });
    const drained = r.drain();
    expect(drained).toHaveLength(1);
    r.sim.tick(drained);
    expect(r.sim.state.structures.map((s) => [s.id, s.kind])).toEqual([[0, 'wall']]);
  });
});

describe('inspector Move action', () => {
  it('arms the move tool and lifts the inspected tower, as a palette click and a press would', () => {
    const r = rig();
    r.palette.selected = null; // no tool armed: the tower was clicked to inspect
    const tower = r.sim.state.structures[1]!;
    expect(r.inspector.onMove).not.toBeNull(); // the core wired the hook

    r.inspector.onMove!(tower);
    expect(r.palette.selected).toBe('move');
    expect(r.inspector.deselects).toBe(1); // the tool change closed the inspector
    expect(r.core.lifted).toEqual({ id: 1, tx: 3, ty: 0 }); // the tower's tile: the whole stack
    expect(r.core.liftedIds).toEqual([0, 1]);
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
    // Until the move applies the lift stands and the tool stays armed — a
    // rejection at the applying tick would need it.
    expect(r.core.lifted).toEqual({ id: 1, tx: 3, ty: 0 });
    expect(r.palette.selected).toBe('move');
  });

  it('is one-shot: the tool disarms once the move applies', () => {
    const r = rig();
    r.palette.selected = null;
    r.inspector.onMove!(r.sim.state.structures[1]!);
    r.pointer('pointermove', 350, 250);
    r.pointer('pointerdown', 350, 250);
    r.pointer('pointerup', 350, 250);
    const drained = r.drain();
    expect(drained).toHaveLength(1);
    r.sim.tick(drained);
    r.frame(); // the sweep sees the tower on its new tile
    expect(at(r, 1)).toEqual([3, 2]);
    expect(at(r, 0)).toEqual([3, 2]); // the wall came along
    expect(r.core.lifted).toBeNull();
    expect(r.palette.selected).toBeNull(); // back to no tool, unlike a palette-armed lift
    // A subsequent press with no tool armed selects rather than lifts.
    r.pointer('pointermove', 350, 250);
    r.pointer('pointerdown', 350, 250);
    expect(r.core.lifted).toBeNull();
    expect(r.drain()).toHaveLength(0);
  });

  it('is one-shot: putting the tower down on its origin disarms the tool', () => {
    const r = rig();
    r.palette.selected = null;
    const before = r.sim.hash();
    r.inspector.onMove!(r.sim.state.structures[1]!);
    r.pointer('pointermove', 350, 50);
    r.pointer('pointerdown', 350, 50); // second click on the origin: the put-down
    expect(r.flashes).toBe(0);
    expect(r.drain()).toHaveLength(0);
    expect(r.core.lifted).toBeNull();
    expect(r.palette.selected).toBeNull();
    expect(r.sim.hash()).toBe(before);
    r.pointer('pointerup', 350, 50); // its release is inert
    expect(r.drain()).toHaveLength(0);
  });

  it('is one-shot: the cancel affordance disarms the tool', () => {
    const r = rig();
    r.palette.selected = null;
    r.inspector.onMove!(r.sim.state.structures[1]!);
    r.core.cancelLift(); // what the touch ✕ does
    expect(r.core.lifted).toBeNull();
    expect(r.palette.selected).toBeNull();
    expect(r.drain()).toHaveLength(0);
  });

  it('a failed drop keeps carrying and keeps the tool armed, as for any lift', () => {
    const r = rig();
    r.sim.tick(mount(5, 0)); // the drop target below already carries a tower
    r.palette.selected = null;
    r.inspector.onMove!(r.sim.state.structures[1]!);
    r.pointer('pointermove', 550, 50);
    r.pointer('pointerdown', 550, 50); // occupied: rejected locally
    expect(r.flashes).toBe(1);
    expect(r.drain()).toHaveLength(0);
    expect(r.core.lifted).toEqual({ id: 1, tx: 3, ty: 0 });
    expect(r.palette.selected).toBe('move');
    r.pointer('pointerup', 550, 50);
    // The next drop still lands, and then the tool disarms.
    r.pointer('pointermove', 350, 250);
    r.pointer('pointerdown', 350, 250);
    const drained = r.drain();
    expect(drained).toHaveLength(1);
    r.sim.tick(drained);
    r.frame();
    expect(r.palette.selected).toBeNull();
  });

  it('a lift the player re-arms from the palette after an inspector move is a mode again', () => {
    const r = rig();
    r.palette.selected = null;
    r.inspector.onMove!(r.sim.state.structures[1]!);
    r.palette.select(null); // Esc mid-carry: cancels, and clears the one-shot flag with it
    expect(r.core.lifted).toBeNull();
    r.palette.select('move'); // the player arms the mode by hand…
    r.pointer('pointermove', 350, 50);
    r.pointer('pointerdown', 350, 50);
    r.pointer('pointerup', 351, 50); // …lifts with a click…
    r.pointer('pointermove', 352, 48);
    r.pointer('pointerdown', 352, 48); // …and puts down on the origin
    expect(r.core.lifted).toBeNull();
    expect(r.palette.selected).toBe('move'); // the mode survives: no stale one-shot
  });

  it('does nothing when the palette refuses the move tool (outside the build phase)', () => {
    const r = rig();
    r.palette.selected = null;
    r.palette.moveGated = true; // what a running wave does to the tool
    r.inspector.onMove!(r.sim.state.structures[1]!);
    expect(r.palette.selected).toBeNull();
    expect(r.core.lifted).toBeNull();
    expect(r.lifts).toHaveLength(0);
    expect(r.inspector.deselects).toBe(0);
    expect(r.drain()).toHaveLength(0);
    expect(r.flashes).toBe(0);
  });
});
