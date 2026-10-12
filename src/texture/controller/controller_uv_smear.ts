import * as THREE from 'three';
import { CommandStack } from '@/commands/command_stack.js';
import { SmearMeshSnapshot, CommandTextureUvStrokeSmear } from '@/texture/commands/command_texture_uv_stroke_smear.js';
import { expandFaceSelectionIndices } from '@/selection/face/solid_result_face_indices.js';
import {
  FaceTextureMapping,
  cloneFaceTextureMapping,
  createDefaultFaceTextureMapping,
} from '@/texture/uv/face_texture_mapping.js';
import { getFaceTextureMaps, upsertFaceTextureMap } from '@/texture/uv/face_texture_storage.js';
import { syncMeshDocumentCornerUvsFromDisplayMesh } from '@/mesh/convert/mesh_document_face_texture_sync.js';
import { bakeFaceUVs, ensureUniqueTriangleVertices } from '@/texture/uv/planar_uv_projector.js';
import { rebuildSurfaceMaterials } from '@/texture/material/builder_surface_material.js';
import { cloneSmearSourceMapping, transferUvMappingAcrossFaces } from '@/texture/uv/uv_smear_transfer.js';
import { getStateTexturePaint } from '@/texture/paint/state_texture_paint.js';
import { DEFAULT_CHECKER_TEXTURE_ID } from '@/texture/library/texture_id.js';
import { SolidModel, SOLID_TRIANGLE_SOURCES_USERDATA_KEY } from '@/solid/model/solid_model.js';
import { fitFaceMappingToCurrentUvs } from '@/texture/lock/content_mesh_texture_lock.js';

/** Source face seed for continuous UV smear. */
interface SmearSourceSeed {
  mesh: THREE.Mesh;
  triangleIndices: number[];
  mapping: FaceTextureMapping;
}

/**
 * Applies continuous UV layout from face to face while the user drags. Hold the
 * smear modifier (G) and paint across surfaces so textures match at shared
 * edges (arches, corridors, multi-face walls).
 */
export class ControllerUvSmear {
  private commandStack: CommandStack;
  private isStrokeActive: boolean;
  private sourceSeed: SmearSourceSeed | null;
  private lastRegionKey: string | null;
  private beforeByMeshId: Map<string, SmearMeshSnapshot>;
  private touchedMeshes: Set<THREE.Mesh>;

  /**
   * Creates a UV smear controller.
   *
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
   *
   * @returns True while the user is mid-stroke.
   */
  isActive(): boolean {
    return this.isStrokeActive;
  }

