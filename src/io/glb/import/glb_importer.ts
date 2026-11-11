import { contentMeshImportFinalize, contentMeshImportRootCreate } from '@/io/geometry/content_mesh_import.js';
import { GlbImportDocumentLoader } from './glb_import_document_loader.js';
import { GlbImportHierarchyBuilder } from './builder_glb_import_hierarchy.js';
import { GlbImportImageReader } from './glb_import_images.js';
import { GlbImportMeshBuilder } from './builder_glb_import_mesh.js';
import type { GlbImportResult, GlbImportTextureResolver } from './glb_import_types.js';

/**
 * Imports binary glTF as editable content meshes: the node hierarchy, names and
 * transforms are kept, every mesh becomes one polygon document with its
 * materials as per-face textures and its UVs as face mappings, and embedded
 * images are handed to a texture resolver that decides their texture ids.
 */
export class GlbImporter {
  private readonly loader = new GlbImportDocumentLoader();
  private readonly imageReader = new GlbImportImageReader();

  /**
   * Imports a file. The returned root is not added to any scene.
   *
   * @param data File bytes.
   * @param sourceFileName File name, used for the group of multi-root files.
   * @param textureResolver Picks texture ids for embedded images.
   * @returns Result, or null when the file has no triangle meshes.
   */
  async importFromBytes(
    data: ArrayBuffer | ArrayBufferView,
    sourceFileName: string,
    textureResolver: GlbImportTextureResolver,
  ): Promise<GlbImportResult | null> {
    const document = await this.loader.load(data);
    const resolution = await textureResolver.resolve(await this.imageReader.read(document));
    const hierarchy = new GlbImportHierarchyBuilder(
      document,
      new GlbImportMeshBuilder(document, resolution.textureIdByImage),
    );
    const roots = await hierarchy.buildScene();
    const built = hierarchy.builtMeshes();
    if (roots.length === 0 || built.length === 0) return null;
    const root = contentMeshImportRootCreate(roots, sourceFileName, 'Imported GLB');
    root.updateMatrixWorld(true);
    built.forEach((entry) => contentMeshImportFinalize(entry.mesh, entry.hasAuthoredUvs));
    return {
      root,
      importedMeshCount: built.length,
      importedTriangleCount: built.reduce((sum, entry) => sum + entry.triangleCount, 0),
      textureNote: resolution.note,
    };
  }
}
