import type { GeneratorRevolveStation } from '@/generator/revolve/generator_revolve_profile.js';
import type { ModifierStackField } from '@/modifier/stack/modifier_stack_types.js';
import { ModifierStackKindPrimitiveRevolved } from './modifier_stack_kind_primitive_revolved.js';
import { modifierStackPrimitiveCount, modifierStackPrimitiveCountField } from './modifier_stack_primitive_fields.js';
import { modifierStackPrimitiveArcStations } from './modifier_stack_primitive_arc.js';

/** Rings of each rounded end. */
const MODIFIER_STACK_CAPSULE_RINGS_FIELD = modifierStackPrimitiveCountField(
  'capRings',
  'Cap Rings',
  { default: 4, min: 1, max: 16 },
  'Bands of each rounded end. More rings look rounder and cost more polygons.',
);

/**
 * Builds a capsule that fills its box: a cylinder with half-sphere ends. The
 * ends are as tall as the radius while the box is tall enough, so they stay
 * round when the capsule is stretched; the whole shape is one convex brush.
 */
export class ModifierStackKindCapsule extends ModifierStackKindPrimitiveRevolved {
  readonly id = 'capsule';
  readonly label = 'Capsule';
  readonly description = 'Builds a cylinder with rounded ends filling the volume as one convex solid.';
  protected readonly shapeFields: readonly ModifierStackField[] = [MODIFIER_STACK_CAPSULE_RINGS_FIELD];

  /**
   * Samples the bottom end, the straight middle and the top end.
   *
   * @param parameters Normalized parameters.
   * @param height Box height.
   * @param radius Half the box width.
   * @returns Stations from the bottom pole to the top pole.
   */
  protected profile(parameters: Record<string, unknown>, height: number, radius: number): GeneratorRevolveStation[] {
    const segments = modifierStackPrimitiveCount(parameters, MODIFIER_STACK_CAPSULE_RINGS_FIELD);
    const cap = Math.min(radius, height / 2);
    const end = { segments, rise: cap, radius };
    return [
      ...modifierStackPrimitiveArcStations({ ...end, from: -Math.PI / 2, to: 0, equator: cap }),
      ...modifierStackPrimitiveArcStations({ ...end, from: 0, to: Math.PI / 2, equator: height - cap }),
    ];
  }
}
