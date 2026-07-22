import * as THREE from 'three';
import { GizmoAxis } from '../types/transform_mode.js';

/**
 * Pure math class for computing constrained transforms.
 * All methods are static and operate on Three.js vector types.
 */
export class TransformConstraint {
  /**
   * Constrains a translation delta to a single axis.
   * Zeroes out the components not on the specified axis.
   * @param delta The original translation delta vector.
   * @param axis The axis to constrain translation to.
   * @returns A new vector with only the constrained axis component.
   */
  static constrainTranslationToAxis(delta: THREE.Vector3, axis: GizmoAxis): THREE.Vector3 {
    const result = new THREE.Vector3(0, 0, 0);
    if (axis === GizmoAxis.X) result.x = delta.x;
    if (axis === GizmoAxis.Y) result.y = delta.y;
    if (axis === GizmoAxis.Z) result.z = delta.z;
    return result;
  }

  /**
   * Constrains a translation delta to a plane.
   * Zeroes out the component perpendicular to the specified plane.
   * @param delta The original translation delta vector.
   * @param plane The plane to constrain translation to.
   * @returns A new vector with only the plane components.
   */
  static constrainTranslationToPlane(delta: THREE.Vector3, plane: GizmoAxis): THREE.Vector3 {
    const result = new THREE.Vector3(0, 0, 0);
    if (plane === GizmoAxis.XY_PLANE) {
      result.x = delta.x;
      result.y = delta.y;
    }
    if (plane === GizmoAxis.YZ_PLANE) {
      result.y = delta.y;
      result.z = delta.z;
    }
    if (plane === GizmoAxis.XZ_PLANE) {
      result.x = delta.x;
      result.z = delta.z;
    }
    return result;
  }

  /**
   * Computes the signed rotation angle between two direction vectors.
   * Uses the cross product dot the axis to determine sign.
   * @param initialDir The initial direction vector before rotation.
   * @param currentDir The current direction vector during rotation.
   * @param axis The rotation axis (must be normalized).
   * @returns The signed rotation angle in radians.
   */
  static computeRotationAngle(
    initialDir: THREE.Vector3,
    currentDir: THREE.Vector3,
    axis: THREE.Vector3
  ): number {
    const normalizedInitial = initialDir.clone().normalize();
    const normalizedCurrent = currentDir.clone().normalize();
    const dot = normalizedInitial.dot(normalizedCurrent);
    const cross = new THREE.Vector3().crossVectors(normalizedInitial, normalizedCurrent);
    const sign = cross.dot(axis);
    const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
    return angle * Math.sign(sign);
  }

  /**
   * Computes a uniform scale factor from initial and current distances.
   * @param initialDistance The reference distance before scaling.
   * @param currentDistance The current distance during scaling.
   * @returns The scale factor, clamped to a minimum of 0.01.
   */
  static computeScaleFactor(initialDistance: number, currentDistance: number): number {
    if (initialDistance === 0) return 1;
    const factor = currentDistance / initialDistance;
    return Math.max(0.01, factor);
  }
}
