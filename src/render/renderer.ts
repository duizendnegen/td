// Scene, lights, frame entry point
// See ARCHITECTURE.md §8
//
// Responsibilities:
//   - Owns the single sim-space to world-space conversion
//   - Never mutates sim state

import * as THREE from 'three';
import { TILE } from '../sim/fixed';

/** Ground tile tops sit at this height; everything on the board is offset by it. */
export const GROUND_TOP_Y = 0.2;

// ── Sim → world conversion (ARCHITECTURE.md §6) ─────────────────────────────
// Sim: x right, y DOWN, 1024 units per tile. World: x right, z forward, y up.
// This is the one place the axis flip lives.

/** Fixed-point sim position → world x. */
export function simToWorldX(simX: number): number {
  return simX / TILE;
}

/** Fixed-point sim position → world z (sim y maps onto world z). */
export function simToWorldZ(simY: number): number {
  return simY / TILE;
}

/** Tile coordinate → world-space tile centre. */
export function tileToWorld(tx: number, ty: number): { x: number; z: number } {
  return { x: tx + 0.5, z: ty + 0.5 };
}

export class Renderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x12161c);

    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(12, 20, 8);
    this.scene.add(sun);
    this.scene.add(new THREE.AmbientLight(0xbcc7d6, 1.1));
  }

  /** Current canvas aspect ratio; cameras re-frame from this on resize. */
  get aspect(): number {
    return window.innerWidth / window.innerHeight;
  }

  onResize(callback: (aspect: number) => void): void {
    window.addEventListener('resize', () => {
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      callback(this.aspect);
    });
  }

  render(camera: THREE.Camera): void {
    this.renderer.render(this.scene, camera);
  }
}
