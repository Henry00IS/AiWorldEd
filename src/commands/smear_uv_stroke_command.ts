import * as THREE from 'three';
import { UndoCommand } from './undo_command.js';
import {
  FaceTextureMapEntry,
  cloneFaceTextureMapEntry
} from '../texture/face_texture_mapping.js';
import {
  getFaceTextureMaps,
  setFaceTextureMaps
} from '../texture/face_texture_storage.js';
import { rebakeStoredFaceTextureMaps } from '../texture/planar_uv_projector.js';
import { rebuildSurfaceMaterials } from '../texture/surface_material_builder.js';

/**
 * Snapshot of one mesh surface state for smear stroke undo.
 */
export interface SmearMeshSnapshot {
  mesh: THREE.Mesh;
  maps: FaceTextureMapEntry[];
  uvArray: Float32Array | null;
}

/**
 * Undoable command for one continuous UV-smear drag stroke.
 * The stroke is applied live during the drag; execute restores the post-stroke
 * state (redo), undo restores the pre-stroke snapshots.
 */
export class SmearUvStrokeCommand implements UndoCommand {
  private beforeSnapshots: SmearMeshSnapshot[];
  private afterSnapshots: SmearMeshSnapshot[];
  private isLive: boolean;

  /**
   * Creates a smear stroke command from before/after mesh snapshots.
   * @param beforeSnapshots Mesh state before the stroke began.
   * @param afterSnapshots Mesh state after the stroke finished.
   */
  constructor(
    beforeSnapshots: SmearMeshSnapshot[],
    afterSnapshots: SmearMeshSnapshot[]
  ) {
    this.beforeSnapshots = beforeSnapshots;
    this.afterSnapshots = afterSnapshots;
    this.isLive = true;
  }

  /**
   * Restores the post-stroke surface state (no-op right after a live stroke).
   */
  execute(): void {
    if (this.isLive) {
      this.isLive = false;
      return;
    }
    this.afterSnapshots.forEach((snapshot) => this.restoreSnapshot(snapshot));
  }

  /**
   * Restores pre-stroke maps, UVs, and materials.
   */
  undo(): void {
    this.isLive = false;
    this.beforeSnapshots.forEach((snapshot) => this.restoreSnapshot(snapshot));
  }

  /**
   * Captures maps and UV buffer for one mesh.
   * @param mesh Mesh to snapshot.
   * @returns Snapshot object.
   */
  public static captureMesh(mesh: THREE.Mesh): SmearMeshSnapshot {
    const maps = getFaceTextureMaps(mesh).map((entry) =>
      cloneFaceTextureMapEntry(entry)
    );
    const uv = mesh.geometry.getAttribute('uv') as THREE.BufferAttribute | null;
    const uvArray = uv
      ? new Float32Array(uv.array as ArrayLike<number>)
      : null;
    return { mesh, maps, uvArray };
  }

  /**
   * Writes a snapshot back onto its mesh.
   * @param snapshot Prior or post stroke state.
   */
  private restoreSnapshot(snapshot: SmearMeshSnapshot): void {
    setFaceTextureMaps(snapshot.mesh, snapshot.maps);
    if (snapshot.uvArray) {
      this.restoreUvArray(snapshot.mesh, snapshot.uvArray);
    } else {
      rebakeStoredFaceTextureMaps(snapshot.mesh);
    }
    rebuildSurfaceMaterials(snapshot.mesh);
  }

  /**
   * Writes a saved UV array back onto geometry.
   * @param mesh Target mesh.
   * @param uvArray Saved UV floats.
   */
  private restoreUvArray(mesh: THREE.Mesh, uvArray: Float32Array): void {
    const uv = mesh.geometry.getAttribute('uv') as THREE.BufferAttribute | null;
    if (uv && uv.array.length === uvArray.length) {
      (uv.array as Float32Array).set(uvArray);
      uv.needsUpdate = true;
      return;
    }
    mesh.geometry.setAttribute(
      'uv',
      new THREE.BufferAttribute(uvArray.slice(), 2)
    );
  }
}
