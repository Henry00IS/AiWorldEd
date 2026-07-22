import * as THREE from 'three';
import { UndoCommand } from './undo_command.js';
import {
  FaceTextureMapEntry,
  FaceTextureMapping,
  cloneFaceTextureMapEntry
} from '../texture/face_texture_mapping.js';
import {
  getFaceTextureMaps,
  setFaceTextureMaps
} from '../texture/face_texture_storage.js';
import {
  applyMappingToTargets,
  resetUvParamsOnTargets,
  TextureApplyTarget
} from '../texture/face_texture_applier.js';
import { rebakeStoredFaceTextureMaps } from '../texture/planar_uv_projector.js';
import { rebuildSurfaceMaterials } from '../texture/surface_material_builder.js';
import { createDefaultFaceTextureMapping } from '../texture/face_texture_mapping.js';

/**
 * Snapshot of one mesh's texture state for undo.
 */
interface MeshTextureSnapshot {
  mesh: THREE.Mesh;
  maps: FaceTextureMapEntry[];
  uvArray: Float32Array | null;
}

/**
 * Options for applying face texture / UV changes.
 */
export interface ApplyFaceTextureCommandOptions {
  /**
   * When true, resets UV params only and keeps each region's textureId.
   * The mapping argument is ignored for texture identity.
   */
  resetUvOnly?: boolean;
}

/**
 * Undoable command that applies a face texture mapping to mesh regions.
 */
export class ApplyFaceTextureCommand implements UndoCommand {
  private targets: TextureApplyTarget[];
  private mapping: FaceTextureMapping;
  private resetUvOnly: boolean;
  private beforeSnapshots: MeshTextureSnapshot[];
  private executed: boolean;

  /**
   * Creates a texture apply command.
   * @param targets Regions that will receive the mapping.
   * @param mapping Mapping parameters to apply (UV defaults when resetUvOnly).
   * @param options Optional apply behavior flags.
   */
  constructor(
    targets: TextureApplyTarget[],
    mapping: FaceTextureMapping = createDefaultFaceTextureMapping(),
    options: ApplyFaceTextureCommandOptions = {}
  ) {
    this.targets = targets;
    this.mapping = { ...mapping };
    this.resetUvOnly = options.resetUvOnly === true;
    this.beforeSnapshots = [];
    this.executed = false;
  }

  /**
   * Applies the mapping and bakes UVs, capturing prior state for undo.
   */
  execute(): void {
    if (this.executed) return;
    this.beforeSnapshots = this.captureSnapshots();
    if (this.resetUvOnly) {
      resetUvParamsOnTargets(this.targets);
    } else {
      applyMappingToTargets(this.targets, this.mapping);
    }
    this.executed = true;
  }

  /**
   * Restores prior UV attributes and face texture maps.
   */
  undo(): void {
    if (!this.executed) return;
    this.beforeSnapshots.forEach((snapshot) => {
      this.restoreSnapshot(snapshot);
    });
    this.executed = false;
  }

  /**
   * Captures unique meshes referenced by targets.
   * @returns Snapshots for undo.
   */
  private captureSnapshots(): MeshTextureSnapshot[] {
    const meshes = new Set<THREE.Mesh>();
    this.targets.forEach((target) => meshes.add(target.mesh));
    const snapshots: MeshTextureSnapshot[] = [];
    meshes.forEach((mesh) => {
      snapshots.push(this.snapshotMesh(mesh));
    });
    return snapshots;
  }

  /**
   * Snapshots maps and UV buffer for one mesh.
   * @param mesh Mesh to capture.
   * @returns Snapshot object.
   */
  private snapshotMesh(mesh: THREE.Mesh): MeshTextureSnapshot {
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
   * Restores a mesh snapshot and refreshes UV needsUpdate.
   * @param snapshot Prior state.
   */
  private restoreSnapshot(snapshot: MeshTextureSnapshot): void {
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
   * @param uvArray Saved interleaved UVs.
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
