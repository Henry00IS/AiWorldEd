import { contentMeshImportFinalize, contentMeshImportRootCreate } from '@/io/geometry/content_mesh_import.js';
import { fbxImportDocumentParse, type FbxImportDocument } from './parse/fbx_import_document.js';
import { fbxImportAxisConversion } from './scene/fbx_import_axis_conversion.js';
import { FbxImportHierarchyBuilder, fbxImportModelMaterialIds } from './scene/builder_fbx_import_hierarchy.js';
import { FbxImportTextureReader } from './textures/fbx_import_texture_reader.js';
import type { FbxImportResult, FbxImportTextureResolver } from './fbx_import_types.js';

/**
 * Imports Autodesk FBX (binary or ASCII, version 7.x) as editable content
 * meshes: the model hierarchy and names are kept, transforms and vertices are
 * converted from the file's axes and units to the editor's, every mesh becomes
 * one polygon document with its materials' diffuse maps as per-face textures,
 * and the texture resolver decides the texture id of every map.
 */
export class FbxImporter {
  /**
   * Imports a file. The returned root is not added to any scene.
   *
   * @param data File bytes.
   * @param sourceFileName File name, used for the group of multi-root files.
   * @param textureResolver Picks texture ids for the diffuse maps.
   * @returns Result, or null when the file has no polygon meshes.
   */
  async importFromBytes(
    data: ArrayBuffer | ArrayBufferView,
    sourceFileName: string,
    textureResolver: FbxImportTextureResolver,
  ): Promise<FbxImportResult | null> {
    const document = fbxImportDocumentParse(data);
    const textures = new FbxImportTextureReader(document);
    fbxImportTexturesCollect(document, textures);
    const resolution = await textureResolver.resolve(textures.texturesFound());
    const conversion = fbxImportAxisConversion(document.globalSettings);
    const hierarchy = new FbxImportHierarchyBuilder(document, conversion, textures, resolution.textureIdByImage);
    const roots = hierarchy.buildScene();
    const built = hierarchy.builtMeshes();
    if (roots.length === 0 || built.length === 0) return null;
    const root = contentMeshImportRootCreate(roots, sourceFileName, 'Imported FBX');
    root.updateMatrixWorld(true);
    built.forEach((entry) => contentMeshImportFinalize(entry.mesh, entry.hasAuthoredUvs));
    return {
      root,
      importedMeshCount: built.length,
      importedPolygonCount: built.reduce((sum, entry) => sum + entry.polygonCount, 0),
      textureNote: resolution.note,
    };
  }
}

/**
 * Registers the diffuse map of every material a model uses, so all textures are
 * known before any mesh is built.
 *
 * @param document Parsed file.
 * @param textures Texture reader.
 */
function fbxImportTexturesCollect(document: FbxImportDocument, textures: FbxImportTextureReader): void {
  document.objectsOfType('Model').forEach(({ id }) => {
    fbxImportModelMaterialIds(document, id).forEach((materialId) => textures.materialTextureIndex(materialId));
  });
}
