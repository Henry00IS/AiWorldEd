import * as THREE from 'three';
import { UndoCommand } from '@/commands/command_undo.js';
import { FaceTextureMapEntry, cloneFaceTextureMapEntry } from '@/texture/uv/face_texture_mapping.js';
import { getFaceTextureMaps, setFaceTextureMaps } from '@/texture/uv/face_texture_storage.js';
import { TextureApplyTarget, applyTextureIdToTargets } from '@/texture/uv/face_texture_applier.js';
import { rebuildSurfaceMaterials } from '@/texture/material/builder_surface_material.js';
import { rebakeStoredFaceTextureMaps } from '@/texture/uv/planar_uv_projector.js';
import { readContentMeshTextureId, writeContentMeshTextureId } from '@/texture/uv/content_mesh_texture.js';
import { isResultMesh } from '@/solid/model/solid_model_keys.js';

/** Snapshot of one mesh surface state for undo. */
interface MeshSurfaceSnapshot {
  mesh: THREE.Mesh;
  maps: FaceTextureMapEntry[];
  uvArray: Float32Array | null;
  contentTextureId: string | null;
}

/**
 * Undoable command that assigns a texture id to selected face regions.
 * Preserves each region's UV projection parameters.
 */
export class CommandTextureSurfaceAssign implements UndoCommand {
  private targets: TextureApplyTarget[];
  private textureId: string;
  private beforeSnapshots: MeshSurfaceSnapshot[];
  private executed: boolean;

  /**
   * Creates an assign-surface-texture command.
   *
   * @param targets Regions that receive the texture id.
   * @param textureId Stable texture identity to apply.
   */
  constructor(targets: TextureApplyTarget[], textureId: string) {
    this.targets = targets;
    this.textureId = textureId;
    this.beforeSnapshots = [];
    this.executed = false;
  }

  /** Applies the texture id and rebuilds surface materials. */
  execute(): void {
    if (this.executed) return;
    this.beforeSnapshots = this.captureSnapshots();
    applyTextureIdToTargets(this.targets, this.textureId);
    this.executed = true;
  }

  /** Restores prior face maps, UVs, and materials. */
  undo(): void {
    if (!this.executed) return;
    this.beforeSnapshots.forEach((snapshot) => {
      this.restoreSnapshot(snapshot);
    });
    this.executed = false;
  }

  /**
   * Captures unique meshes referenced by targets.
   *
   * @returns Snapshots for undo.
   */
  private captureSnapshots(): MeshSurfaceSnapshot[] {
    const meshes = new Set<THREE.Mesh>();
    this.targets.forEach((target) => meshes.add(target.mesh));
    const snapshots: MeshSurfaceSnapshot[] = [];
    meshes.forEach((mesh) => {
      snapshots.push(this.snapshotMesh(mesh));
    });
    return snapshots;
  }

  /**
   * Snapshots maps and UV buffer for one mesh.
   *
   * @param mesh Mesh to capture.
   * @returns Snapshot object.
   */
  private snapshotMesh(mesh: THREE.Mesh): MeshSurfaceSnapshot {
    if (this.isFreeContentMesh(mesh)) {
      return {
        mesh,
        maps: [],
        uvArray: null,
        contentTextureId: readContentMeshTextureId(mesh),
      };
    }
    const maps = getFaceTextureMaps(mesh).map((entry) => cloneFaceTextureMapEntry(entry));
    const uv = mesh.geometry.getAttribute('uv') as THREE.BufferAttribute | null;
    const uvArray = uv ? new Float32Array(uv.array as ArrayLike<number>) : null;
    return { mesh, maps, uvArray, contentTextureId: null };
  }

  /**
   * Restores a mesh snapshot and rebuilds materials.
   *
   * @param snapshot Prior state.
   */
  private restoreSnapshot(snapshot: MeshSurfaceSnapshot): void {
    if (snapshot.contentTextureId !== null) {
      writeContentMeshTextureId(snapshot.mesh, snapshot.contentTextureId);
      rebuildSurfaceMaterials(snapshot.mesh);
      return;
    }
    setFaceTextureMaps(snapshot.mesh, snapshot.maps);
    if (snapshot.uvArray) {
      this.restoreUvArray(snapshot.mesh, snapshot.uvArray);
    } else {
      rebakeStoredFaceTextureMaps(snapshot.mesh);
    }
    rebuildSurfaceMaterials(snapshot.mesh);
  }

  /**
   * Returns whether the mesh is free content (single texture, not solid
   * result).
   *
   * @param mesh Candidate mesh.
   * @returns True for ordinary content meshes.
   */
  private isFreeContentMesh(mesh: THREE.Mesh): boolean {
    return !isResultMesh(mesh);
  }

  /**
   * Writes a saved UV array back onto geometry.
   *
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
    mesh.geometry.setAttribute('uv', new THREE.BufferAttribute(uvArray.slice(), 2));
  }
}
