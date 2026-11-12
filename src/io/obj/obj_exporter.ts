import type { ModelExportTextures } from '@/io/export/model_export_textures.js';
import * as THREE from 'three';
import { exportSceneBake } from '@/io/scene/export_scene_bake.js';
import { buildExportScene } from '@/io/scene/builder_export_scene.js';
import type { ExportSpace } from '@/io/coordinates/export_space.js';
import { buildModelFileTransform } from '@/io/coordinates/coordinate_space_transform.js';
import type { ObjExportPackage } from './obj_export_types.js';
import { ObjMaterialCollector } from './obj_material_collector.js';
import { ObjGeometryWriter } from './obj_geometry_writer.js';
import { buildMtlDocument } from './obj_mtl_writer.js';
import { objMetaLine } from './obj_meta.js';
import { encodeObjTextureFiles } from './obj_texture_encoder.js';

/**
 * Exports a Three.js scene group as a Wavefront OBJ package: .obj geometry and,
 * optionally, a companion .mtl with the maps it names by map_Kd. Filters editor
 * helpers the same way as GLB export and optionally applies the active game
 * export space's unit and coordinate-space conversion.
 */
export class ObjExporter {
  /**
   * Builds a complete Wavefront export package for the world group.
   *
   * @param worldGroup The live editor world root to export.
   * @param space Export space, or null to skip conversion.
   * @param baseFileName Checked base name without extension (e.g. "scene").
   * @param textures Where the maps go (copied or named in place).
   * @param materials Whether to write the .mtl, its maps and material lines.
   * @returns Package with obj, mtl, and texture files.
   */
  async exportPackage(
    worldGroup: THREE.Group,
    space: ExportSpace | null,
    baseFileName: string,
    textures: ModelExportTextures,
    materials = true,
  ): Promise<ObjExportPackage> {
    const exportRoot = this.wrapForExport(worldGroup, space);
    exportRoot.updateMatrixWorld(true);
    const collector = new ObjMaterialCollector();
    const geometryWriter = new ObjGeometryWriter();
    this.writeMeshes(exportRoot, materials ? collector : null, geometryWriter);
    const objFileName = `${baseFileName}.obj`;
    const meta = objMetaLine(space);
    if (!materials)
      return {
        objFileName,
        objText: this.buildObjDocument(meta, null, geometryWriter.getBody()),
        mtl: null,
        textures: [],
      };
    const slots = collector.getSlots();
    const mtlFileName = `${baseFileName}.mtl`;
    const files = await encodeObjTextureFiles(slots, textures);
    return {
      objFileName,
      objText: this.buildObjDocument(meta, mtlFileName, geometryWriter.getBody()),
      mtl: { fileName: mtlFileName, text: buildMtlDocument(meta, slots) },
      textures: files,
    };
  }

  /**
   * Synchronous geometry-only helper kept for tests that only need OBJ text.
   * Prefer {@link exportPackage} for full material export.
   *
   * @param worldGroup The live editor world root to export.
   * @param space Export space, or null to skip conversion.
   * @returns OBJ file contents as UTF-8 text.
   */
  export(worldGroup: THREE.Group, space: ExportSpace | null = null): string {
    const exportRoot = this.wrapForExport(worldGroup, space);
    exportRoot.updateMatrixWorld(true);
    const collector = new ObjMaterialCollector();
    const geometryWriter = new ObjGeometryWriter();
    this.writeMeshes(exportRoot, collector, geometryWriter);
    return this.buildObjDocument(objMetaLine(space), 'scene.mtl', geometryWriter.getBody());
  }

  /**
   * Traverses the export graph and writes every mesh.
   *
   * @param root Export root.
   * @param collector Material registry, or null to write no materials.
   * @param geometryWriter Geometry writer.
   */
  private writeMeshes(
    root: THREE.Object3D,
    collector: ObjMaterialCollector | null,
    geometryWriter: ObjGeometryWriter,
  ): void {
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      if (!object.visible) return;
      const slots = collector?.registerMeshMaterials(object) ?? [];
      geometryWriter.writeMesh(object, slots);
    });
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

  /**
   * Assembles the final OBJ document with header and mtllib reference.
   *
   * @param meta The objmeta comment line.
   * @param mtlFileName Companion MTL file name, or null for none.
   * @param body Geometry body text.
   * @returns Complete OBJ document.
   */
  private buildObjDocument(meta: string, mtlFileName: string | null, body: string): string {
    const header = [
      '# Wavefront OBJ exported by AI World Editor',
      '# https://github.com/Henry00IS/AiWorldEd',
      meta,
      ...(mtlFileName === null ? [] : [`mtllib ${mtlFileName}`]),
      '',
    ].join('\n');
    const trimmedBody = body.trim();
    return trimmedBody.length > 0 ? `${header}${trimmedBody}\n` : `${header}\n`;
  }
}
