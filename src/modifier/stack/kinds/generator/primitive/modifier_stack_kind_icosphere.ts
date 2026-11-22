import * as THREE from 'three';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import type { ModifierStackField } from '@/modifier/stack/modifier_stack_types.js';
import { generatorIcosphere } from '@/generator/icosphere/generator_icosphere.js';
import { ModifierStackKindPrimitiveFlat } from './modifier_stack_kind_primitive_flat.js';
import { modifierStackPrimitiveHullPieces } from './modifier_stack_primitive_hull.js';
import { modifierStackPrimitiveCount, modifierStackPrimitiveCountField } from './modifier_stack_primitive_fields.js';

/** How many times the icosahedron's triangles are split. */
const MODIFIER_STACK_ICOSPHERE_SUBDIVISIONS_FIELD = modifierStackPrimitiveCountField(
  'subdivisions',
  'Subdivisions',
  { default: 2, min: 1, max: 4 },
  '1 is an icosahedron of 20 triangles; each step splits every triangle into four, so 2 gives 80 and 4 gives 1280. More looks rounder and costs more polygons.',
);

/** Builds a sphere of even triangles filling the box: one convex brush. */
export class ModifierStackKindIcosphere extends ModifierStackKindPrimitiveFlat {
  readonly id = 'icosphere';
  readonly label = 'Icosphere';
  readonly description =
    'Builds a sphere of even triangles filling the volume, from an icosahedron split into finer triangles.';
  protected readonly specificFields: readonly ModifierStackField[] = [MODIFIER_STACK_ICOSPHERE_SUBDIVISIONS_FIELD];

  /**
   * Wraps the sphere's corners stretched to the box.
   *
   * @param parameters Normalized parameters.
   * @param box Volume box in frame coordinates.
   * @returns The icosphere.
   */
  protected buildPieces(parameters: Record<string, unknown>, box: THREE.Box3): SolidBrush[] {
    const subdivisions = modifierStackPrimitiveCount(parameters, MODIFIER_STACK_ICOSPHERE_SUBDIVISIONS_FIELD);
    const center = box.getCenter(new THREE.Vector3());
    const half = box.getSize(new THREE.Vector3()).multiplyScalar(0.5);
    return modifierStackPrimitiveHullPieces(
      generatorIcosphere(subdivisions).points.map((point) => point.multiply(half).add(center)),
    );
  }
}
