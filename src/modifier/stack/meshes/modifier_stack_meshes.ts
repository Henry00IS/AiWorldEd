import * as THREE from 'three';
import type { MeshDocument } from '@/mesh/document/mesh_document.js';
import { cloneMeshDocument } from '@/mesh/document/mesh_document_clone.js';
import { writePersistentMeshDocument } from '@/mesh/document/mesh_document_binding.js';
import { contentMeshImportFinalize } from '@/io/geometry/content_mesh_import.js';
import { createContentMaterial } from '@/materials/factory_content_material.js';
import { Theme } from '@/theme.js';
import { MODIFIER_VOLUME_BEVEL_EDGE_KEY } from '@/modifier/volume/modifier_volume_bevel_keys.js';

/** UserData key of the meshes a generator shows until it is baked. */
export const MODIFIER_STACK_MESH_KEY = 'isModifierStackMesh';

/** One mesh a generator builds: a regular mesh object once baked. */
export interface ModifierStackMeshOutput {
  /** Name the baked mesh object is given. */
  name: string;
  /** Editable polygon document in frame coordinates. */
  document: MeshDocument;
  /** True when the document carries texture coordinates of its own. */
  hasUvs: boolean;
  /** Library texture of the whole mesh, or null for the default. */
  texture: string | null;
  /** World matrix of the frame the document is in. */
  frame: THREE.Matrix4;
}

/**
 * Shows the meshes a volume's generators built as children of the volume,
 * replacing the ones shown before. They are editor helpers: never saved,
 * listed, picked or collided with; baking turns them into regular meshes.
 *
 * @param volume Modifier volume or generator node.
 * @param meshes Meshes of this evaluation.
 */
export function modifierStackMeshesShow(volume: THREE.Object3D, meshes: readonly ModifierStackMeshOutput[]): void {
  for (const shown of modifierStackMeshesShown(volume)) {
    volume.remove(shown);
    shown.traverse((node) => modifierStackMeshDispose(node));
  }
  if (meshes.length === 0) return;
  volume.updateWorldMatrix(true, false);
  const toVolume = volume.matrixWorld.clone().invert();
  for (const output of meshes) {
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), createContentMaterial(Theme.boxColor));
    mesh.name = output.name;
    mesh.userData[MODIFIER_STACK_MESH_KEY] = true;
    mesh.userData[MODIFIER_VOLUME_BEVEL_EDGE_KEY] = true;
    mesh.userData['modifierStackMeshUvs'] = output.hasUvs;
    mesh.userData['modifierStackMeshTexture'] = output.texture;
    toVolume.clone().multiply(output.frame).decompose(mesh.position, mesh.quaternion, mesh.scale);
    writePersistentMeshDocument(mesh, cloneMeshDocument(output.document));
    volume.add(mesh);
    contentMeshImportFinalize(mesh, output.hasUvs, output.texture ?? undefined);
    mesh.raycast = () => undefined;
    mesh.traverse((node) => {
      node.userData[MODIFIER_VOLUME_BEVEL_EDGE_KEY] = true;
      node.raycast = () => undefined;
    });
  }
}

/**
 * Lists the generator meshes a volume shows.
 *
 * @param volume Modifier volume or generator node.
 * @returns Shown meshes.
 */
export function modifierStackMeshesShown(volume: THREE.Object3D): THREE.Mesh[] {
  return volume.children.filter(
    (child): child is THREE.Mesh => child instanceof THREE.Mesh && child.userData[MODIFIER_STACK_MESH_KEY] === true,
  );
}

/**
 * Frees the geometry of a shown mesh. Materials may be shared surface
 * materials, so they stay.
 *
 * @param node Mesh or helper.
 */
function modifierStackMeshDispose(node: THREE.Object3D): void {
  if (node instanceof THREE.Mesh || node instanceof THREE.LineSegments) node.geometry?.dispose();
}
