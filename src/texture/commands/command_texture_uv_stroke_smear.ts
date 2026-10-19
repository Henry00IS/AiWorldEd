import * as THREE from 'three';
import { UndoCommand } from '@/commands/command_undo.js';
import {
  FaceTextureMapEntry,
  FaceTextureMapping,
  cloneFaceTextureMapEntry,
} from '@/texture/uv/face_texture_mapping.js';
import { getFaceTextureMaps } from '@/texture/uv/face_texture_storage.js';
import { restoreUvTransformSnapshot } from '@/texture/interactive/commands/command_texture_uv_transform.js';
import { SolidModel } from '@/solid/model/solid_model.js';

/** Snapshot of one solid brush's authored UV mappings for smear undo. */
export interface SmearSolidBrushUvSnapshot {
  brushId: string;
  defaultMapping: FaceTextureMapping;
  faceMappings: (FaceTextureMapping | undefined)[];
}

/** Snapshot of one mesh surface state for smear stroke undo. */
export interface SmearMeshSnapshot {
  mesh: THREE.Mesh;
  maps: FaceTextureMapEntry[];
  uvArray: Float32Array | null;
  /**
   * Present when mesh is a solid model result; restores brush faces on
   * undo/redo.
   */
  solidBrushUvs: SmearSolidBrushUvSnapshot[] | null;
}

/**
 * Undoable command for one continuous UV-smear drag stroke. The stroke is
 * applied live during the drag; execute restores the post-stroke state (redo),
 * undo restores the pre-stroke snapshots including solid brushes.
 */
export class CommandTextureUvStrokeSmear implements UndoCommand {
  private beforeSnapshots: SmearMeshSnapshot[];
  private afterSnapshots: SmearMeshSnapshot[];
  private isLive: boolean;

  /**
   * Creates a smear stroke command from before/after mesh snapshots.
   *
   * @param beforeSnapshots Mesh state before the stroke began.
   * @param afterSnapshots Mesh state after the stroke finished.
   */
  constructor(beforeSnapshots: SmearMeshSnapshot[], afterSnapshots: SmearMeshSnapshot[]) {
    this.beforeSnapshots = beforeSnapshots;
    this.afterSnapshots = afterSnapshots;
    this.isLive = true;
  }

  /** Restores the post-stroke surface state (no-op right after a live stroke). */
  execute(): void {
    if (this.isLive) {
      this.isLive = false;
      return;
    }
    this.afterSnapshots.forEach((snapshot) => this.restoreSnapshot(snapshot));
  }

  /** Restores pre-stroke maps, UVs, materials, and solid brush face mappings. */
  undo(): void {
    this.isLive = false;
    this.beforeSnapshots.forEach((snapshot) => this.restoreSnapshot(snapshot));
  }

  /**
   * Captures maps, UV buffer, and solid brush UV state for one mesh.
   *
   * @param mesh Mesh to snapshot.
   * @returns Snapshot object.
   */
  public static captureMesh(mesh: THREE.Mesh): SmearMeshSnapshot {
    const maps = getFaceTextureMaps(mesh).map((entry) => cloneFaceTextureMapEntry(entry));
    const uv = mesh.geometry.getAttribute('uv') as THREE.BufferAttribute | null;
    const uvArray = uv ? new Float32Array(uv.array as ArrayLike<number>) : null;
    return {
      mesh,
      maps,
      uvArray,
      solidBrushUvs: this.captureSolidBrushUvs(mesh),
    };
  }

  /**
   * Captures all brush face mappings when the mesh is a solid result.
   *
   * @param mesh Candidate mesh.
   * @returns Brush UV snapshots, or null when not a solid result.
   */
  private static captureSolidBrushUvs(mesh: THREE.Mesh): SmearSolidBrushUvSnapshot[] | null {
    if (!SolidModel.isResultMesh(mesh)) return null;
    const model = SolidModel.fromObject(mesh);
    if (!model) return null;
    return model.captureBrushUvSnapshots();
  }

  /**
   * Writes a snapshot back onto its mesh and owning solid brushes.
   *
   * @param snapshot Prior or post stroke state.
   */
  private restoreSnapshot(snapshot: SmearMeshSnapshot): void {
    restoreUvTransformSnapshot(snapshot);
  }
}
