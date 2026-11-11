import type * as THREE from 'three';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';
import { findSolidModelRoot, isSolidCsgGroup, isValidSolidTreeParent } from '@/solid/model/solid_group.js';

/** Where a new brush or generator goes under a solid model. */
export interface SolidModelInsertSlot {
  /** Solid root or CSG group that receives the new node. */
  parent: THREE.Object3D;
  /** Sibling the new node follows, or null to append. */
  after: THREE.Object3D | null;
}

/**
 * Maps a selected object to an insert slot under a model: the solid root
 * appends to itself, a brush appends to its parent, and a CSG group places the
 * new node right after itself in its own parent.
 *
 * @param model Active solid model.
 * @param object Selected hierarchy object.
 * @returns Insert slot, or null when the object implies none for this model.
 */
export function solidModelInsertSlotFromObject(model: SolidModel, object: THREE.Object3D): SolidModelInsertSlot | null {
  if (object === model.root) return { parent: model.root, after: null };
  const parent = object.parent;
  if (!parent || !solidModelInsertSlotParentValid(model, parent)) return null;
  if (isSolidCsgGroup(object) && findSolidModelRoot(object) === model.root) return { parent, after: object };
  if (SolidBrushVisual.isBrushObject(object) && SolidModel.fromObject(object) === model) return { parent, after: null };
  return null;
}

/**
 * Returns whether a parent may receive new brushes for a model.
 *
 * @param model Solid model.
 * @param parent Candidate parent.
 * @returns True when the parent is the solid root or a CSG group under it.
 */
export function solidModelInsertSlotParentValid(model: SolidModel, parent: THREE.Object3D): boolean {
  return isValidSolidTreeParent(model.root, parent, model.root);
}
