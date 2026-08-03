// Touch input driver: pending ghost with confirm/cancel, tap selection,
// pinch-zoom + pan camera
// See the aether-ui-redesign touch-input spec and designs D3/D4/D5
//
// Responsibilities:
//   - Build tool: a tap anchors the validated ghost as a pending placement;
//     dragging or tapping elsewhere moves it; a floating ✓/✕ pair anchored
//     to the ghost commits through the same InputCore path a desktop click
//     uses, or dismisses with no state change
//   - No tool: tap selects/deselects structures; one-finger drag pans and
//     pinch zooms the camera
//   - Two-finger gestures always drive the camera, tool or not
//   - The pending ghost and all camera motion are render-side only — the
//     sim is only ever touched by the standard commands

import type { IsometricCamera } from '../render/cameras';
import { GestureTracker, type GestureEvent } from './gestures';
import type { InputCore, Tile } from './inputcore';
import { toolStructure } from './palette';

const CONFIRM_WRAP = 'pointer-events-none absolute z-40 flex -translate-x-1/2 gap-3';
const BTN_OK =
  'btn-mech bevel-panel pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full ' +
  'border-2 border-tertiary-container bg-surface-container-high text-tertiary-container ' +
  'shadow-[0_0_12px_rgba(101,242,181,0.25)]';
const BTN_OK_INVALID =
  'btn-mech bevel-panel pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full ' +
  'border-2 border-outline-variant bg-surface-container-high text-on-surface-variant opacity-50';
const BTN_CANCEL =
  'btn-mech bevel-panel pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full ' +
  'border-2 border-error/70 bg-surface-container-high text-error';

/** Screen offset of the ✓/✕ pair above the ghost tile, in CSS pixels. */
const AFFORDANCE_LIFT_PX = 64;
const AFFORDANCE_EDGE_PX = 8;

export class TouchDriver {
  private readonly core: InputCore;
  private readonly camera: IsometricCamera;
  private readonly canvas: HTMLCanvasElement;
  private readonly tracker = new GestureTracker();

  /** The single piece of touch UI state: the pending placement, or null. */
  private pending: Tile | null = null;

  private readonly affordance: HTMLDivElement;
  private readonly confirmButton: HTMLButtonElement;
  private lastConfirmClass = BTN_OK;

  constructor(canvas: HTMLCanvasElement, core: InputCore, camera: IsometricCamera, hud: HTMLElement) {
    this.core = core;
    this.camera = camera;
    this.canvas = canvas;
    core.onToolChange = () => (this.pending = null);

    canvas.addEventListener('pointerdown', (e) => {
      this.route(this.tracker.down(e.pointerId, e.clientX, e.clientY, e.timeStamp));
    });
    canvas.addEventListener('pointermove', (e) => {
      this.route(this.tracker.move(e.pointerId, e.clientX, e.clientY, e.timeStamp));
    });
    canvas.addEventListener('pointerup', (e) => {
      this.route(this.tracker.up(e.pointerId, e.clientX, e.clientY, e.timeStamp));
    });
    canvas.addEventListener('pointercancel', (e) => {
      this.route(this.tracker.cancel(e.pointerId));
    });

    // Floating confirm/cancel pair, re-anchored to the ghost every frame.
    this.affordance = document.createElement('div');
    this.affordance.className = CONFIRM_WRAP;
    this.affordance.style.display = 'none';
    this.confirmButton = document.createElement('button');
    this.confirmButton.className = BTN_OK;
    this.confirmButton.innerHTML = '<span class="material-symbols-outlined text-3xl">check</span>';
    this.confirmButton.addEventListener('click', () => {
      if (this.pending && this.core.commitPlace(this.pending)) this.pending = null;
    });
    const cancel = document.createElement('button');
    cancel.className = BTN_CANCEL;
    cancel.innerHTML = '<span class="material-symbols-outlined text-3xl">close</span>';
    cancel.addEventListener('click', () => (this.pending = null));
    this.affordance.append(this.confirmButton, cancel);
    hud.appendChild(this.affordance);
  }

  private get buildToolActive(): boolean {
    const tool = this.core.palette.selected;
    return tool !== null && toolStructure(tool) !== null;
  }

  /** Gesture routing (design D4): build gestures never move the camera. */
  private route(ev: GestureEvent | null): void {
    if (!ev) return;
    switch (ev.kind) {
      case 'tap': {
        const tile = this.core.pickTile(ev.x, ev.y);
        const tool = this.core.palette.selected;
        if (this.buildToolActive) {
          if (tile) this.pending = tile;
        } else if (tool === 'remove') {
          if (tile) this.core.commitRemove(tile);
        } else if (tile) {
          this.core.selectAt(tile);
        } else {
          this.core.inspector.select(null);
        }
        return;
      }
      case 'drag-start':
      case 'drag-move': {
        if (this.buildToolActive) {
          // One-finger drag adjusts the pending ghost.
          const tile = this.core.pickTile(ev.x, ev.y);
          if (tile) this.pending = tile;
        } else if (ev.kind === 'drag-move') {
          this.camera.panByPixels(ev.dx, ev.dy, this.canvas.clientWidth, this.canvas.clientHeight);
        }
        return;
      }
      case 'pinch-move': {
        // Two fingers always drive the camera, build tool or not.
        const rect = this.canvas.getBoundingClientRect();
        const ndcX = ((ev.centerX - rect.left) / rect.width) * 2 - 1;
        const ndcY = -((ev.centerY - rect.top) / rect.height) * 2 + 1;
        this.camera.pinch(ev.scale, ndcX, ndcY);
        this.camera.panByPixels(ev.dx, ev.dy, this.canvas.clientWidth, this.canvas.clientHeight);
        return;
      }
      case 'drag-end':
      case 'pinch-start':
      case 'pinch-end':
        return;
    }
  }

  /** Per-frame: pending ghost verdict loop + confirm/cancel anchoring. */
  update(): void {
    if (!this.buildToolActive) {
      this.pending = null;
      this.affordance.style.display = 'none';
      this.core.updateIdleRings();
      return;
    }
    this.core.updateBuildGhost(this.pending);
    if (!this.pending) {
      this.affordance.style.display = 'none';
      return;
    }

    // Anchor above the ghost tile via world→screen projection, clamped to
    // the viewport so the pair stays reachable at the board edges.
    const p = this.core.projectTile(this.pending);
    const halfWidth = this.affordance.offsetWidth / 2 || 54;
    const height = this.affordance.offsetHeight || 48;
    const x = Math.min(window.innerWidth - halfWidth - AFFORDANCE_EDGE_PX, Math.max(halfWidth + AFFORDANCE_EDGE_PX, p.x));
    const y = Math.min(
      window.innerHeight - height - AFFORDANCE_EDGE_PX,
      Math.max(AFFORDANCE_EDGE_PX, p.y - AFFORDANCE_LIFT_PX),
    );
    this.affordance.style.display = 'flex';
    this.affordance.style.left = `${x}px`;
    this.affordance.style.top = `${y}px`;

    // The confirm face reflects the ghost's current verdict (touch-input
    // spec); commit still re-validates, so this is presentation only.
    const confirmClass = this.core.verdictOk ? BTN_OK : BTN_OK_INVALID;
    if (confirmClass !== this.lastConfirmClass) {
      this.lastConfirmClass = confirmClass;
      this.confirmButton.className = confirmClass;
    }
  }
}
