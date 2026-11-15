import type * as THREE from 'three';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import type { ModifierStackField } from '@/modifier/stack/modifier_stack_types.js';
import { modifierStackChoices } from '@/modifier/stack/modifier_stack_fields.js';
import { ModifierStackKindPrimitiveFlat } from './modifier_stack_kind_primitive_flat.js';
import { modifierStackPrimitiveBoxCorners, modifierStackPrimitiveHullPieces } from './modifier_stack_primitive_hull.js';

/** Direction the slope climbs. */
const MODIFIER_STACK_WEDGE_DIRECTION_FIELD: ModifierStackField = {
  key: 'direction',
  label: 'Ascend',
  type: 'choice',
  default: '+z',
  choices: modifierStackChoices([
    ['+x', '+X'],
    ['-x', '−X'],
    ['+z', '+Z'],
    ['-z', '−Z'],
  ]),
  hint: 'Direction the slope climbs: the wedge is full height on that side and comes to an edge on the floor opposite.',
};

/** Builds a wedge (ramp) that fills its box: one convex brush. */
export class ModifierStackKindWedge extends ModifierStackKindPrimitiveFlat {
  readonly id = 'wedge';
  readonly label = 'Wedge';
  readonly description =
    'Builds a ramp filling the volume: a box cut diagonally from one top edge to the opposite bottom edge.';
  protected readonly specificFields: readonly ModifierStackField[] = [MODIFIER_STACK_WEDGE_DIRECTION_FIELD];

  /**
   * Returns the climb direction summary.
   *
   * @param parameters Normalized parameters.
   * @returns Summary text.
   */
  override summary(parameters: Record<string, unknown>): string {
    return `Ascends ${String(parameters['direction']).toUpperCase()}`;
  }

  /**
   * Keeps the bottom corners and the top corners on the high side.
   *
   * @param parameters Normalized parameters.
   * @param box Volume box in frame coordinates.
   * @returns The wedge.
   */
  protected buildPieces(parameters: Record<string, unknown>, box: THREE.Box3): SolidBrush[] {
    const direction = String(parameters['direction'] ?? '+z');
    const axis = direction.endsWith('x') ? 'x' : 'z';
    const high = direction.startsWith('-') ? box.min[axis] : box.max[axis];
    const corners = modifierStackPrimitiveBoxCorners(box).filter(
      (corner) => corner.y === box.min.y || corner[axis] === high,
    );
    return modifierStackPrimitiveHullPieces(corners);
  }
}
