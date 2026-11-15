import * as THREE from 'three';
import type { ModifierStackField } from '@/modifier/stack/modifier_stack_types.js';
import { ModifierStackKindPrimitiveSwept } from './modifier_stack_kind_primitive_swept.js';
import type { ModifierStackSweepCell } from './modifier_stack_primitive_sweep.js';
import {
  modifierStackRingAngles,
  modifierStackRingFrame,
  modifierStackRingInsetLimit,
  modifierStackRingPoint,
  type ModifierStackRingFrame,
} from './modifier_stack_primitive_ring.js';
import {
  MODIFIER_STACK_PRIMITIVE_MAX_SIDES,
  modifierStackPrimitiveCount,
  modifierStackPrimitiveCountField,
  modifierStackPrimitiveSweepField,
  modifierStackPrimitiveValue,
} from './modifier_stack_primitive_fields.js';

/** Segments around the ring. */
const MODIFIER_STACK_TORUS_RING_FIELD = modifierStackPrimitiveCountField(
  'ringSides',
  'Ring Sides',
  { default: 16, min: 3, max: MODIFIER_STACK_PRIMITIVE_MAX_SIDES },
  'Segments around the ring; each segment is one convex brush. More sides look rounder.',
);

/** Faces around the tube. */
const MODIFIER_STACK_TORUS_TUBE_FIELD = modifierStackPrimitiveCountField(
  'tubeSides',
  'Tube Sides',
  { default: 8, min: 3, max: 32 },
  'Faces around the tube. Even counts give the tube a flat top to walk on.',
);

/** Tube radius as a fraction of the ring radius. */
const MODIFIER_STACK_TORUS_THICKNESS_FIELD: ModifierStackField = {
  key: 'thickness',
  label: 'Tube Thickness',
  type: 'number',
  default: 0.25,
  min: 0.02,
  max: 0.5,
  step: 0.05,
  hint: 'Tube radius relative to half the volume width. 0.5 closes the hole in the middle. The tube is as tall as the volume.',
};

/** How far the ring turns. */
const MODIFIER_STACK_TORUS_SWEEP_FIELD = modifierStackPrimitiveSweepField(
  360,
  360,
  'How far the ring turns, in degrees, counter-clockwise from the +X side seen from above. Below 360 leaves an open bend with flat ends, like a pipe elbow.',
);

/**
 * Builds a torus (ring) that fills its box: the tube cross-section turned
 * around the axis, one convex brush per segment.
 */
export class ModifierStackKindTorus extends ModifierStackKindPrimitiveSwept {
  readonly id = 'torus';
  readonly label = 'Torus';
  readonly description =
    'Builds a ring with a round tube filling the volume, or an open bend, one convex brush per segment.';
  protected override readonly smoothAll = true;
  protected readonly specificFields: readonly ModifierStackField[] = [
    MODIFIER_STACK_TORUS_RING_FIELD,
    MODIFIER_STACK_TORUS_TUBE_FIELD,
    MODIFIER_STACK_TORUS_THICKNESS_FIELD,
    MODIFIER_STACK_TORUS_SWEEP_FIELD,
  ];

  /**
   * Returns the ring and tube side counts.
   *
   * @param parameters Normalized parameters.
   * @returns Summary text.
   */
  override summary(parameters: Record<string, unknown>): string {
    const ring = modifierStackPrimitiveCount(parameters, MODIFIER_STACK_TORUS_RING_FIELD);
    return `${ring} × ${modifierStackPrimitiveCount(parameters, MODIFIER_STACK_TORUS_TUBE_FIELD)} sides`;
  }

  /**
   * Turns the tube outline from segment to segment.
   *
   * @param parameters Normalized parameters.
   * @param box Volume box in frame coordinates.
   * @returns Cells in sweep order.
   */
  protected cells(parameters: Record<string, unknown>, box: THREE.Box3): ModifierStackSweepCell[] {
    const frame = modifierStackRingFrame(box);
    const angles = modifierStackRingAngles(
      modifierStackPrimitiveValue(parameters, MODIFIER_STACK_TORUS_SWEEP_FIELD),
      modifierStackPrimitiveCount(parameters, MODIFIER_STACK_TORUS_RING_FIELD),
    );
    const outline = (angle: number) => this.tubeOutline(parameters, box, frame, angle);
    return angles.slice(1).map((angle, index) => ({ start: outline(angles[index] ?? 0), end: outline(angle) }));
  }

  /**
   * Returns the tube cross-section at one angle, turned so even side counts
   * have a level top and bottom face, and stretched so it touches the volume
   * top, bottom and outside.
   *
   * @param parameters Normalized parameters.
   * @param box Volume box in frame coordinates.
   * @param frame Ring frame.
   * @param angle Angle in radians.
   * @returns Outline corners.
   */
  private tubeOutline(
    parameters: Record<string, unknown>,
    box: THREE.Box3,
    frame: ModifierStackRingFrame,
    angle: number,
  ): THREE.Vector3[] {
    const thickness = modifierStackPrimitiveValue(parameters, MODIFIER_STACK_TORUS_THICKNESS_FIELD);
    const tube = Math.min(thickness * Math.min(frame.radiusX, frame.radiusZ), modifierStackRingInsetLimit(frame) / 2);
    const middle = (box.min.y + box.max.y) / 2;
    const rise = (box.max.y - box.min.y) / 2;
    return modifierStackTorusUnitOutline(modifierStackPrimitiveCount(parameters, MODIFIER_STACK_TORUS_TUBE_FIELD)).map(
      (point) => modifierStackRingPoint(frame, angle, tube * (1 - point.x), middle + rise * point.y),
    );
  }
}

/**
 * Returns a regular tube outline with a level top and bottom for even side
 * counts, stretched to span -1 to 1 on both axes. X points outward.
 *
 * @param sides Side count.
 * @returns Outline corners.
 */
function modifierStackTorusUnitOutline(sides: number): THREE.Vector2[] {
  const corners = Array.from({ length: sides }, (_, index) => {
    const turn = (2 * Math.PI * (index + 0.5)) / sides;
    return new THREE.Vector2(Math.cos(turn), Math.sin(turn));
  });
  const box = new THREE.Box2().setFromPoints(corners);
  return corners.map(
    (corner) =>
      new THREE.Vector2(
        ((corner.x - box.min.x) / Math.max(box.max.x - box.min.x, 1e-9)) * 2 - 1,
        ((corner.y - box.min.y) / Math.max(box.max.y - box.min.y, 1e-9)) * 2 - 1,
      ),
  );
}
