import * as THREE from 'three';
import { cloneMeshDocument } from '@/mesh/document/mesh_document_clone.js';
import { readPersistentMeshDocument } from '@/mesh/document/mesh_document_binding.js';
import { contentMeshImportCreate } from '@/io/geometry/content_mesh_import.js';
import { contentMeshImportFinalizeSlots } from '@/io/geometry/content_mesh_texture_slots.js';
import { modifierStackMeshSlots, modifierStackMeshesShown } from '@/modifier/stack/meshes/modifier_stack_meshes.js';

/** UserData key marking meshes made by baking a generator. */
export const MODIFIER_STACK_BAKE_MESH_KEY = 'isGeneratorMesh';

/** One regular mesh a bake adds, with where it goes. */
export interface ModifierStackBakeMesh {
  /** Mesh object, finished and named. */
  mesh: THREE.Mesh;
  /** Parent it is added to. */
  parent: THREE.Object3D;
}

/**
 * Turns the meshes a volume's generators show into regular, editable mesh
 * objects under a parent, at the same place in the world. They are not added
 * yet.
 *
 * @param volume Modifier volume or generator node.
 * @param parent Parent of the new meshes, normally the solid model's parent.
 * @returns New meshes.
 */
export function modifierStackBakeMeshesCreate(volume: THREE.Object3D, parent: THREE.Object3D): ModifierStackBakeMesh[] {
  parent.updateWorldMatrix(true, false);
  const toParent = parent.matrixWorld.clone().invert();
  return modifierStackMeshesShown(volume).flatMap((shown) => {
    const document = readPersistentMeshDocument(shown);
    if (!document) return [];
    shown.updateWorldMatrix(true, false);
    const mesh = contentMeshImportCreate(
      cloneMeshDocument(document),
      shown.name || 'Mesh',
      MODIFIER_STACK_BAKE_MESH_KEY,
    );
    toParent.clone().multiply(shown.matrixWorld).decompose(mesh.position, mesh.quaternion, mesh.scale);
    parent.add(mesh);
    contentMeshImportFinalizeSlots(
      mesh,
      shown.userData['modifierStackMeshUvs'] === true,
      modifierStackMeshSlots(shown),
    );
    parent.remove(mesh);
    return [{ mesh, parent }];
  });
}

/**
 * Returns the world group baked meshes belong in: the solid's parent, or the
 * last ancestor under the scene, so the outliner can list them. The scene
 * itself is never returned; objects parented there stay visible but vanish from
 * the outliner.
 *
 * @param volume Modifier volume or generator node being baked.
 * @param preferred Parent already known, such as the solid's parent, or null.
 * @param sceneRoot Top of the object's parent chain.
 * @returns Parent for baked content.
 */
export function modifierStackBakeContentParent(
  volume: THREE.Object3D,
  preferred: THREE.Object3D | null,
  sceneRoot: THREE.Object3D,
): THREE.Object3D {
  if (preferred && !(preferred instanceof THREE.Scene)) return preferred;
  let node: THREE.Object3D | null = volume;
  let content = volume;
  while (node?.parent) {
    if (node.parent instanceof THREE.Scene) return node;
    content = node.parent;
    node = node.parent;
  }
  return content instanceof THREE.Scene ? sceneRoot : content;
}
