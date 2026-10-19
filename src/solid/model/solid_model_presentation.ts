import * as THREE from 'three';
import type { SolidBrushInstance } from './solid_brush_instance.js';
import type { SolidSurfaceRegion } from '@/solid/algorithm/surface/surface_triangulator.js';
import {
  FaceTextureMapping,
  createDefaultFaceTextureMapping,
  withTrsAccessors,
} from '@/texture/uv/face_texture_mapping.js';
import { setFaceTextureMapsShared } from '@/texture/uv/face_texture_storage.js';
import { rebuildSolidResultMaterials } from '@/texture/material/builder_surface_material.js';
import { createContentMaterial } from '@/materials/factory_content_material.js';
import { ModifierBevelSurfaceOverlay } from '@/modifier/compile/modifier_bevel_surface_overlay.js';
import { DEFAULT_CHECKER_TEXTURE_ID } from '@/texture/library/texture_id.js';
import { Theme } from '@/theme.js';
import { SOLID_MODEL_RESULT_USERDATA_KEY } from './solid_model_keys.js';
import {
  composeBrushWorldFromLocal,
  convertBrushLocalFaceMappingToWorldWithMatrix,
} from '@/solid/brush/solid_brush_uv_space.js';

/** Snapshot of one brush UV/default and per-face mappings. */
export type BrushUvSnapshot = {
  brushId: string;
  defaultMapping: FaceTextureMapping;
  faceMappings: (FaceTextureMapping | undefined)[];
};

/**
 * Presentation helpers for solid result meshes: materials, UV snapshots, and
 * result mesh creation. Public SolidModel methods remain the facade.
 */
