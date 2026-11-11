import type * as THREE from 'three';
import { isSolidModelObject } from '@/solid/model/solid_model_keys.js';

/**
 * What one volume may affect inside one solid: the nodes of its parent that
 * come before it in CSG order. A volume outside every solid model sees the
 * whole solid.
 */
export interface ModifierStackScope {
  /** Solid root or CSG group the volume sits in, or the solid root. */
  parent: THREE.Object3D;
  /** Children of the parent that come before the volume, in CSG order. */
  before: readonly THREE.Object3D[];
  /** True when the CSG of the parent starts solid (inverted world root). */
  startsSolid: boolean;
}

/**
 * Resolves a volume's scope in one solid. A volume inside this solid sees only
 * the earlier siblings in its parent; a volume inside another solid sees
 * nothing here; a volume outside every solid sees every node of this solid.
 *
 * @param volume Modifier volume.
 * @param solidRoot Solid model root.
 * @param invertedWorld True when this solid's CSG starts solid.
 * @returns Scope, or null when the volume cannot affect this solid.
 */
export function modifierStackScopeOf(
  volume: THREE.Object3D,
  solidRoot: THREE.Object3D,
  invertedWorld: boolean,
): ModifierStackScope | null {
  const home = modifierStackScopeSolidOf(volume);
  if (!home) return { parent: solidRoot, before: [...solidRoot.children], startsSolid: invertedWorld };
  const parent = volume.parent;
  if (home !== solidRoot || !parent) return null;
  const before = parent.children.slice(0, parent.children.indexOf(volume));
  return { parent, before, startsSolid: parent === solidRoot && invertedWorld };
}

/**
 * Returns the solid model a node sits in.
 *
 * @param node Scene node.
 * @returns Nearest solid root above the node, or null.
 */
export function modifierStackScopeSolidOf(node: THREE.Object3D): THREE.Object3D | null {
  for (let current = node.parent; current; current = current.parent) if (isSolidModelObject(current)) return current;
  return null;
}

/**
 * Returns whether a node lies under one of the scope's earlier siblings.
 *
 * @param scope Volume scope.
 * @param node Brush mesh or generator node.
 * @returns True when the node comes before the volume in its parent.
 */
export function modifierStackScopeHolds(scope: ModifierStackScope, node: THREE.Object3D): boolean {
  return modifierStackScopeTopOf(scope, node) !== null;
}

/**
 * Returns the earlier sibling of the volume a node belongs to: the top-level
 * compound of that node relative to the volume's parent.
 *
 * @param scope Volume scope.
 * @param node Brush mesh or generator node.
 * @returns The sibling, or null when the node is outside the scope.
 */
export function modifierStackScopeTopOf(scope: ModifierStackScope, node: THREE.Object3D): THREE.Object3D | null {
  for (let current: THREE.Object3D | null = node; current; current = current.parent) {
    if (current.parent === scope.parent) return scope.before.includes(current) ? current : null;
  }
  return null;
}
