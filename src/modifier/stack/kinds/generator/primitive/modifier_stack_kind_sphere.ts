import type { GeneratorRevolveStation } from '@/generator/revolve/generator_revolve_profile.js';
import type { ModifierStackField } from '@/modifier/stack/modifier_stack_types.js';
import { modifierStackChoices } from '@/modifier/stack/modifier_stack_fields.js';
import { ModifierStackKindPrimitiveRevolved } from './modifier_stack_kind_primitive_revolved.js';
import { modifierStackPrimitiveCount, modifierStackPrimitiveCountField } from './modifier_stack_primitive_fields.js';
import { modifierStackPrimitiveArcStations } from './modifier_stack_primitive_arc.js';

/** Rings from the bottom to the top of the sphere. */
const MODIFIER_STACK_SPHERE_RINGS_FIELD = modifierStackPrimitiveCountField(
  'rings',
  'Rings',
  { default: 8, min: 2, max: 32 },
  'Bands from the bottom to the top. More rings look rounder and cost more polygons.',
);

/** Whole sphere or upper half. */
const MODIFIER_STACK_SPHERE_COVERAGE_FIELD: ModifierStackField = {
  key: 'coverage',
  label: 'Shape',
  type: 'choice',
  default: 'Full Sphere',
  choices: modifierStackChoices([
    ['Full Sphere', 'Full Sphere'],
    ['Dome', 'Dome'],
  ]),
  hint: 'Full Sphere fills the volume with a ball; Dome builds the upper half with a flat base, for domes and cupolas.',
};

/**
 * Builds a sphere or dome that fills its box. The profile curves inward the
 * whole way, so the result is a single convex brush.
 */
export class ModifierStackKindSphere extends ModifierStackKindPrimitiveRevolved {
  readonly id = 'sphere';
  readonly label = 'Sphere';
  readonly description = 'Builds a sphere or a dome filling the volume as one convex solid.';
  protected readonly shapeFields: readonly ModifierStackField[] = [
    MODIFIER_STACK_SPHERE_COVERAGE_FIELD,
    MODIFIER_STACK_SPHERE_RINGS_FIELD,
  ];

  /**
   * Samples the sphere or dome outline.
   *
   * @param parameters Normalized parameters.
   * @param height Box height.
   * @param radius Half the box width.
   * @returns Stations from the bottom pole or base to the top pole.
   */
  protected profile(parameters: Record<string, unknown>, height: number, radius: number): GeneratorRevolveStation[] {
    const segments = modifierStackPrimitiveCount(parameters, MODIFIER_STACK_SPHERE_RINGS_FIELD);
    if (parameters['coverage'] === 'Dome')
      return modifierStackPrimitiveArcStations({
        from: 0,
        to: Math.PI / 2,
        segments,
        equator: 0,
        rise: height,
        radius,
      });
    const half = height / 2;
    return modifierStackPrimitiveArcStations({
      from: -Math.PI / 2,
      to: Math.PI / 2,
      segments,
      equator: half,
      rise: half,
      radius,
    });
  }
}