export class SolidModelPresentation {
  /**
   * Creates the empty result mesh that receives compiled solid geometry.
   *
   * @returns Result mesh child.
   */
  createResultMesh(): THREE.Mesh {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(0), 3));
    const material = createContentMaterial(Theme.boxColor);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'Result';
    mesh.userData[SOLID_MODEL_RESULT_USERDATA_KEY] = true;
    return mesh;
  }

  /**
   * Writes face maps and materials onto the result mesh. UVs are already baked
   * into brush mesh chunks; this never reprojects them. Face maps store
   * world-space UV matrices for the UV editor.
   *
   * @param resultMesh Compiled result mesh.
   * @param surfaceRegions Last assembled surface regions.
   * @param findBrush Lookup for authored face mappings.
   * @param _forceMaterials Reserved; solid results always preserve order.
   */
  applySurfaceLayoutToResult(
    resultMesh: THREE.Mesh,
    surfaceRegions: readonly SolidSurfaceRegion[],
    findBrush: (id: string) => SolidBrushInstance | undefined,
    _forceMaterials: boolean,
  ): void {
    void _forceMaterials;
    const solidRoot = resultMesh.parent ?? resultMesh;
    const invWorldByBrush = this.buildInvWorldFromLocalCache(surfaceRegions, findBrush, solidRoot);
    const textureRegions = this.buildTextureRegions(surfaceRegions, findBrush, invWorldByBrush);
    this.writeSharedFaceMaps(resultMesh, textureRegions);
    this.writeSolidResultMaterials(resultMesh, textureRegions);
  }

  /**
   * Captures default and per-face UV mappings for every brush (smear
   * undo/redo).
   *
   * @param brushes Brushes to snapshot.
   * @returns Snapshot list keyed by brush id.
   */
  captureBrushUvSnapshots(brushes: readonly SolidBrushInstance[]): BrushUvSnapshot[] {
    return brushes.map((brush) => ({
      brushId: brush.id,
      defaultMapping: brush.serializeDefaultMapping(),
      faceMappings: brush.serializeFaceMappings(),
    }));
  }

  /**
   * Restores brush UV mappings from a smear undo/redo snapshot.
   *
   * @param snapshots Brush UV snapshots previously captured.
   * @param findBrush Lookup for brushes by id.
   */
  restoreBrushUvSnapshots(
    snapshots: readonly BrushUvSnapshot[],
    findBrush: (id: string) => SolidBrushInstance | undefined,
  ): void {
    for (const snapshot of snapshots) {
      const brush = findBrush(snapshot.brushId);
      if (!brush) continue;
      brush.restoreFaceMappings(snapshot.defaultMapping, snapshot.faceMappings);
    }
  }

  /**
   * Filters brush ids to those that successfully updated polygon textures.
   *
   * @param brushIds Candidate brush ids.
   * @param updatePolygonTextures Callback that updates one brush polygon cache.
   * @returns Brush ids that remeshed from cache.
   */
  collectRemeshedBrushIds(brushIds: readonly string[], updatePolygonTextures: (brushId: string) => boolean): string[] {
    const uniqueIds = Array.from(new Set(brushIds));
    const remeshed: string[] = [];
    for (const brushId of uniqueIds) {
      if (updatePolygonTextures(brushId)) remeshed.push(brushId);
    }
    return remeshed;
  }

  /**
   * Builds inv(rootWorld * brushLocal) once per brush for the surface layout
   * pass so local→world conversion does not refresh world matrices per face.
   *
   * @param surfaceRegions Assembled surface regions.
   * @param findBrush Brush lookup.
   * @param solidRoot Solid model root.
   * @returns Map of brush id → inv world-from-local.
   */
  private buildInvWorldFromLocalCache(
    surfaceRegions: readonly SolidSurfaceRegion[],
    findBrush: (id: string) => SolidBrushInstance | undefined,
    solidRoot: THREE.Object3D,
  ): Map<string, THREE.Matrix4> {
    solidRoot.updateMatrixWorld(true);
    const cache = new Map<string, THREE.Matrix4>();
    const worldFromLocal = new THREE.Matrix4();
    for (const region of surfaceRegions) {
      if (cache.has(region.brushId)) continue;
      const brush = findBrush(region.brushId);
      if (!brush) continue;
      composeBrushWorldFromLocal(brush, solidRoot, worldFromLocal, false);
      cache.set(region.brushId, worldFromLocal.clone().invert());
    }
    return cache;
  }

  /**
   * Builds texture region descriptors used for materials and face maps.
   *
   * @param surfaceRegions Last assembled surface regions.
   * @param findBrush Lookup for authored face mappings.
   * @param invWorldByBrush Per-brush inv(root*brushLocal) matrices.
   * @returns Texture regions with resolved world-space mappings.
   */
  private buildTextureRegions(
    surfaceRegions: readonly SolidSurfaceRegion[],
    findBrush: (id: string) => SolidBrushInstance | undefined,
    invWorldByBrush: Map<string, THREE.Matrix4>,
  ): Array<{ triangleIndices: number[]; textureId: string; mapping: FaceTextureMapping }> {
    return surfaceRegions.map((region) => {
      const mapping = this.resolveRegionMapping(region, findBrush, invWorldByBrush);
      return {
        triangleIndices: region.triangleIndices,
        textureId: ModifierBevelSurfaceOverlay.presentedTextureId(region.brushId, region.textureId, mapping.textureId),
        mapping,
      };
    });
  }

  /**
   * Resolves one region mapping in world space for result face maps.
   *
   * @param region Surface region with brush source identity.
   * @param findBrush Lookup for the owning brush.
   * @param invWorldByBrush Per-brush conversion matrices.
   * @returns World-space mapping for the result mesh.
   */
  private resolveRegionMapping(
    region: { textureId: string; brushId: string; surfaceIndex: number },
    findBrush: (id: string) => SolidBrushInstance | undefined,
    invWorldByBrush: Map<string, THREE.Matrix4>,
  ): FaceTextureMapping {
    const brush = findBrush(region.brushId);
    if (!brush) {
      return createDefaultFaceTextureMapping(region.textureId || DEFAULT_CHECKER_TEXTURE_ID);
    }
    const localMapping = brush.getSurfaceMapping(region.surfaceIndex);
    const invWorld = invWorldByBrush.get(region.brushId);
    if (!invWorld) return localMapping;
    return convertBrushLocalFaceMappingToWorldWithMatrix(localMapping, invWorld);
  }

  /**
   * Writes shared face texture maps onto the result mesh.
   *
   * @param resultMesh Compiled result mesh.
   * @param textureRegions Resolved texture regions.
   */
  private writeSharedFaceMaps(
    resultMesh: THREE.Mesh,
    textureRegions: Array<{ triangleIndices: number[]; mapping: FaceTextureMapping }>,
  ): void {
    setFaceTextureMapsShared(
      resultMesh,
      textureRegions.map((region) => ({
        triangleIndices: region.triangleIndices,
        mapping: withTrsAccessors(region.mapping),
      })),
    );
  }

  /**
   * Rebuilds multi-draw materials for solid result surfaces.
   *
   * @param resultMesh Compiled result mesh.
   * @param textureRegions Resolved texture regions.
   */
  private writeSolidResultMaterials(
    resultMesh: THREE.Mesh,
    textureRegions: Array<{ triangleIndices: number[]; textureId: string }>,
  ): void {
    rebuildSolidResultMaterials(
      resultMesh,
      textureRegions.map((region) => ({
        triangleIndices: region.triangleIndices,
        textureId: region.textureId,
      })),
    );
  }
}
