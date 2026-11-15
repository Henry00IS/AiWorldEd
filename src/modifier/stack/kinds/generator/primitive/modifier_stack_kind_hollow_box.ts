import * as THREE from 'three';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import type { ModifierStackField } from '@/modifier/stack/modifier_stack_types.js';
import { ModifierStackKindPrimitiveFlat } from './modifier_stack_kind_primitive_flat.js';
import { modifierStackPrimitiveBoxCorners, modifierStackPrimitiveHullPieces } from './modifier_stack_primitive_hull.js';
import { modifierStackPrimitiveValue } from './modifier_stack_primitive_fields.js';

/** Thickness of every wall, the floor and the ceiling. */
const MODIFIER_STACK_HOLLOW_BOX_WALL_FIELD: ModifierStackField = {
  key: 'wallThickness',
  label: 'Wall Thickness',
  type: 'number',
  default: 0.25,
  min: 0.01,
  max: 100,
  step: 0.05,
  hint: 'Thickness in metres of the walls, the floor and the ceiling, measured inward from the volume.',
};

/** Leaves the ceiling out. */
const MODIFIER_STACK_HOLLOW_BOX_OPEN_FIELD: ModifierStackField = {
  key: 'openTop',
  label: 'Open Top',
  type: 'boolean',
  default: false,
  hint: 'Leaves the ceiling out, for courtyards, pools and roofless ruins.',
};

/**
 * Builds a hollow box that fills its box: floor, ceiling and four walls as six
 * convex brushes that meet without overlapping, ready to be a room.
 */
export class ModifierStackKindHollowBox extends ModifierStackKindPrimitiveFlat {
  readonly id = 'hollowBox';
  readonly label = 'Hollow Box';
  readonly description = 'Builds a room shell filling the volume: floor, ceiling and four walls of one thickness.';
  protected readonly specificFields: readonly ModifierStackField[] = [
    MODIFIER_STACK_HOLLOW_BOX_WALL_FIELD,
    MODIFIER_STACK_HOLLOW_BOX_OPEN_FIELD,
  ];

  /**
   * Returns the wall thickness summary.
   *
   * @param parameters Normalized parameters.
   * @returns Summary text.
   */
  override summary(parameters: Record<string, unknown>): string {
    return `${modifierStackPrimitiveValue(parameters, MODIFIER_STACK_HOLLOW_BOX_WALL_FIELD)} m walls`;
  }

  /**
   * Builds the floor and ceiling across the whole box, the X walls between them
   * and the Z walls between the X walls. A wall too thick for the box fills
   * it.
   *
   * @param parameters Normalized parameters.
   * @param box Volume box in frame coordinates.
   * @returns Pieces.
   */
  protected buildPieces(parameters: Record<string, unknown>, box: THREE.Box3): SolidBrush[] {
    const size = box.getSize(new THREE.Vector3());
    const wall = modifierStackPrimitiveValue(parameters, MODIFIER_STACK_HOLLOW_BOX_WALL_FIELD);
    if (wall * 2 >= Math.min(size.x, size.y, size.z))
      return modifierStackPrimitiveHullPieces(modifierStackPrimitiveBoxCorners(box));
    const inner = new THREE.Box3(box.min.clone().addScalar(wall), box.max.clone().subScalar(wall));
    const slabs = modifierStackHollowBoxSlabs(box, inner, parameters['openTop'] === true);
    return slabs.flatMap((slab) => modifierStackPrimitiveHullPieces(modifierStackPrimitiveBoxCorners(slab)));
  }
}

/**
 * Returns the slabs of a hollow box: floor, ceiling unless open, the X walls
 * between them and the Z walls between the X walls.
 *
 * @param box Outer box.
 * @param inner Room inside the walls.
 * @param open True leaves the ceiling out and runs the walls to the top.
 * @returns Slab boxes.
 */
function modifierStackHollowBoxSlabs(box: THREE.Box3, inner: THREE.Box3, open: boolean): THREE.Box3[] {
  const top = open ? box.max.y : inner.max.y;
  const slab = (min: [number, number, number], max: [number, number, number]) =>
    new THREE.Box3(new THREE.Vector3(...min), new THREE.Vector3(...max));
  return [
    slab([box.min.x, box.min.y, box.min.z], [box.max.x, inner.min.y, box.max.z]),
    ...(open ? [] : [slab([box.min.x, inner.max.y, box.min.z], [box.max.x, box.max.y, box.max.z])]),
    slab([box.min.x, inner.min.y, box.min.z], [inner.min.x, top, box.max.z]),
    slab([inner.max.x, inner.min.y, box.min.z], [box.max.x, top, box.max.z]),
    slab([inner.min.x, inner.min.y, box.min.z], [inner.max.x, top, inner.min.z]),
    slab([inner.min.x, inner.min.y, inner.max.z], [inner.max.x, top, box.max.z]),
  ];
}
