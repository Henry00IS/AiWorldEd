import * as THREE from 'three';
import { rebakeStoredFaceTextureMaps } from './planar_uv_projector.js';

/**
 * Global setting for CSG-style texture lock during scale/bounds resize.
 * When locked, UVs are re-baked from world planar mappings so texture density
 * stays constant (new surface shows more tiles instead of stretching).
 */
export class TextureLockSettings {
  private locked: boolean;
  private changeCallbacks: Array<(locked: boolean) => void>;

  /**
   * Creates texture lock settings.
   * @param initiallyLocked Whether lock starts enabled (default true).
   */
  constructor(initiallyLocked: boolean = true) {
    this.locked = initiallyLocked;
    this.changeCallbacks = [];
  }

  /**
   * Returns whether texture lock is enabled.
   * @returns True when UVs should stay world-density locked.
   */
  isLocked(): boolean {
    return this.locked;
  }

  /**
   * Enables or disables texture lock.
   * @param locked Desired lock state.
   */
  setLocked(locked: boolean): void {
    if (this.locked === locked) return;
    this.locked = locked;
    this.changeCallbacks.forEach((callback) => callback(this.locked));
  }

  /**
   * Toggles texture lock and returns the new state.
   * @returns New locked state.
   */
  toggle(): boolean {
    this.setLocked(!this.locked);
    return this.locked;
  }

  /**
   * Registers a listener for lock state changes.
   * @param callback Invoked with the new locked flag.
   */
  onChanged(callback: (locked: boolean) => void): void {
    this.changeCallbacks.push(callback);
  }

  /**
   * Re-bakes world planar UVs on meshes when texture lock is enabled.
   * No-op when lock is off (UVs stretch with the mesh).
   * @param meshes Meshes whose transforms just changed.
   */
  rebakeMeshesIfLocked(meshes: THREE.Mesh[]): void {
    if (!this.locked) return;
    meshes.forEach((mesh) => {
      if (!mesh.geometry) return;
      rebakeStoredFaceTextureMaps(mesh);
    });
  }
}
