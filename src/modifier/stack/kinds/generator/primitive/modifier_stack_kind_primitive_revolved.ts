import * as THREE from 'three';
import type { GeneratorRevolveFrame } from '@/generator/revolve/generator_revolve_brush.js';
import type { GeneratorRevolveStation } from '@/generator/revolve/generator_revolve_profile.js';
import type { ModifierStackField } from '@/modifier/stack/modifier_stack_types.js';
import { MODIFIER_STACK_CAP_TEXTURE_FIELDS } from '@/modifier/stack/kinds/generator/modifier_stack_generator_cap_textures.js';
import { MODIFIER_STACK_GENERATOR_SMOOTH_FIELD } from '@/modifier/stack/kinds/generator/modifier_stack_generator_smooth.js';
import { modifierStackRevolveWrapFields } from '@/modifier/stack/kinds/generator/modifier_stack_generator_revolve_wrap.js';
import { ModifierStackKindGeneratorRevolved } from '@/modifier/stack/kinds/generator/modifier_stack_kind_generator_revolved.js';
import {
  MODIFIER_STACK_PRIMITIVE_MAX_SIDES,
  modifierStackPrimitiveCount,
  modifierStackPrimitiveCountField,
} from './modifier_stack_primitive_fields.js';

/** Side count of the round rings of a revolved primitive. */
export const MODIFIER_STACK_PRIMITIVE_SIDES_FIELD = modifierStackPrimitiveCountField(
  'sides',
  'Sides',
  { default: 16, min: 3, max: MODIFIER_STACK_PRIMITIVE_MAX_SIDES },
  'Faces around the axis. More sides look rounder and cost more polygons.',
);

/**
 * Base class of round primitives revolved around the vertical axis of their
 * box. The widest ring touches the box on every side, so a box that is not
 * square makes an oval shape.
 */
export abstract class ModifierStackKindPrimitiveRevolved extends ModifierStackKindGeneratorRevolved {
  /** Fields of the shape itself, shown between Sides and the wrap fields. */
  protected abstract readonly shapeFields: readonly ModifierStackField[];
  protected override readonly shadingFields = [
    ...MODIFIER_STACK_CAP_TEXTURE_FIELDS,
    MODIFIER_STACK_GENERATOR_SMOOTH_FIELD,
  ];

  /**
   * Returns the profile of the shape: heights from the box bottom and radii, in
   * metres, bottom to top.
   *
   * @param parameters Normalized parameters.
   * @param height Box height.
   * @param radius Widest radius, half the box width.
   * @returns Stations.
   */
  protected abstract profile(
    parameters: Record<string, unknown>,
    height: number,
    radius: number,
  ): GeneratorRevolveStation[];

  /**
   * Returns Sides, the shape fields and the wrap fields.
   *
   * @returns Field list.
   */
  protected get specificFields(): readonly ModifierStackField[] {
    return [MODIFIER_STACK_PRIMITIVE_SIDES_FIELD, ...this.shapeFields, ...modifierStackRevolveWrapFields('metre')];
  }

  /**
   * Returns the side count summary.
   *
   * @param parameters Normalized parameters.
   * @returns Summary text.
   */
  override summary(parameters: Record<string, unknown>): string {
    return `${modifierStackPrimitiveCount(parameters, MODIFIER_STACK_PRIMITIVE_SIDES_FIELD)} sides`;
  }

  /**
   * Builds the profile fitted to the box.
   *
   * @param parameters Normalized parameters.
   * @param box Volume box in frame coordinates.
   * @returns Stations bottom to top.
   */
  protected stations(parameters: Record<string, unknown>, box: THREE.Box3): GeneratorRevolveStation[] {
    const size = box.getSize(new THREE.Vector3());
    return this.profile(parameters, size.y, size.x / 2);
  }

  /**
   * Returns the axis at the bottom centre, the side count and the depth to
   * width ratio of the box.
   *
   * @param parameters Normalized parameters.
   * @param box Volume box in frame coordinates.
   * @returns Revolve frame.
   */
  protected revolveFrame(parameters: Record<string, unknown>, box: THREE.Box3): GeneratorRevolveFrame {
    const size = box.getSize(new THREE.Vector3());
    return {
      center: box.getCenter(new THREE.Vector3()).setY(box.min.y),
      sides: modifierStackPrimitiveCount(parameters, MODIFIER_STACK_PRIMITIVE_SIDES_FIELD),
      aspect: size.z / Math.max(size.x, 1e-6),
    };
  }
}
