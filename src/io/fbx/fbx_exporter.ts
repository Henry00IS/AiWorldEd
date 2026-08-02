import * as THREE from 'three';
import { buildExportScene } from '@/io/scene/builder_export_scene.js';
import type { GameProfile } from '@/settings/store/settings_types.js';
import {
  buildExportRootTransform,
  EDITOR_COORDINATE_SPACE,
  isReflectionMatrix,
  resolveFbxUnitScaleFactor,
} from '@/io/coordinates/coordinate_space_transform.js';
import type { FbxExportPackage } from './fbx_export_types.js';
import { buildFbxExportPlan } from './fbx_export_graph.js';
import { FbxAsciiSerializer } from './fbx_ascii_serializer.js';
import { encodeFbxTextureFiles } from './fbx_texture_encoder.js';
import { FbxSceneCoordinateBaker } from './fbx_scene_coordinate_baker.js';
import { resolveFbxCoordinateSpace } from './fbx_coordinate_settings.js';

/**
 * Exports a Three.js world group as Autodesk FBX ASCII 7.4 with optional
 * external diffuse maps. Filters editor helpers the same way as GLB/OBJ and
 * optionally applies the active game profile's unit and coordinate conversion.
 */
export class FbxExporter {
  private readonly serializer = new FbxAsciiSerializer();
  private readonly coordinateBaker = new FbxSceneCoordinateBaker();

  /**
   * Builds a complete FBX package (ASCII document + map images).
   *
   * @param worldGroup The live editor world root to export.
   * @param profile Active game profile, or null to skip conversion.
   * @param baseFileName Base name without extension (e.g. "scene").
   * @returns Package with fbx text and texture files.
   */
  async exportPackage(
    worldGroup: THREE.Group,
    profile: GameProfile | null = null,
    baseFileName = 'scene',
  ): Promise<FbxExportPackage> {
    const plan = this.buildPlan(worldGroup, profile);
    const fbxText = this.serializer.serialize(plan);
    const textures = await encodeFbxTextureFiles(plan.surfaces.getMaps());
    const safeBase = this.sanitizeBaseFileName(baseFileName);
    return {
      fbxFileName: `${safeBase}.fbx`,
      fbxText,
      textures,
    };
  }

  /**
   * Synchronous geometry-focused helper for tests that only need FBX text.
   * Prefer {@link exportPackage} for full map export.
   *
   * @param worldGroup The live editor world root to export.
   * @param profile Active game profile, or null to skip conversion.
   * @returns FBX ASCII file contents as UTF-8 text.
   */
  export(worldGroup: THREE.Group, profile: GameProfile | null = null): string {
    return this.serializer.serialize(this.buildPlan(worldGroup, profile));
  }

  /**
   * Filters the world, applies profile transform, and builds the FBX plan with
   * a UnitScaleFactor that matches the baked units.
   *
   * @param worldGroup Live editor world root.
   * @param profile Active game profile, or null.
   * @returns Export plan ready for serialization.
   */
  private buildPlan(worldGroup: THREE.Group, profile: GameProfile | null) {
    const coordinateSpace = resolveFbxCoordinateSpace(profile?.coordinateSpace ?? EDITOR_COORDINATE_SPACE);
    const exportProfile = profile ? { ...profile, coordinateSpace } : null;
    const exportRoot = this.wrapForExport(worldGroup, exportProfile);
    const transform = buildExportRootTransform(exportProfile);
    exportRoot.updateMatrixWorld(true);
    return buildFbxExportPlan(
      exportRoot,
      resolveFbxUnitScaleFactor(profile),
      coordinateSpace,
      isReflectionMatrix(transform),
    );
  }

  /**
   * Builds a filtered export graph and applies the optional profile transform.
   *
   * @param worldGroup The original scene root.
   * @param profile Active game profile, or null.
   * @returns A wrapped group ready for serialization.
   */
  private wrapForExport(worldGroup: THREE.Group, profile: GameProfile | null): THREE.Group {
    const exportScene = buildExportScene(worldGroup);
    const transform = buildExportRootTransform(profile);
    if (transform.equals(new THREE.Matrix4())) {
      return exportScene;
    }
    this.coordinateBaker.bake(exportScene, transform);
    return exportScene;
  }

  /**
   * Sanitizes a base file name without extension.
   *
   * @param baseFileName Suggested base name.
   * @returns Safe base name.
   */
  private sanitizeBaseFileName(baseFileName: string): string {
    const trimmed = baseFileName.trim().replace(/\.fbx$/i, '');
    const safe = trimmed.replace(/[^a-zA-Z0-9._-]+/g, '_');
    return safe.length > 0 ? safe : 'scene';
  }
}
