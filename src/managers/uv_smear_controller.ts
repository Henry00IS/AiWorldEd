import * as THREE from 'three';
import { CommandStack } from '../commands/command_stack.js';
import {
  SmearMeshSnapshot,
  SmearUvStrokeCommand
} from '../commands/smear_uv_stroke_command.js';
import { findCoplanarFaceIndices } from '../selection/triangle_geometry_utils.js';
import {
  FaceTextureMapping,
  cloneFaceTextureMapping,
  createDefaultFaceTextureMapping
} from '../texture/face_texture_mapping.js';
import {
  getFaceTextureMaps,
  upsertFaceTextureMap
} from '../texture/face_texture_storage.js';
import {
  bakeFaceUVs,
  ensureUniqueTriangleVertices
} from '../texture/planar_uv_projector.js';
import { rebuildSurfaceMaterials } from '../texture/surface_material_builder.js';
import {
  cloneSmearSourceMapping,
  transferUvMappingAcrossFaces
} from '../texture/uv_smear_transfer.js';
import { getTexturePaintState } from '../texture/texture_paint_state.js';
import { DEFAULT_CHECKER_TEXTURE_ID } from '../texture/texture_id.js';

/**
 * Source face seed for continuous UV smear.
 */
interface SmearSourceSeed {
  mesh: THREE.Mesh;
  triangleIndices: number[];
  mapping: FaceTextureMapping;
}

/**
 * Applies continuous UV layout from face to face while the user drags.
 * Hold the smear modifier (G) and paint across surfaces so textures match
 * at shared edges (arches, corridors, multi-face walls).
 */
export class UvSmearController {
  private commandStack: CommandStack;
  private isStrokeActive: boolean;
  private sourceSeed: SmearSourceSeed | null;
  private lastRegionKey: string | null;
  private beforeByMeshId: Map<string, SmearMeshSnapshot>;
  private touchedMeshes: Set<THREE.Mesh>;

  /**
   * Creates a UV smear controller.
   * @param commandStack Undo stack for completed strokes.
   */
  constructor(commandStack: CommandStack) {
    this.commandStack = commandStack;
    this.isStrokeActive = false;
    this.sourceSeed = null;
    this.lastRegionKey = null;
    this.beforeByMeshId = new Map();
    this.touchedMeshes = new Set();
  }

  /**
   * Returns whether a smear stroke is currently in progress.
   * @returns True while the user is mid-stroke.
   */
  isActive(): boolean {
    return this.isStrokeActive;
  }

  /**
   * Begins a smear stroke (first face under the cursor).
   * @param mesh Hit mesh.
   * @param faceIndex Hit triangle index.
   */
  beginStroke(mesh: THREE.Mesh, faceIndex: number): void {
    this.isStrokeActive = true;
    this.sourceSeed = null;
    this.lastRegionKey = null;
    this.beforeByMeshId.clear();
    this.touchedMeshes.clear();
    this.paintFace(mesh, faceIndex);
  }

  /**
   * Continues a smear stroke onto another face under the cursor.
   * @param mesh Hit mesh.
   * @param faceIndex Hit triangle index.
   */
  continueStroke(mesh: THREE.Mesh, faceIndex: number): void {
    if (!this.isStrokeActive) {
      this.beginStroke(mesh, faceIndex);
      return;
    }
    this.paintFace(mesh, faceIndex);
  }

  /**
   * Ends the stroke and commits one undoable command when anything changed.
   */
  endStroke(): void {
    if (!this.isStrokeActive) return;
    this.isStrokeActive = false;
    if (this.touchedMeshes.size === 0) {
      this.resetStrokeState();
      return;
    }
    const beforeSnapshots: SmearMeshSnapshot[] = [];
    const afterSnapshots: SmearMeshSnapshot[] = [];
    this.touchedMeshes.forEach((mesh) => {
      const before = this.beforeByMeshId.get(mesh.uuid);
      if (!before) return;
      beforeSnapshots.push(before);
      afterSnapshots.push(SmearUvStrokeCommand.captureMesh(mesh));
    });
    this.resetStrokeState();
    if (beforeSnapshots.length === 0) return;
    this.commandStack.push(
      new SmearUvStrokeCommand(beforeSnapshots, afterSnapshots)
    );
  }

  /**
   * Cancels an in-progress stroke without committing undo history.
   * Live changes remain; caller may undo separately if needed.
   */
  cancelStroke(): void {
    this.isStrokeActive = false;
    this.resetStrokeState();
  }

