import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { TransformProjectionMath } from '@/transform/core/transform_projection_math.js';
import { resolveKeyboardAxisOrientation } from '@/transform/modal/transform_modal_axis_orientation.js';
import { transformModalAxisWorldVector } from '@/transform/modal/transform_modal_axis_vector.js';
import { transformModalConstrainTranslationDelta } from '@/transform/modal/transform_modal_delta_constrain.js';
import { TransformModalAxis } from '@/transform/modal/transform_modal_axis.js';
import { GridSnap } from '@/transform/snap/grid_snap.js';
import { GizmoAxis } from '@/types/transform_mode.js';

const MODAL_AXES = [TransformModalAxis.X, TransformModalAxis.Y, TransformModalAxis.Z];

/**
 * Builds a quarter-turn quaternion about world Z.
 *
 * @returns Orientation quaternion.
 */
function quarterTurnAboutZ(): THREE.Quaternion {
  return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
}

/**
 * Builds a one-third turn quaternion about world X.
 *
 * @returns Orientation quaternion.
 */
function thirdTurnAboutX(): THREE.Quaternion {
  return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 3);
}

/**
 * Returns the unrotated unit vector for a modal axis.
 *
 * @param axis Modal axis.
 * @returns Unit vector before orientation is applied.
 */
function unitVectorForModalAxis(axis: TransformModalAxis): THREE.Vector3 {
  if (axis === TransformModalAxis.X) {
    return new THREE.Vector3(1, 0, 0);
  }
  if (axis === TransformModalAxis.Y) {
    return new THREE.Vector3(0, 1, 0);
  }
  return new THREE.Vector3(0, 0, 1);
}

/**
 * Fails when two directions are not the same unit axis.
 *
 * @param actual Direction under test.
 * @param expected Expected direction.
 */
function expectSameDirection(actual: THREE.Vector3 | null, expected: THREE.Vector3): void {
  expect(actual).not.toBeNull();
  if (!actual) {
    return;
  }
  expect(actual.angleTo(expected)).toBeLessThan(1e-6);
}

/**
 * Projects a delta onto a direction.
 *
 * @param delta Source delta.
 * @param axis Direction to project onto.
 * @returns Projected delta.
 */
function projectOnto(delta: THREE.Vector3, axis: THREE.Vector3): THREE.Vector3 {
  const direction = axis.clone().normalize();
  return direction.multiplyScalar(delta.dot(direction));
}

describe('keyboard axis orientation', () => {
  it('maps keyboard axes through the workspace basis quaternion', () => {
    const gridSnap = new GridSnap(false, 1);
    const basis = quarterTurnAboutZ();
    gridSnap.setWorkspaceBasisQuaternion(basis);
    const resolved = new THREE.Quaternion();
    resolveKeyboardAxisOrientation(gridSnap, new THREE.Quaternion(), resolved);
    for (const axis of MODAL_AXES) {
      const world = transformModalAxisWorldVector(axis, resolved);
      const expected = unitVectorForModalAxis(axis).applyQuaternion(basis);
      expectSameDirection(world, expected);
    }
  });

  it('uses object orientation when the local-space flag is set', () => {
    const gridSnap = new GridSnap(false, 1);
    const objectBasis = thirdTurnAboutX();
    gridSnap.setWorkspaceBasisQuaternion(quarterTurnAboutZ());
    gridSnap.setKeyboardAxisUsesObjectOrientation(true);
    const resolved = new THREE.Quaternion();
    resolveKeyboardAxisOrientation(gridSnap, objectBasis, resolved);
    expect(resolved.angleTo(objectBasis)).toBeLessThan(1e-6);
    const world = transformModalAxisWorldVector(TransformModalAxis.Y, resolved);
    const expected = unitVectorForModalAxis(TransformModalAxis.Y).applyQuaternion(objectBasis);
    expectSameDirection(world, expected);
  });

  it('keeps world axes when the workspace basis is identity', () => {
    const gridSnap = new GridSnap(false, 1);
    const ignoredObjectBasis = thirdTurnAboutX();
    const resolved = new THREE.Quaternion();
    resolveKeyboardAxisOrientation(gridSnap, ignoredObjectBasis, resolved);
    for (const axis of MODAL_AXES) {
      const world = transformModalAxisWorldVector(axis, resolved);
      expectSameDirection(world, unitVectorForModalAxis(axis));
    }
  });

  it('projects modal locks onto the grid axis and handle locks onto the handle axis', () => {
    const keyboard = quarterTurnAboutZ();
    const handle = new THREE.Quaternion();
    const delta = new THREE.Vector3(3, -2, 5);
    const modalProjected = transformModalConstrainTranslationDelta(
      delta,
      TransformModalAxis.X,
      GizmoAxis.Y,
      handle,
      keyboard,
    );
    const gridAxis = unitVectorForModalAxis(TransformModalAxis.X).applyQuaternion(keyboard);
    const expectedModal = projectOnto(delta, gridAxis);
    expect(modalProjected.distanceTo(expectedModal)).toBeLessThan(1e-6);
    const handleProjected = transformModalConstrainTranslationDelta(
      delta,
      TransformModalAxis.None,
      GizmoAxis.X,
      handle,
      keyboard,
    );
    const handleAxis = TransformProjectionMath.axisToWorldVector(GizmoAxis.X, handle);
    const expectedHandle = projectOnto(delta, handleAxis);
    expect(handleProjected.distanceTo(expectedHandle)).toBeLessThan(1e-6);
    expect(handleProjected.distanceTo(expectedModal)).toBeGreaterThan(1e-3);
  });
});
