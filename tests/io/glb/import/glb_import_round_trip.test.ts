import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { contentMeshImportCreate, contentMeshImportFinalize } from '@/io/geometry/content_mesh_import.js';
import { GlbExporter } from '@/io/glb/glb_exporter.js';
import { GlbImporter } from '@/io/glb/import/glb_importer.js';
import { GLB_IMPORT_MESH_USERDATA_KEY } from '@/io/glb/import/builder_glb_import_hierarchy.js';
import { GlbImportTextureResolverChecker } from '@/io/glb/import/glb_import_texture_resolver_checker.js';
import { readPersistentMeshDocument } from '@/mesh/document/mesh_document_binding.js';
import { createMeshDocumentBox } from '@/mesh/primitive/mesh_primitive_box.js';
import { extractHierarchyNameBase } from '@/utils/utils_hierarchy_name_allocator.js';

/**
 * Builds a content box mesh like the importers do.
 *
 * @param name Name.
 * @param size Edge lengths.
 * @param position Local position.
 * @returns Mesh.
 */
function contentBox(name: string, size: THREE.Vector3, position: THREE.Vector3): THREE.Mesh {
  const mesh = contentMeshImportCreate(createMeshDocumentBox(size.x, size.y, size.z), name, 'roundTripTest');
  mesh.position.copy(position);
  return mesh;
}

/**
 * Summarizes every mesh under a root by base name: world bounds and face count.
 *
 * @param root Root.
 * @returns Base name to summary text.
 */
function meshSummary(root: THREE.Object3D): Map<string, string> {
  root.updateMatrixWorld(true);
  const summary = new Map<string, string>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const bounds = new THREE.Box3().setFromObject(object);
    const corners = [...bounds.min.toArray(), ...bounds.max.toArray()].map((value) => value.toFixed(4));
    const faces = readPersistentMeshDocument(object)?.getTopology().getFaceCount();
    summary.set(extractHierarchyNameBase(object.name), `${corners.join(' ')} faces=${faces}`);
  });
  return summary;
}

describe('GLB export and import round trip', () => {
  it('brings back hierarchy, names, transforms and editable polygon faces', async () => {
    const world = new THREE.Group();
    const room = new THREE.Group();
    room.name = 'Room';
    room.position.set(2, 0, -3);
    room.rotation.y = Math.PI / 6;
    room.add(contentBox('Crate', new THREE.Vector3(1, 1, 1), new THREE.Vector3(0.5, 0.5, 0)));
    room.add(contentBox('Pillar', new THREE.Vector3(0.5, 3, 0.5), new THREE.Vector3(-2, 1.5, 1)));
    world.add(room);
    world.add(contentBox('Floor', new THREE.Vector3(10, 0.2, 10), new THREE.Vector3(0, -0.1, 0)));
    world.updateMatrixWorld(true);
    world.traverse((object) => object instanceof THREE.Mesh && contentMeshImportFinalize(object, false));
    const bytes = await new GlbExporter().export(world);
    const resolver = new GlbImportTextureResolverChecker('checker');
    const result = await new GlbImporter().importFromBytes(bytes, 'level.glb', resolver);
    if (result === null) throw new Error('nothing imported');
    expect(meshSummary(result.root)).toEqual(meshSummary(world));
    const imported: THREE.Object3D[] = [];
    result.root.traverse((object) => object.userData[GLB_IMPORT_MESH_USERDATA_KEY] === true && imported.push(object));
    expect(extractHierarchyNameBase(result.root.name)).toBe('level');
    const parents = imported.map((object) => extractHierarchyNameBase(object.parent?.name ?? ''));
    expect(parents.sort()).toEqual(['Room', 'Room', 'level']);
  });
});