  /**
   * Begins a smear stroke (first face under the cursor).
   *
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
   *
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

  /** Ends the stroke and commits one undoable command when anything changed. */
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
      afterSnapshots.push(CommandTextureUvStrokeSmear.captureMesh(mesh));
    });
    this.resetStrokeState();
    if (beforeSnapshots.length === 0) return;
    this.commandStack.push(new CommandTextureUvStrokeSmear(beforeSnapshots, afterSnapshots));
  }

  /**
   * Cancels an in-progress stroke without committing undo history. Live changes
   * remain; caller may undo separately if needed.
   */
  cancelStroke(): void {
    this.isStrokeActive = false;
    this.resetStrokeState();
  }

  /**
   * Paints continuous UVs onto the selectable face unit containing faceIndex.
   * The first face only seeds the stroke (mapping is read, UVs are not
   * rewritten so rotated content meshes keep their existing layout). Later
   * faces receive transferred UVs. Solid results stay on one brush face so
   * carpet/detail brushes stay isolated.
   *
   * @param mesh Hit mesh.
   * @param faceIndex Seed triangle.
   */
  private paintFace(mesh: THREE.Mesh, faceIndex: number): void {
    ensureUniqueTriangleVertices(mesh);
    const triangleIndices = expandFaceSelectionIndices(mesh, faceIndex);
    if (triangleIndices.length === 0) return;
    const regionKey = buildRegionKey(mesh, triangleIndices);
    if (regionKey === this.lastRegionKey) return;
    if (!this.sourceSeed) {
      this.seedStrokeFromFace(mesh, triangleIndices, faceIndex, regionKey);
      return;
    }
    this.applySmearToDestinationFace(mesh, triangleIndices, faceIndex, regionKey);
  }

  /**
   * Captures the first face as the smear source without rebaking its UVs.
   * Rebaking would reproject the stored world UV matrix onto rotated meshes and
   * visibly jump the texture on the face the user started from.
   *
   * @param mesh Hit mesh.
   * @param triangleIndices Face region triangles.
   * @param faceIndex Seed triangle index.
   * @param regionKey Stable region key.
   */
  private seedStrokeFromFace(mesh: THREE.Mesh, triangleIndices: number[], faceIndex: number, regionKey: string): void {
    const stored = this.readOrCreateSeedMapping(mesh, triangleIndices, faceIndex);
    // Content meshes keep vertex UVs through rotation while authored UV matrices
    // can go stale. Fit a world matrix to the baked UVs so transfer continues
    // the texture the user actually sees (same outcome as solid brushes).
    const mapping = fitFaceMappingToCurrentUvs(mesh, triangleIndices, stored);
    this.sourceSeed = {
      mesh,
      triangleIndices: triangleIndices.slice(),
      mapping: cloneSmearSourceMapping(mapping),
    };
    this.lastRegionKey = regionKey;
  }

  /**
   * Transfers continuous UVs onto a destination face and marks the mesh dirty.
   *
   * @param mesh Destination mesh.
   * @param triangleIndices Destination region triangles.
   * @param faceIndex Seed triangle index.
   * @param regionKey Stable region key.
   */
  private applySmearToDestinationFace(
    mesh: THREE.Mesh,
    triangleIndices: number[],
    faceIndex: number,
    regionKey: string,
  ): void {
    this.captureBeforeIfNeeded(mesh);
    const mapping = this.resolveMappingForRegion(mesh, triangleIndices, faceIndex);
    upsertFaceTextureMap(mesh, triangleIndices, mapping);
    bakeFaceUVs(mesh, triangleIndices, mapping);
    rebuildSurfaceMaterials(mesh, undefined, undefined, {
      preserveTriangleOrder: true,
    });
    syncMeshDocumentCornerUvsFromDisplayMesh(mesh);
    this.syncSolidBrushMappings(mesh, triangleIndices, mapping);
    this.touchedMeshes.add(mesh);
    this.sourceSeed = {
      mesh,
      triangleIndices: triangleIndices.slice(),
      mapping: cloneSmearSourceMapping(mapping),
    };
    this.lastRegionKey = regionKey;
  }

  /**
   * Builds the mapping for a region: seed from existing maps, or transfer.
   *
   * @param mesh Destination mesh.
   * @param triangleIndices Destination region.
   * @param seedFaceIndex Original hit triangle (for partial map lookup).
   * @returns Mapping to apply.
   */
  private resolveMappingForRegion(
    mesh: THREE.Mesh,
    triangleIndices: number[],
    seedFaceIndex: number,
  ): FaceTextureMapping {
    if (!this.sourceSeed) {
      return this.readOrCreateSeedMapping(mesh, triangleIndices, seedFaceIndex);
    }
    if (this.sourceSeed.mesh === mesh && regionKeysEqual(this.sourceSeed.triangleIndices, triangleIndices)) {
      return cloneFaceTextureMapping(this.sourceSeed.mapping);
    }
    return transferUvMappingAcrossFaces(
      this.sourceSeed.mesh,
      this.sourceSeed.triangleIndices,
      this.sourceSeed.mapping,
      mesh,
      triangleIndices,
    );
  }

  /**
   * Reads an existing face map for the region, or a covering entry / solid
   * source. Avoids falling back to default 1m scale which visually shrinks VMF
   * textures.
   *
   * @param mesh Mesh owner.
   * @param triangleIndices Region triangles.
   * @param seedFaceIndex Hit triangle index.
   * @returns Mapping seed.
   */
  private readOrCreateSeedMapping(
    mesh: THREE.Mesh,
    triangleIndices: number[],
    seedFaceIndex: number,
  ): FaceTextureMapping {
    const existing = findBestRegionMapping(mesh, triangleIndices, seedFaceIndex);
    if (existing) return existing;
    const solidMapping = readSolidBrushMapping(mesh, seedFaceIndex);
    if (solidMapping) return solidMapping;
    const paintId = getStateTexturePaint().getLastTextureId() || DEFAULT_CHECKER_TEXTURE_ID;
    return createDefaultFaceTextureMapping(paintId);
  }

  /**
   * Writes only the painted result-mesh region onto its solid brush face so CSG
   * rebuilds keep smear phase and scale without touching neighbor brushes.
   *
   * @param mesh Mesh that may be a solid model result.
   * @param triangleIndices Painted triangle region.
   * @param mapping Mapping applied to that region.
   */
  private syncSolidBrushMappings(mesh: THREE.Mesh, triangleIndices: number[], mapping: FaceTextureMapping): void {
    if (!SolidModel.isResultMesh(mesh)) return;
    const model = SolidModel.fromObject(mesh);
    if (!model) return;
    model.syncAuthoredMappingForTriangles(triangleIndices, mapping);
  }

  /**
   * Stores a before-snapshot the first time a mesh is modified in this stroke.
   *
   * @param mesh Mesh about to be edited.
   */
  private captureBeforeIfNeeded(mesh: THREE.Mesh): void {
    if (this.beforeByMeshId.has(mesh.uuid)) return;
    this.beforeByMeshId.set(mesh.uuid, CommandTextureUvStrokeSmear.captureMesh(mesh));
  }

  /** Clears stroke bookkeeping without touching the scene. */
  private resetStrokeState(): void {
    this.sourceSeed = null;
    this.lastRegionKey = null;
    this.beforeByMeshId.clear();
    this.touchedMeshes.clear();
  }
}

