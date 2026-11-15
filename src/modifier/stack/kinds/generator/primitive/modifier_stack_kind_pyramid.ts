import * as THREE from 'three';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import type { ModifierStackField } from '@/modifier/stack/modifier_stack_types.js';
import { ModifierStackKindPrimitiveFlat } from './modifier_stack_kind_primitive_flat.js';
import { modifierStackPrimitiveBoxCorners, modifierStackPrimitiveHullPieces } from './modifier_stack_primitive_hull.js';
import { modifierStackPrimitiveValue } from './modifier_stack_primitive_fields.js';

/** Size of the flat top relative to the base. */
const MODIFIER_STACK_PYRAMID_TOP_FIELD: ModifierStackField = {
  key: 'topSize',
  label: 'Top Size',
  type: 'number',
  default: 0,
  min: 0,
  max: 1,
  step: 0.05,
  hint: 'Size of the top relative to the base. 0 makes a pointed pyramid; above 0 cuts it flat, like a plinth or a stepped temple tier; 1 is a box.',
};

/** Builds a pyramid or truncated pyramid on the box floor: one convex brush. */
export class ModifierStackKindPyramid extends ModifierStackKindPrimitiveFlat {
  readonly id = 'pyramid';
  readonly label = 'Pyramid';
  readonly description = 'Builds a pyramid on the volume floor, pointed or cut flat at the top.';
  protected readonly specificFields: readonly ModifierStackField[] = [MODIFIER_STACK_PYRAMID_TOP_FIELD];

  /**
   * Joins the base rectangle with the top rectangle or apex.
   *
   * @param parameters Normalized parameters.
   * @param box Volume box in frame coordinates.
   * @returns The pyramid.
   */
  protected buildPieces(parameters: Record<string, unknown>, box: THREE.Box3): SolidBrush[] {
    const top = modifierStackPrimitiveValue(parameters, MODIFIER_STACK_PYRAMID_TOP_FIELD);
    const center = box.getCenter(new THREE.Vector3());
    const corners = modifierStackPrimitiveBoxCorners(box).map((corner) =>
      corner.y === box.min.y
        ? corner
        : corner
            .sub(center)
            .multiply(new THREE.Vector3(top, 1, top))
            .add(center),
    );
    return modifierStackPrimitiveHullPieces(corners);
  }
}
