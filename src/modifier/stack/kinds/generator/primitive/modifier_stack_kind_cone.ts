import type { GeneratorRevolveStation } from '@/generator/revolve/generator_revolve_profile.js';
import type { ModifierStackField } from '@/modifier/stack/modifier_stack_types.js';
import { ModifierStackKindPrimitiveRevolved } from './modifier_stack_kind_primitive_revolved.js';
import { modifierStackPrimitiveValue } from './modifier_stack_primitive_fields.js';

/** Radius of the top as a fraction of the base radius. */
const MODIFIER_STACK_CONE_TOP_FIELD: ModifierStackField = {
  key: 'topRadius',
  label: 'Top Radius',
  type: 'number',
  default: 0,
  min: 0,
  max: 1,
  step: 0.05,
  hint: 'Radius of the top relative to the base. 0 makes a pointed cone; above 0 cuts it flat into a frustum, like a lampshade or a tapered pillar.',
};

/** Builds a cone or frustum that fills its box: one convex brush. */
export class ModifierStackKindCone extends ModifierStackKindPrimitiveRevolved {
  readonly id = 'cone';
  readonly label = 'Cone';
  readonly description = 'Builds a pointed cone or a flat-topped frustum filling the volume.';
  protected readonly shapeFields: readonly ModifierStackField[] = [MODIFIER_STACK_CONE_TOP_FIELD];

  /**
   * Returns the straight profile from the base to the tip or top cap.
   *
   * @param parameters Normalized parameters.
   * @param height Box height.
   * @param radius Half the box width.
   * @returns Two stations.
   */
  protected profile(parameters: Record<string, unknown>, height: number, radius: number): GeneratorRevolveStation[] {
    return [
      { height: 0, radius },
      { height, radius: radius * modifierStackPrimitiveValue(parameters, MODIFIER_STACK_CONE_TOP_FIELD) },
    ];
  }
}
