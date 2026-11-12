import * as THREE from 'three';
import { contentMeshImportCreate, contentMeshImportFinalize } from '@/io/geometry/content_mesh_import.js';
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
 * Builds an asymmetric level: a rotated group with children and loose boxes.
 *
 * @returns World group.
 */
export function level(): THREE.Group {
  const world = new THREE.Group();
  const room = new THREE.Group();
  room.name = 'Room';
  room.position.set(2, 0, -3);
  room.rotation.y = Math.PI / 6;
  room.add(contentBox('Crate', new THREE.Vector3(1, 2, 3), new THREE.Vector3(0.5, 1, 0)));
  room.add(contentBox('Pillar', new THREE.Vector3(0.5, 3, 0.25), new THREE.Vector3(-2, 1.5, 1)));
  world.add(room);
  world.add(contentBox('Floor', new THREE.Vector3(10, 0.2, 6), new THREE.Vector3(0, -0.1, 4)));
  world.add(contentBox('Arrow', new THREE.Vector3(0.2, 0.2, 2), new THREE.Vector3(0, 1, -5)));
  world.updateMatrixWorld(true);
  world.traverse((object) => object instanceof THREE.Mesh && contentMeshImportFinalize(object, false));
  return world;
}

/**
 * Summarizes the world bounds of every mesh under a root, by base name.
 *
 * @param root Root.
 * @returns Base name to rounded bounds.
 */
export function bounds(root: THREE.Object3D): Record<string, string> {
  root.updateMatrixWorld(true);
  const summary: Record<string, string> = {};
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const box = new THREE.Box3().setFromObject(object);
    summary[extractHierarchyNameBase(object.name)] = [...box.min.toArray(), ...box.max.toArray()]
      .map((value) => (Math.abs(value) < 5e-5 ? 0 : value).toFixed(4))
      .join(' ');
  });
  return summary;
}
