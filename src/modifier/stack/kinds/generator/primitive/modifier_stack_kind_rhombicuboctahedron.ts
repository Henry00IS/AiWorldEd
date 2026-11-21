import type * as THREE from 'three';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import type { ModifierStackField } from '@/modifier/stack/modifier_stack_types.js';
import { modifierStackChoices } from '@/modifier/stack/modifier_stack_fields.js';
import {
  GENERATOR_RHOMBICUBOCTAHEDRON_PRECISIONS,
  generatorRhombicuboctahedronPointsInBox,
  type GeneratorRhombicuboctahedronPrecision,
} from '@/generator/rhombicuboctahedron/generator_rhombicuboctahedron.js';
import { ModifierStackKindPrimitiveFlat } from './modifier_stack_kind_primitive_flat.js';
import { modifierStackPrimitiveHullPieces } from './modifier_stack_primitive_hull.js';

/** Grid Aligned or Precise corners. */
const MODIFIER_STACK_RHOMBICUBOCTAHEDRON_PRECISION_FIELD: ModifierStackField = {
  key: 'precision',
  label: 'Precision',
  type: 'choice',
  default: 'Grid Aligned',
  choices: modifierStackChoices(GENERATOR_RHOMBICUBOCTAHEDRON_PRECISIONS.map((value) => [value, value] as const)),
  hint: 'Grid Aligned keeps every corner on the grid and every slanted face at exactly 45°; its edge faces are long rectangles. Precise is the true shape with square faces, but its corners sit off the grid.',
};

/** Builds a rhombicuboctahedron filling the box: one convex brush with 26 faces. */
export class ModifierStackKindRhombicuboctahedron extends ModifierStackKindPrimitiveFlat {
  readonly id = 'rhombicuboctahedron';
  readonly label = 'Rhombicuboctahedron';
  readonly description =
    'Builds a rhombicuboctahedron filling the volume: a cube with its edges and corners cut off at 45°, 26 faces in all.';
  protected readonly specificFields: readonly ModifierStackField[] = [
    MODIFIER_STACK_RHOMBICUBOCTAHEDRON_PRECISION_FIELD,
  ];

  /**
   * Wraps the corners of the chosen precision fitted into the box.
   *
   * @param parameters Normalized parameters.
   * @param box Volume box in frame coordinates.
   * @returns The rhombicuboctahedron.
   */
  protected buildPieces(parameters: Record<string, unknown>, box: THREE.Box3): SolidBrush[] {
    const precision: GeneratorRhombicuboctahedronPrecision =
      parameters['precision'] === 'Precise' ? 'Precise' : 'Grid Aligned';
    return modifierStackPrimitiveHullPieces(generatorRhombicuboctahedronPointsInBox(precision, box));
  }
}
