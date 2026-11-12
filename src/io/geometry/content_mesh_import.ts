import * as THREE from 'three';
import { writeMeshDocumentDisplayGeometry } from '@/mesh/convert/mesh_document_display_write.js';
import type { MeshDocument } from '@/mesh/document/mesh_document.js';
import { readPersistentMeshDocument, writePersistentMeshDocument } from '@/mesh/document/mesh_document_binding.js';
import { createContentMaterial } from '@/materials/factory_content_material.js';
import { Theme } from '@/theme.js';
import { enableFlatShadingOnMesh } from '@/utils/mesh_edge_sync.js';
import { extractHierarchyNameBase, hierarchyNameAllocator } from '@/utils/utils_hierarchy_name_allocator.js';
import { EXPORT_SCENE_ROOT_NAME } from '@/io/scene/builder_export_scene.js';
import { initializeMeshTextureUVs } from '@/texture/uv/face_texture_applier.js';
import { DEFAULT_CHECKER_TEXTURE_ID } from '@/texture/library/texture_id.js';

/**
 * Creates an imported content mesh that holds an editable document but no
 * display geometry yet. Call {@link contentMeshImportFinalize} once the mesh
 * sits at its final place in the hierarchy.
 *
 * @param document Editable polygon document with corner UVs and face textures.
 * @param baseName Name to allocate a unique hierarchy name from.
 * @param importFlagKey UserData key marking the importer that made the mesh.
 * @returns Mesh without display geometry.
 */
export function contentMeshImportCreate(document: MeshDocument, baseName: string, importFlagKey: string): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), createContentMaterial(Theme.boxColor));
  mesh.name = hierarchyNameAllocator.allocateFromSourceName(baseName);
  mesh.userData[importFlagKey] = true;
  writePersistentMeshDocument(mesh, document);
  return mesh;
}

/**
 * Builds the display geometry of an imported mesh from its document. Every face
 * gets a world-space texture mapping fitted to its corner UVs, so the authored
 * UVs survive saving, reopening and texture lock; a mesh whose file had no
 * texture coordinates gets the editor's default checker mapping. The mesh's
 * world matrix must be final.
 *
 * @param mesh Mesh made by {@link contentMeshImportCreate}.
 * @param hasAuthoredUvs Whether the document's corner UVs came from the file.
 */
export function contentMeshImportFinalize(mesh: THREE.Mesh, hasAuthoredUvs: boolean): void {
  const document = readPersistentMeshDocument(mesh);
  if (document === null) return;
  mesh.updateMatrixWorld(true);
  writeMeshDocumentDisplayGeometry(mesh, document);
  if (!hasAuthoredUvs) {
    initializeMeshTextureUVs(mesh, DEFAULT_CHECKER_TEXTURE_ID);
  }
  enableFlatShadingOnMesh(mesh);
}

/**
 * Returns the stem of an imported file name, used to name the group that holds
 * a multi-object import.
 *
 * @param filename File name, possibly with a path and extension.
 * @param fallback Name used when the stem is empty.
 * @returns File stem, or the fallback.
 */
export function contentMeshImportFileStem(filename: string, fallback: string): string {
  const stem = filename
    .replace(/^.*[\\/]/, '')
    .replace(/\.[^.]*$/, '')
    .trim();
  return stem.length > 0 ? stem : fallback;
}

/**
 * Creates the object of an imported node: the mesh alone, or a group named
 * after the node holding the mesh and the children.
 *
 * @param groupName Name the group is allocated from.
 * @param mesh Built mesh, or null.
 * @param children Built child objects.
 * @returns Object, or null when nothing was built.
 */
export function contentMeshImportNodeObject(
  groupName: string,
  mesh: THREE.Mesh | null,
  children: readonly THREE.Object3D[],
): THREE.Object3D | null {
  if (children.length === 0) return mesh;
  const group = new THREE.Group();
  group.name = hierarchyNameAllocator.allocateFromSourceName(groupName);
  if (mesh !== null) group.add(mesh);
  children.forEach((child) => group.add(child));
  return group;
}

/**
 * Returns the single root of an import, or a group named after the file holding
 * all roots. A root named like the editor's own export root is renamed after
 * the file.
 *
 * @param roots Built scene roots (at least one).
 * @param sourceFileName File name.
 * @param fallback Name used when the file name has no stem.
 * @returns Import root.
 */
export function contentMeshImportRootCreate(
  roots: readonly THREE.Object3D[],
  sourceFileName: string,
  fallback: string,
): THREE.Object3D {
  const [first] = roots;
  const fileName = () => hierarchyNameAllocator.allocate(contentMeshImportFileStem(sourceFileName, fallback));
  if (roots.length === 1 && first !== undefined) {
    if (extractHierarchyNameBase(first.name) === EXPORT_SCENE_ROOT_NAME) first.name = fileName();
    return first;
  }
  const group = new THREE.Group();
  group.name = fileName();
  roots.forEach((root) => group.add(root));
  return group;
}
