import * as THREE from 'three';
import { UndoCommand } from '@/commands/command_undo.js';
import { FaceTextureMapEntry, cloneFaceTextureMapEntry } from '@/texture/uv/face_texture_mapping.js';
import { getFaceTextureMaps, setFaceTextureMaps } from '@/texture/uv/face_texture_storage.js';
import { syncMeshDocumentCornerUvsFromDisplayMesh } from '@/mesh/convert/mesh_document_face_texture_sync.js';
import { rebakeStoredFaceTextureMaps } from '@/texture/uv/planar_uv_projector.js';
import { rebuildSurfaceMaterials } from '@/texture/material/builder_surface_material.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import type { BrushUvSnapshot } from '@/solid/model/solid_model_presentation.js';

/** Snapshot of one mesh after or before an interactive UV transform. */
export interface UvTransformMeshSnapshot {
  /** Mesh that was edited. */
  mesh: THREE.Mesh;
  /** Face texture map table. */
  maps: FaceTextureMapEntry[];
  /** UV buffer copy, or null when missing. */
  uvArray: Float32Array | null;
  /** Solid brush UV state when the mesh is a solid result. */
  solidBrushUvs: BrushUvSnapshot[] | null;
}

/**
 * Undoable command for one interactive UV transform gesture. Live edits apply
 * during the drag; execute is a no-op until redo restores the after state.
 */
export class CommandTextureUvTransform implements UndoCommand {
  private beforeSnapshots: UvTransformMeshSnapshot[];
  private afterSnapshots: UvTransformMeshSnapshot[];
  private isLive: boolean;

  /**
   * Creates a UV transform command from before/after mesh snapshots.
   *
   * @param beforeSnapshots Mesh state before the gesture.
   * @param afterSnapshots Mesh state after the gesture.
   */
  constructor(beforeSnapshots: UvTransformMeshSnapshot[], afterSnapshots: UvTransformMeshSnapshot[]) {
    this.beforeSnapshots = beforeSnapshots;
    this.afterSnapshots = afterSnapshots;
    this.isLive = true;
  }

  /** Restores the post-gesture state (no-op immediately after a live gesture). */
  execute(): void {
    if (this.isLive) {
      this.isLive = false;
      return;
    }
    this.afterSnapshots.forEach((snapshot) => restoreUvTransformSnapshot(snapshot));
  }

  /** Restores pre-gesture maps, UVs, materials, and solid brush mappings. */
  undo(): void {
    this.isLive = false;
    this.beforeSnapshots.forEach((snapshot) => restoreUvTransformSnapshot(snapshot));
  }

  /**
   * Captures maps, UV buffer, and solid brush UV state for one mesh.
   *
   * @param mesh Mesh to snapshot.
   * @returns Snapshot object.
   */
  public static captureMesh(mesh: THREE.Mesh): UvTransformMeshSnapshot {
    const maps = getFaceTextureMaps(mesh).map((entry) => cloneFaceTextureMapEntry(entry));
    const uv = mesh.geometry.getAttribute('uv') as THREE.BufferAttribute | null;
    const uvArray = uv ? new Float32Array(uv.array as ArrayLike<number>) : null;
    return {
      mesh,
      maps,
      uvArray,
      solidBrushUvs: captureSolidBrushUvs(mesh),
    };
  }
}

/**
 * Captures solid brush UV snapshots when the mesh is a solid result.
 *
 * @param mesh Candidate mesh.
 * @returns Brush UV snapshots, or null.
 */
function captureSolidBrushUvs(mesh: THREE.Mesh): BrushUvSnapshot[] | null {
  if (!SolidModel.isResultMesh(mesh)) {
    return null;
  }
  const model = SolidModel.fromObject(mesh);
  if (!model) {
    return null;
  }
  return model.captureBrushUvSnapshots();
}

/**
 * Writes a snapshot back onto its mesh and owning solid brushes.
 *
 * @param snapshot Prior or post gesture state.
 */
export function restoreUvTransformSnapshot(snapshot: UvTransformMeshSnapshot): void {
  restoreSolidBrushUvs(snapshot);
  if (restoreSolidResultPresentation(snapshot)) return;
  restoreContentMeshSnapshot(snapshot);
}

/**
 * Rebuilds a solid result from restored brush faces, including volume textures.
 *
 * @param snapshot Snapshot that may include solid brush UV state.
 * @returns True when the result mesh was rebuilt from those brushes.
 */
function restoreSolidResultPresentation(snapshot: UvTransformMeshSnapshot): boolean {
  const model = solidModelForSnapshot(snapshot);
  if (!model || !snapshot.solidBrushUvs) return false;
  const brushIds = snapshot.solidBrushUvs.map((entry) => entry.brushId);
  if (!model.refreshBrushPresentations(brushIds)) return false;
  syncMeshDocumentCornerUvsFromDisplayMesh(snapshot.mesh);
  return true;
}

/**
 * Returns the solid model that owns a result-mesh snapshot.
 *
 * @param snapshot Mesh snapshot.
 * @returns Solid model, or null when the mesh is not a solid result.
 */
function solidModelForSnapshot(snapshot: UvTransformMeshSnapshot): SolidModel | null {
  if (!snapshot.solidBrushUvs) return null;
  return SolidModel.fromObject(snapshot.mesh);
}

/**
 * Writes saved maps, UVs, and materials onto a content mesh.
 *
 * @param snapshot Prior or post gesture state.
 */
function restoreContentMeshSnapshot(snapshot: UvTransformMeshSnapshot): void {
  setFaceTextureMaps(snapshot.mesh, snapshot.maps);
  restoreUvArrayOrRebake(snapshot);
  rebuildSurfaceMaterials(snapshot.mesh, undefined, undefined, {
    preserveTriangleOrder: true,
  });
  syncMeshDocumentCornerUvsFromDisplayMesh(snapshot.mesh);
}

/**
 * Restores solid brush face mappings when present on the snapshot.
 *
 * @param snapshot Snapshot that may include solid brush UV state.
 */
function restoreSolidBrushUvs(snapshot: UvTransformMeshSnapshot): void {
  if (!snapshot.solidBrushUvs) {
    return;
  }
  const model = SolidModel.fromObject(snapshot.mesh);
  if (!model) {
    return;
  }
  model.restoreBrushUvSnapshots(snapshot.solidBrushUvs);
}

/**
 * Restores a saved UV array or rebakes from stored maps.
 *
 * @param snapshot Mesh snapshot.
 */
function restoreUvArrayOrRebake(snapshot: UvTransformMeshSnapshot): void {
  if (!snapshot.uvArray) {
    rebakeStoredFaceTextureMaps(snapshot.mesh);
    return;
  }
  const uv = snapshot.mesh.geometry.getAttribute('uv') as THREE.BufferAttribute | null;
  if (uv && uv.array.length === snapshot.uvArray.length) {
    (uv.array as Float32Array).set(snapshot.uvArray);
    uv.needsUpdate = true;
    return;
  }
  snapshot.mesh.geometry.setAttribute('uv', new THREE.BufferAttribute(snapshot.uvArray.slice(), 2));
}
