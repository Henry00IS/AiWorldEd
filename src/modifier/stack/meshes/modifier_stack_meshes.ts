import * as THREE from 'three';
import type { MeshDocument } from '@/mesh/document/mesh_document.js';
import { cloneMeshDocument } from '@/mesh/document/mesh_document_clone.js';
import { writePersistentMeshDocument } from '@/mesh/document/mesh_document_binding.js';
import {
  contentMeshImportFinalizeSlots,
  type ContentMeshTextureSlots,
} from '@/io/geometry/content_mesh_texture_slots.js';
import { createContentMaterial } from '@/materials/factory_content_material.js';
import { Theme } from '@/theme.js';
import { MODIFIER_VOLUME_BEVEL_EDGE_KEY } from '@/modifier/volume/modifier_volume_bevel_keys.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { ModifierStackMeshShown } from './modifier_stack_mesh_shown.js';

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
  /** Texture slots: slot 0 is the whole mesh's, null being the default. */
  textures: (string | null)[];
  /** Slot of each document face. */
  slots: number[];
  /** World matrix of the frame the document is in. */
  frame: THREE.Matrix4;
}

/**
 * Shows the meshes a volume's generators built as children of the volume,
 * replacing the ones shown before. They are never saved, listed or picked, but
 * they collide in play like other meshes; baking turns them into regular
 * meshes. With an anchor they stay where they were built relative to it while
 * the volume moves, until the next evaluation replaces them.
 *
 * @param volume Modifier volume or generator node.
 * @param meshes Meshes of this evaluation.
 * @param anchor Object the meshes stay still against, or null to follow the
 *   volume.
 */
export function modifierStackMeshesShow(
  volume: THREE.Object3D,
  meshes: readonly ModifierStackMeshOutput[],
  anchor: THREE.Object3D | null = null,
): void {
  for (const shown of modifierStackMeshesShown(volume)) {
    volume.remove(shown);
    shown.traverse((node) => modifierStackMeshDispose(node));
  }
  if (meshes.length === 0) return;
  volume.updateWorldMatrix(true, false);
  for (const output of meshes) volume.add(modifierStackMeshCreate(volume, output, anchor));
  for (const mesh of modifierStackMeshesShown(volume)) modifierStackMeshFinalize(mesh);
}

/**
 * Returns what a volume's meshes stay still against while it moves: the solid
 * that receives a modifier volume's brushes, since those brushes stay put too.
 * Generator nodes and brushes or groups that own a stack carry their output
 * with them, so their meshes follow.
 *
 * @param volume Modifier volume, generator node or stack owner.
 * @param solidRoot Solid that receives the volume's output.
 * @returns Anchor, or null to follow the volume.
 */
export function modifierStackMeshAnchor(volume: THREE.Object3D, solidRoot: THREE.Object3D): THREE.Object3D | null {
  return ModifierVolume.isVolume(volume) && !ModifierVolume.isGenerator(volume) ? solidRoot : null;
}

/**
 * Creates one shown mesh at the world place of its frame, pinned to an anchor
 * when given. Its document is written, but it is not finished yet.
 *
 * @param volume Parent volume with a current world matrix.
 * @param output Mesh of this evaluation.
 * @param anchor Object the mesh stays still against, or null.
 * @returns Mesh to add to the volume.
 */
function modifierStackMeshCreate(
  volume: THREE.Object3D,
  output: ModifierStackMeshOutput,
  anchor: THREE.Object3D | null,
): ModifierStackMeshShown {
  const mesh = new ModifierStackMeshShown(new THREE.BufferGeometry(), createContentMaterial(Theme.boxColor));
  mesh.name = output.name;
  mesh.userData[MODIFIER_STACK_MESH_KEY] = true;
  mesh.userData[MODIFIER_VOLUME_BEVEL_EDGE_KEY] = true;
  mesh.userData['modifierStackMeshUvs'] = output.hasUvs;
  mesh.userData['modifierStackMeshSlots'] = { textures: output.textures, slots: output.slots };
  volume.matrixWorld.clone().invert().multiply(output.frame).decompose(mesh.position, mesh.quaternion, mesh.scale);
  mesh.pinTo(anchor, output.frame);
  writePersistentMeshDocument(mesh, cloneMeshDocument(output.document));
  return mesh;
}

/**
 * Finishes a shown mesh once it is under its volume: materials, texture
 * coordinates and edges, and keeps it and its helpers out of picking.
 *
 * @param mesh Shown mesh, with its texture settings in its user data.
 */
function modifierStackMeshFinalize(mesh: THREE.Mesh): void {
  contentMeshImportFinalizeSlots(mesh, mesh.userData['modifierStackMeshUvs'] === true, modifierStackMeshSlots(mesh));
  mesh.raycast = () => undefined;
  mesh.traverse((node) => {
    node.userData[MODIFIER_VOLUME_BEVEL_EDGE_KEY] = true;
    node.raycast = () => undefined;
  });
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

/**
 * Reads the texture slots a shown mesh was built with.
 *
 * @param mesh Shown generator mesh.
 * @returns Its slots, or one default slot when none were stored.
 */
export function modifierStackMeshSlots(mesh: THREE.Object3D): ContentMeshTextureSlots {
  const stored: unknown = mesh.userData['modifierStackMeshSlots'];
  if (typeof stored === 'object' && stored !== null && 'textures' in stored && 'slots' in stored)
    return stored as ContentMeshTextureSlots;
  return { textures: [null], slots: [] };
}
