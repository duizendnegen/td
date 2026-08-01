// GLB loading, shared material, model registry
// See ARCHITECTURE.md §8
//
// Responsibilities:
//   - One MeshLambertMaterial from colormap.png, shared by all models
//   - Imports from three/addons/loaders/GLTFLoader.js

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// All runtime fetches go through BASE_URL so the same build works at the dev
// server root and under the /td/ project path on Pages (design D-P1-6).
const base = import.meta.env.BASE_URL;

export class Assets {
  readonly material: THREE.MeshLambertMaterial;
  private readonly models = new Map<string, THREE.Group>();

  private constructor(material: THREE.MeshLambertMaterial) {
    this.material = material;
  }

  static async load(names: readonly string[]): Promise<Assets> {
    const texture = await new THREE.TextureLoader().loadAsync(
      `${base}models/Textures/colormap.png`,
    );
    // GLTF UVs assume an unflipped texture; the atlas is authored in sRGB.
    texture.flipY = false;
    texture.colorSpace = THREE.SRGBColorSpace;
    const assets = new Assets(new THREE.MeshLambertMaterial({ map: texture }));

    const loader = new GLTFLoader();
    await Promise.all(
      names.map(async (name) => {
        const gltf = await loader.loadAsync(`${base}models/${name}.glb`);
        gltf.scene.updateMatrixWorld(true);
        gltf.scene.traverse((obj) => {
          if (obj instanceof THREE.Mesh) {
            // Drop the per-model material the GLB shipped with; every mesh in
            // the scene renders with the one shared atlas material.
            (obj.material as THREE.Material).dispose();
            obj.material = assets.material;
          }
        });
        assets.models.set(name, gltf.scene);
      }),
    );
    return assets;
  }

  /** A renderable clone of a loaded model, sharing the atlas material. */
  instance(name: string): THREE.Group {
    const model = this.models.get(name);
    if (!model) throw new Error(`model not loaded: ${name}`);
    const clone = model.clone(true);
    clone.traverse((obj) => {
      if (obj instanceof THREE.Mesh) obj.material = this.material;
    });
    return clone;
  }

  /**
   * The model's meshes baked into a single BufferGeometry in model-local
   * space — the input the merged-ground builder transforms per tile.
   */
  geometry(name: string): THREE.BufferGeometry {
    const model = this.models.get(name);
    if (!model) throw new Error(`model not loaded: ${name}`);
    const parts: THREE.BufferGeometry[] = [];
    model.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        const geo = (obj.geometry as THREE.BufferGeometry).clone();
        geo.applyMatrix4(obj.matrixWorld);
        parts.push(geo);
      }
    });
    if (parts.length === 0) throw new Error(`model has no meshes: ${name}`);
    const merged = parts.length === 1 ? parts[0]! : mergeGeometries(parts);
    if (!merged) throw new Error(`geometry merge failed: ${name}`);
    return merged;
  }
}
