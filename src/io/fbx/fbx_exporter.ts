import * as THREE from 'three';
import { exportSceneBake } from '@/io/scene/export_scene_bake.js';
import { buildExportScene } from '@/io/scene/builder_export_scene.js';
import type { ExportSpace } from '@/io/coordinates/export_space.js';
import { buildModelFileTransform, resolveFbxUnitScaleFactor } from '@/io/coordinates/coordinate_space_transform.js';
import type { FbxExportEncoding, FbxExportPackage } from './fbx_export_types.js';
import { buildFbxExportPlan, fbxExportAxesFor, type FbxExportPlan } from './fbx_export_graph.js';
import { fbxExportDocumentBuild } from './fbx_export_document.js';
import { FbxAsciiSerializer } from './fbx_ascii_serializer.js';
import { FbxBinarySerializer } from './fbx_binary_serializer.js';
import { encodeFbxTextureFiles } from './fbx_texture_encoder.js';
import type { ModelExportTextures } from '@/io/export/model_export_textures.js';

/**
 * Exports a Three.js world group as Autodesk FBX 7.4, binary or ASCII, with its
 * diffuse maps embedded or as files. Both encodings write the same record tree.
 * Filters editor helpers the same way as GLB/OBJ and optionally applies the
 * export space's unit and coordinate conversion.
 */
export class FbxExporter {
  private readonly asciiSerializer = new FbxAsciiSerializer();
  private readonly binarySerializer = new FbxBinarySerializer();

  /**
   * Builds a complete FBX package (document + map images).
   *
   * @param worldGroup The live editor world root to export.
   * @param space Export space, or null to skip conversion.
   * @param baseFileName Checked base name without extension (e.g. "scene").
   * @param encoding File encoding.
   * @param textures Where the diffuse maps go.
   * @returns Package with the fbx bytes and texture files.
   */
  async exportPackage(
    worldGroup: THREE.Group,
    space: ExportSpace | null,
    baseFileName: string,
    encoding: FbxExportEncoding,
    textures: ModelExportTextures,
  ): Promise<FbxExportPackage> {
    const plan = this.buildPlan(worldGroup, space);
    // Textures first: original files keep their format, which sets the file names the document refers to.
    const files = await encodeFbxTextureFiles(plan.surfaces.getMaps(), textures);
    const fbxBytes =
      encoding === 'binary' ? this.serializeBinary(plan) : new TextEncoder().encode(this.serializeAscii(plan));
    return { fbxFileName: `${baseFileName}.fbx`, encoding, fbxBytes, textures: files };
  }

  /**
   * Exports the geometry as ASCII FBX text, without encoding map images.
   *
   * @param worldGroup The live editor world root to export.
   * @param space Export space, or null to skip conversion.
   * @returns FBX ASCII text.
   */
  exportAscii(worldGroup: THREE.Group, space: ExportSpace | null = null): string {
    return this.serializeAscii(this.buildPlan(worldGroup, space));
  }

  /**
   * Exports the geometry as binary FBX, without encoding map images.
   *
   * @param worldGroup The live editor world root to export.
   * @param space Export space, or null to skip conversion.
   * @returns FBX file bytes.
   */
  exportBinary(worldGroup: THREE.Group, space: ExportSpace | null = null): Uint8Array<ArrayBuffer> {
    return this.serializeBinary(this.buildPlan(worldGroup, space));
  }

  /**
   * Writes a plan as ASCII text.
   *
   * @param plan Export plan.
   * @returns Text.
   */
  private serializeAscii(plan: FbxExportPlan): string {
    return this.asciiSerializer.serialize(fbxExportDocumentBuild(plan));
  }

  /**
   * Writes a plan as binary bytes.
   *
   * @param plan Export plan.
   * @returns Bytes.
   */
  private serializeBinary(plan: FbxExportPlan): Uint8Array<ArrayBuffer> {
    return this.binarySerializer.serialize(fbxExportDocumentBuild(plan));
  }

  /**
   * Filters the world, applies the export space transform, and builds the FBX
   * plan with a UnitScaleFactor and axis system that match the baked units and
   * axes.
   *
   * @param worldGroup Live editor world root.
   * @param space Export space, or null.
   * @returns Export plan ready for serialization.
   */
  private buildPlan(worldGroup: THREE.Group, space: ExportSpace | null): FbxExportPlan {
    const exportRoot = this.wrapForExport(worldGroup, space);
    exportRoot.updateMatrixWorld(true);
    const axes = fbxExportAxesFor(buildModelFileTransform(space));
    return buildFbxExportPlan(exportRoot, resolveFbxUnitScaleFactor(space), axes);
  }

  /**
   * Builds a filtered export graph with the export space's axes and units baked
   * into its nodes and geometry (see buildModelFileTransform), so nodes keep
   * their own rotation and scale.
   *
   * @param worldGroup The original scene root.
   * @param space Export space, or null.
   * @returns Export root ready for serialization.
   */
  private wrapForExport(worldGroup: THREE.Group, space: ExportSpace | null): THREE.Group {
    const exportScene = buildExportScene(worldGroup);
    const transform = buildModelFileTransform(space);
    if (!transform.equals(new THREE.Matrix4())) exportSceneBake(exportScene, transform);
    return exportScene;
  }
}
