import * as THREE from 'three';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import type { ModifierStackField } from '@/modifier/stack/modifier_stack_types.js';
import { modifierStackChoices } from '@/modifier/stack/modifier_stack_fields.js';
import { ModifierStackKindPrimitiveFlat } from './modifier_stack_kind_primitive_flat.js';
import { modifierStackPrimitiveHullPieces } from './modifier_stack_primitive_hull.js';
import { modifierStackPrimitiveCount, modifierStackPrimitiveCountField } from './modifier_stack_primitive_fields.js';

/** Corners of the cross-section. */
const MODIFIER_STACK_PRISM_SIDES_FIELD = modifierStackPrimitiveCountField(
  'sides',
  'Sides',
  { default: 3, min: 3, max: 12 },
  'Corners of the cross-section: 3 is a triangular prism such as a gable roof, 6 a hexagonal one.',
);

/** Axis the prism runs along. */
const MODIFIER_STACK_PRISM_AXIS_FIELD: ModifierStackField = {
  key: 'axis',
  label: 'Axis',
  type: 'choice',
  default: 'Along Z',
  choices: modifierStackChoices([
    ['Along Z', 'Along Z'],
    ['Along X', 'Along X'],
    ['Upright', 'Upright'],
  ]),
  hint: 'Direction the prism runs. Lying prisms have a flat face on the floor; upright prisms have a flat face toward -Z.',
};

/** Axes of the cross-section plane for each prism axis: right, then up. */
const MODIFIER_STACK_PRISM_PLANES = {
  'Along X': ['z', 'y'],
  Upright: ['x', 'z'],
  'Along Z': ['x', 'y'],
} as const;

/**
 * Builds a straight prism with a regular cross-section stretched to fill its
 * box: one convex brush with flat faces.
 */
export class ModifierStackKindPrism extends ModifierStackKindPrimitiveFlat {
  readonly id = 'prism';
  readonly label = 'Prism';
  readonly description =
    'Builds a straight prism with a regular cross-section, such as a gable roof, filling the volume.';
  protected readonly specificFields: readonly ModifierStackField[] = [
    MODIFIER_STACK_PRISM_SIDES_FIELD,
    MODIFIER_STACK_PRISM_AXIS_FIELD,
  ];

  /**
   * Returns the side count summary.
   *
   * @param parameters Normalized parameters.
   * @returns Summary text.
   */
  override summary(parameters: Record<string, unknown>): string {
    return `${modifierStackPrimitiveCount(parameters, MODIFIER_STACK_PRISM_SIDES_FIELD)} sides`;
  }

  /**
   * Places the cross-section at both ends of the box.
   *
   * @param parameters Normalized parameters.
   * @param box Volume box in frame coordinates.
   * @returns The prism.
   */
  protected buildPieces(parameters: Record<string, unknown>, box: THREE.Box3): SolidBrush[] {
    const axis = String(parameters['axis'] ?? 'Along Z');
    const planes =
      axis === 'Along X' || axis === 'Upright' || axis === 'Along Z'
        ? MODIFIER_STACK_PRISM_PLANES[axis]
        : MODIFIER_STACK_PRISM_PLANES['Along Z'];
    const [right, up] = planes;
    const run = axis === 'Along X' ? 'x' : axis === 'Upright' ? 'y' : 'z';
    const outline = modifierStackPrismUnitOutline(
      modifierStackPrimitiveCount(parameters, MODIFIER_STACK_PRISM_SIDES_FIELD),
    );
    const points = [box.min[run], box.max[run]].flatMap((depth) =>
      outline.map((corner) => {
        const point = new THREE.Vector3();
        point[right] = THREE.MathUtils.lerp(box.min[right], box.max[right], corner.x);
        point[up] = THREE.MathUtils.lerp(box.min[up], box.max[up], corner.y);
        point[run] = depth;
        return point;
      }),
    );
    return modifierStackPrimitiveHullPieces(points);
  }
}

/**
 * Returns a regular polygon with a flat bottom edge, stretched to span 0 to 1
 * on both axes.
 *
 * @param sides Corner count.
 * @returns Outline corners.
 */
function modifierStackPrismUnitOutline(sides: number): THREE.Vector2[] {
  const corners = Array.from({ length: sides }, (_, index) => {
    const turn = -Math.PI / 2 + Math.PI / sides + (2 * Math.PI * index) / sides;
    return new THREE.Vector2(Math.cos(turn), Math.sin(turn));
  });
  const bounds = new THREE.Box2().setFromPoints(corners);
  const size = bounds.getSize(new THREE.Vector2());
  return corners.map(
    (corner) => new THREE.Vector2((corner.x - bounds.min.x) / size.x, (corner.y - bounds.min.y) / size.y),
  );
}