/**
 * Builds a stable key for a mesh region.
 *
 * @param mesh Mesh owner.
 * @param triangleIndices Sorted-capable triangle list.
 * @returns Key string.
 */
function buildRegionKey(mesh: THREE.Mesh, triangleIndices: number[]): string {
  const sorted = triangleIndices
    .slice()
    .sort((a, b) => a - b)
    .join(',');
  return `${mesh.uuid}:${sorted}`;
}

/**
 * Compares two triangle index lists as sets.
 *
 * @param a First list.
 * @param b Second list.
 * @returns True when equal as sets.
 */
function regionKeysEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const sa = a
    .slice()
    .sort((x, y) => x - y)
    .join(',');
  const sb = b
    .slice()
    .sort((x, y) => x - y)
    .join(',');
  return sa === sb;
}

/**
 * Finds the best stored mapping for a smear seed region. Prefers exact
 * triangle-set match, then any entry covering the seed triangle, then any entry
 * overlapping the region.
 *
 * @param mesh Mesh owner.
 * @param triangleIndices Region triangles.
 * @param seedFaceIndex Hit triangle index.
 * @returns Mapping clone or null.
 */
function findBestRegionMapping(
  mesh: THREE.Mesh,
  triangleIndices: number[],
  seedFaceIndex: number,
): FaceTextureMapping | null {
  const key = triangleIndices
    .slice()
    .sort((a, b) => a - b)
    .join(',');
  const entries = getFaceTextureMaps(mesh);
  let coveringSeed: FaceTextureMapping | null = null;
  let overlapping: FaceTextureMapping | null = null;
  const regionSet = new Set(triangleIndices);
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    const entryKey = entry.triangleIndices
      .slice()
      .sort((a, b) => a - b)
      .join(',');
    if (entryKey === key) {
      return cloneFaceTextureMapping(entry.mapping);
    }
    if (entry.triangleIndices.includes(seedFaceIndex) && !coveringSeed) {
      coveringSeed = cloneFaceTextureMapping(entry.mapping);
    }
    if (!overlapping && entry.triangleIndices.some((index) => regionSet.has(index))) {
      overlapping = cloneFaceTextureMapping(entry.mapping);
    }
  }
  return coveringSeed ?? overlapping;
}

/**
 * Reads the authored solid-brush face mapping for a result-mesh triangle.
 *
 * @param mesh Candidate solid result mesh.
 * @param triangleIndex Result triangle index.
 * @returns Brush face mapping or null.
 */
function readSolidBrushMapping(mesh: THREE.Mesh, triangleIndex: number): FaceTextureMapping | null {
  if (!SolidModel.isResultMesh(mesh)) return null;
  const model = SolidModel.fromObject(mesh);
  if (!model) return null;
  const sources = mesh.userData[SOLID_TRIANGLE_SOURCES_USERDATA_KEY] as
    Array<{ brushId: string; surfaceIndex: number }> | undefined;
  const source = sources?.[triangleIndex];
  if (!source?.brushId) return null;
  const brush = model.findBrush(source.brushId);
  if (!brush) return null;
  return brush.getSurfaceMapping(source.surfaceIndex);
}