  /**
   * Paints continuous UVs onto the coplanar region containing faceIndex.
   * @param mesh Hit mesh.
   * @param faceIndex Seed triangle.
   */
  private paintFace(mesh: THREE.Mesh, faceIndex: number): void {
    ensureUniqueTriangleVertices(mesh);
    const triangleIndices = findCoplanarFaceIndices(mesh.geometry, faceIndex);
    if (triangleIndices.length === 0) return;
    const regionKey = buildRegionKey(mesh, triangleIndices);
    if (regionKey === this.lastRegionKey) return;
    this.captureBeforeIfNeeded(mesh);
    const mapping = this.resolveMappingForRegion(mesh, triangleIndices);
    upsertFaceTextureMap(mesh, triangleIndices, mapping);
    bakeFaceUVs(mesh, triangleIndices, mapping);
    rebuildSurfaceMaterials(mesh);
    this.touchedMeshes.add(mesh);
    this.sourceSeed = {
      mesh,
      triangleIndices: triangleIndices.slice(),
      mapping: cloneSmearSourceMapping(mapping)
    };
    this.lastRegionKey = regionKey;
  }

  /**
   * Builds the mapping for a region: seed from existing maps, or transfer.
   * @param mesh Destination mesh.
   * @param triangleIndices Destination region.
   * @returns Mapping to apply.
   */
  private resolveMappingForRegion(
    mesh: THREE.Mesh,
    triangleIndices: number[]
  ): FaceTextureMapping {
    if (!this.sourceSeed) {
      return this.readOrCreateSeedMapping(mesh, triangleIndices);
    }
    if (
      this.sourceSeed.mesh === mesh &&
      regionKeysEqual(this.sourceSeed.triangleIndices, triangleIndices)
    ) {
      return cloneFaceTextureMapping(this.sourceSeed.mapping);
    }
    return transferUvMappingAcrossFaces(
      this.sourceSeed.mesh,
      this.sourceSeed.triangleIndices,
      this.sourceSeed.mapping,
      mesh,
      triangleIndices
    );
  }

  /**
   * Reads an existing face map for the region, or builds a default paint seed.
   * @param mesh Mesh owner.
   * @param triangleIndices Region triangles.
   * @returns Mapping seed.
   */
  private readOrCreateSeedMapping(
    mesh: THREE.Mesh,
    triangleIndices: number[]
  ): FaceTextureMapping {
    const existing = findExactRegionMapping(mesh, triangleIndices);
    if (existing) return existing;
    const paintId =
      getTexturePaintState().getLastTextureId() || DEFAULT_CHECKER_TEXTURE_ID;
    return createDefaultFaceTextureMapping(paintId);
  }

  /**
   * Stores a before-snapshot the first time a mesh is modified in this stroke.
   * @param mesh Mesh about to be edited.
   */
  private captureBeforeIfNeeded(mesh: THREE.Mesh): void {
    if (this.beforeByMeshId.has(mesh.uuid)) return;
    this.beforeByMeshId.set(mesh.uuid, SmearUvStrokeCommand.captureMesh(mesh));
  }

  /**
   * Clears stroke bookkeeping without touching the scene.
   */
  private resetStrokeState(): void {
    this.sourceSeed = null;
    this.lastRegionKey = null;
    this.beforeByMeshId.clear();
    this.touchedMeshes.clear();
  }
}

/**
 * Builds a stable key for a mesh region.
 * @param mesh Mesh owner.
 * @param triangleIndices Sorted-capable triangle list.
 * @returns Key string.
 */
function buildRegionKey(mesh: THREE.Mesh, triangleIndices: number[]): string {
  const sorted = triangleIndices.slice().sort((a, b) => a - b).join(',');
  return `${mesh.uuid}:${sorted}`;
}

/**
 * Compares two triangle index lists as sets.
 * @param a First list.
 * @param b Second list.
 * @returns True when equal as sets.
 */
function regionKeysEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const sa = a.slice().sort((x, y) => x - y).join(',');
  const sb = b.slice().sort((x, y) => x - y).join(',');
  return sa === sb;
}

/**
 * Finds a stored mapping whose triangle set exactly matches the region.
 * @param mesh Mesh owner.
 * @param triangleIndices Region triangles.
 * @returns Mapping clone or null.
 */
function findExactRegionMapping(
  mesh: THREE.Mesh,
  triangleIndices: number[]
): FaceTextureMapping | null {
  const key = triangleIndices.slice().sort((a, b) => a - b).join(',');
  const entries = getFaceTextureMaps(mesh);
  for (let i = 0; i < entries.length; i++) {
    const entryKey = entries[i].triangleIndices
      .slice()
      .sort((a, b) => a - b)
      .join(',');
    if (entryKey === key) {
      return cloneFaceTextureMapping(entries[i].mapping);
    }
  }
  return null;
}
