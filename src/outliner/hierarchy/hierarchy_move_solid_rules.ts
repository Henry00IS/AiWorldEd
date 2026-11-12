import type * as THREE from 'three';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { findSolidModelRoot, isSolidCsgGroup, isValidSolidTreeParent } from '@/solid/model/solid_group.js';

/**
 * Validates solid-model hierarchy constraints for a proposed reparent. Brushes
 * and solid CSG groups may nest under their solid root or solid CSG groups
 * inside the same solid, and so may generator nodes, which never leave their
 * solid model. Modifier volumes may also enter a solid's tree. Other non-solid
 * content cannot enter a solid tree.
 *
 * @param dragged Object being moved.
 * @param destinationParent Proposed parent.
 * @returns True when the move is safe for solid CSG ownership.
 */
export function hierarchyMoveSolidAllowed(dragged: THREE.Object3D, destinationParent: THREE.Object3D): boolean {
  if (SolidBrushVisual.isBrushObject(dragged) || ModifierVolume.isGenerator(dragged)) {
    return hierarchyMoveSolidBrushAllowed(dragged, destinationParent);
  }
  if (isSolidCsgGroup(dragged)) {
    return hierarchyMoveSolidGroupAllowed(dragged, destinationParent);
  }
  if (ModifierVolume.isVolume(dragged) && hierarchyMoveSolidTreeParentIs(destinationParent)) {
    return true;
  }
  if (SolidModel.isSolidModelObject(destinationParent) || isSolidCsgGroup(destinationParent)) {
    return false;
  }
  return !findSolidModelRoot(destinationParent);
}

/**
 * Returns whether a parent is a solid root or a solid CSG group.
 *
 * @param parent Candidate parent.
 * @returns True inside a solid's tree.
 */
function hierarchyMoveSolidTreeParentIs(parent: THREE.Object3D): boolean {
  const root = findSolidModelRoot(parent);
  return !!root && isValidSolidTreeParent(parent, parent, root);
}

/**
 * Validates reparent of a solid brush mesh or a generator node.
 *
 * @param dragged Brush mesh or generator node.
 * @param destinationParent Proposed parent.
 * @returns True when the object stays in its solid tree.
 */
function hierarchyMoveSolidBrushAllowed(dragged: THREE.Object3D, destinationParent: THREE.Object3D): boolean {
  const model = SolidModel.fromObject(dragged);
  if (!model) return false;
  return isValidSolidTreeParent(dragged, destinationParent, model.root);
}

/**
 * Validates reparent of a solid CSG group.
 *
 * @param dragged Solid CSG group.
 * @param destinationParent Proposed parent.
 * @returns True when the group stays in its solid tree.
 */
function hierarchyMoveSolidGroupAllowed(dragged: THREE.Object3D, destinationParent: THREE.Object3D): boolean {
  const solidRoot = findSolidModelRoot(dragged);
  if (!solidRoot) return false;
  if (destinationParent === dragged) return false;
  return isValidSolidTreeParent(dragged, destinationParent, solidRoot);
}
