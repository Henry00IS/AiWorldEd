import type { GeneratorRevolveStation } from '@/generator/revolve/generator_revolve_profile.js';
import type { ModifierStackField } from '@/modifier/stack/modifier_stack_types.js';
import { ModifierStackKindPrimitiveRevolved } from './modifier_stack_kind_primitive_revolved.js';

/** Builds a round cylinder that fills its box: one convex brush. */
export class ModifierStackKindCylinder extends ModifierStackKindPrimitiveRevolved {
  readonly id = 'cylinder';
  readonly label = 'Cylinder';
  readonly description = 'Builds a round cylinder filling the volume, with flat caps and a seamless wrapped texture.';
  protected readonly shapeFields: readonly ModifierStackField[] = [];

  /**
   * Returns the straight profile from the bottom cap to the top cap.
   *
   * @param _parameters Normalized parameters.
   * @param height Box height.
   * @param radius Half the box width.
   * @returns Two stations.
   */
  protected profile(_parameters: Record<string, unknown>, height: number, radius: number): GeneratorRevolveStation[] {
    return [
      { height: 0, radius },
      { height, radius },
    ];
  }
}
