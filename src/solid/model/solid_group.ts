import * as THREE from 'three';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { NotificationGlobal } from '@/audio/notification/notification_global.js';
import { isSolidModelObject } from './solid_model_keys.js';

/** UserData key marking a group that participates in solid hierarchical CSG. */
export const SOLID_CSG_GROUP_USERDATA_KEY = 'isSolidCsgGroup';

/** UserData key storing the CSG operation of a solid compound group. */
export const SOLID_GROUP_OPERATION_USERDATA_KEY = 'solidGroupOperation';

/**
 * Returns whether an object is a solid CSG compound group (branch node).
 *
 * @param object Candidate scene object.
 * @returns True when the object is a marked solid CSG group.
 */
export function isSolidCsgGroup(object: THREE.Object3D): boolean {
  return object instanceof THREE.Group && object.userData[SOLID_CSG_GROUP_USERDATA_KEY] === true;
}

/**
 * Marks a Three.js group as a solid CSG compound and sets its operation.
 *
 * @param group Group that will combine child brushes as one operand.
 * @param operation CSG operation applied when combining the compound into its
 *   parent.
 */
export function markAsSolidCsgGroup(group: THREE.Group, operation: SolidOperation = SolidOperation.Additive): void {
  group.userData[SOLID_CSG_GROUP_USERDATA_KEY] = true;
  setSolidGroupOperation(group, operation);
}

/**
 * Reads the CSG operation stored on a solid compound group.
 *
 * @param group Solid CSG group or any object with operation userData.
 * @returns Operation, defaulting to additive when unset or invalid.
 */
export function getSolidGroupOperation(group: THREE.Object3D): SolidOperation {
  const value = group.userData[SOLID_GROUP_OPERATION_USERDATA_KEY];
  if (value === SolidOperation.Subtractive) return SolidOperation.Subtractive;
  if (value === SolidOperation.Intersecting) return SolidOperation.Intersecting;
  if (value === SolidOperation.PassThrough) return SolidOperation.PassThrough;
  if (value === 'subtractive') return SolidOperation.Subtractive;
  if (value === 'intersecting') return SolidOperation.Intersecting;
  return SolidOperation.Additive;
}

/**
 * Returns whether an object is a solid CSG group whose operation is
 * pass-through, so its children join its parent as if they were not grouped.
 *
 * @param object Candidate scene object.
 * @returns True for a pass-through solid CSG group.
 */
export function isSolidPassThroughGroup(object: THREE.Object3D): boolean {
  return isSolidCsgGroup(object) && getSolidGroupOperation(object) === SolidOperation.PassThrough;
}

/**
 * Stores a CSG operation on a solid compound group.
 *
 * @param group Solid CSG group.
 * @param operation Operation to store.
 */
export function setSolidGroupOperation(group: THREE.Object3D, operation: SolidOperation): void {
  const previous = group.userData[SOLID_GROUP_OPERATION_USERDATA_KEY];
  group.userData[SOLID_GROUP_OPERATION_USERDATA_KEY] = operation;
  group.userData[SOLID_CSG_GROUP_USERDATA_KEY] = true;
  if (previous !== operation) {
    NotificationGlobal.onSolidCsgOperationFlipped();
  }
}

/**
 * Walks parents to find the solid model root that owns an object.
 *
 * @param object Brush, group, or other solid descendant.
 * @returns Solid model root group, or null when not under a solid.
 */
export function findSolidModelRoot(object: THREE.Object3D): THREE.Object3D | null {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (isSolidModelObject(current)) return current;
    current = current.parent;
  }
  return null;
}

/**
 * Returns whether a destination parent is valid for solid brush / solid group
 * reparenting: the parent must be the solid root or a solid CSG group under the
 * same solid root as the dragged object.
 *
 * @param _dragged Object being moved (reserved for future same-root checks).
 * @param destinationParent Proposed parent.
 * @param solidRoot Owning solid model root.
 * @returns True when the move keeps the CSG tree well-formed.
 */
export function isValidSolidTreeParent(
  _dragged: THREE.Object3D,
  destinationParent: THREE.Object3D,
  solidRoot: THREE.Object3D,
): boolean {
  void _dragged;
  if (destinationParent === solidRoot) return true;
  if (!isSolidCsgGroup(destinationParent)) return false;
  return findSolidModelRoot(destinationParent) === solidRoot;
}
