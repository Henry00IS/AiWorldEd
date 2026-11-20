import type * as THREE from 'three';
import { modifierStackIsDerived } from '@/modifier/stack/evaluate/modifier_stack_copy.js';
import { MODIFIER_STACK_MESH_KEY } from '@/modifier/stack/meshes/modifier_stack_meshes.js';

/**
 * Returns whether an object is built by a modifier stack: a derived or
 * generated brush, or a mesh a generator shows until it is baked. Such objects
 * are rebuilt from their stack and cannot be edited directly.
 *
 * @param object Candidate object, or null.
 * @returns True for modifier stack output.
 */
export function modifierStackOutputIs(object: THREE.Object3D | null | undefined): boolean {
  return modifierStackIsDerived(object) || object?.userData[MODIFIER_STACK_MESH_KEY] === true;
}
