import * as THREE from 'three';
import { buildExportScene } from './export_scene_builder.js';
import type { GameProfile } from '../settings/settings_types.js';
import { buildExportRootTransform, resolveFbxUnitScaleFactor } from './coordinate_space_transform.js';
import type { FbxExportPackage } from './fbx_export_types.js';
import { buildFbxExportPlan } from './fbx_export_graph.js';
import { FbxAsciiSerializer } from './fbx_ascii_serializer.js';
import { encodeFbxTextureFiles } from './fbx_texture_encoder.js';

/**
 * Exports a Three.js world group as Autodesk FBX ASCII 7.4 with optional
 * external diffuse maps. Filters editor helpers the same way as GLB/OBJ and
 * optionally applies the active game profile's unit and coordinate conversion.
 */
export class FbxExporter {
  private readonly serializer = new FbxAsciiSerializer();

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
    const exportRoot = this.wrapForExport(worldGroup, profile);
    exportRoot.updateMatrixWorld(true);
    return buildFbxExportPlan(exportRoot, resolveFbxUnitScaleFactor(profile));
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
    return this.wrapWithTransform(exportScene, transform);
  }

  /**
   * Wraps the filtered export scene under a transformed root node.
   *
   * @param exportScene Filtered content scene.
   * @param transform Profile conversion matrix.
   * @returns Root group with the transform applied.
   */
  private wrapWithTransform(exportScene: THREE.Group, transform: THREE.Matrix4): THREE.Group {
    const wrapper = new THREE.Group();
    wrapper.name = 'ExportRoot';
    wrapper.matrixAutoUpdate = false;
    wrapper.matrix.copy(transform);
    wrapper.add(exportScene);
    return wrapper;
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
