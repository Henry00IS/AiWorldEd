import * as THREE from 'three';
import { GizmoAxis } from '@/types/transform_mode.js';
import { TransformConstraint } from './transform_constraint.js';

/** Projection planes, screen coordinates, and gizmo axis direction helpers. */
export class TransformProjectionMath {
  /**
   * Builds a plane through the pivot with the camera forward as its normal.
   *
   * @param camera The camera whose forward direction becomes the plane normal.
   * @param pivot The point that lies on the resulting plane.
   * @returns A plane with normal equal to the camera forward through pivot.
   */
  static buildCameraPlane(camera: THREE.Camera, pivot: THREE.Vector3): THREE.Plane {
    const normal = TransformProjectionMath.getCameraForwardDirection(camera);
    return new THREE.Plane().setFromNormalAndCoplanarPoint(normal, pivot);
  }

  /**
   * Computes the forward direction as (0, 0, -1) rotated by camera.quaternion.
   * Only the camera's own quaternion is applied; parent transforms are
   * ignored.
   *
   * @param camera The camera whose quaternion rotates the local -Z axis.
   * @returns Normalized forward direction after applying the camera quaternion.
   */
  static getCameraForwardDirection(camera: THREE.Camera): THREE.Vector3 {
    const direction = new THREE.Vector3(0, 0, -1);
    direction.applyQuaternion(camera.quaternion);
    return direction.normalize();
  }

  /**
   * Returns true when the axis is nearly perpendicular to the camera forward.
   *
   * @param camera The camera whose forward direction is dotted with the axis.
   * @param axis The axis direction tested against the camera forward.
   * @returns True when the absolute axis-view dot product is below 0.15.
   */
  static isAxisEdgeOn(camera: THREE.Camera, axis: THREE.Vector3): boolean {
    const view = TransformProjectionMath.getCameraForwardDirection(camera);
    return Math.abs(axis.dot(view)) < 0.15;
  }

  /**
   * Converts a mouse event into normalized screen coordinates in [0, 1].
   *
   * @param pickElement The element whose bounding rect defines the screen
   *   space.
   * @param event The pointer event providing clientX and clientY.
   * @returns Normalized screen position with x and y in [0, 1].
   */
  static getScreenPosition(pickElement: HTMLElement, event: MouseEvent): THREE.Vector2 {
    const rect = pickElement.getBoundingClientRect();
    const x = (event.clientX - rect.left) / Math.max(rect.width, 1);
    const y = (event.clientY - rect.top) / Math.max(rect.height, 1);
    return new THREE.Vector2(x, y);
  }

  /**
   * Projects a world point into normalized screen coordinates in [0, 1].
   * Updates the camera world matrix, projects the point, then maps NDC so x and
   * y lie in [0, 1] with y growing downward.
   *
   * @param camera The camera used for the projection.
   * @param pickElement Pick element argument (not read by this function).
   * @param worldPoint The world-space point to project.
   * @returns Normalized screen position with x and y in [0, 1].
   */
  static projectWorldPointToNormalizedScreen(
    camera: THREE.Camera,
    _pickElement: HTMLElement,
    worldPoint: THREE.Vector3,
  ): THREE.Vector2 {
    camera.updateMatrixWorld(true);
    const projected = worldPoint.clone().project(camera);
    return new THREE.Vector2((projected.x + 1) * 0.5, (1 - projected.y) * 0.5);
  }

  /**
   * Constrains a delta to the axis or plane selected by the gizmo axis value.
   * VIEW returns a clone of delta; single axes constrain to that axis; other
   * values constrain to the corresponding plane.
   *
   * @param delta The unrestricted delta vector to constrain.
   * @param axis The gizmo axis or plane that selects the constraint.
   * @returns The constrained delta vector (or a clone for VIEW).
   */
  static constrainDelta(delta: THREE.Vector3, axis: GizmoAxis): THREE.Vector3 {
    if (axis === GizmoAxis.VIEW) {
      return delta.clone();
    }
    if (axis === GizmoAxis.X || axis === GizmoAxis.Y || axis === GizmoAxis.Z) {
      return TransformConstraint.constrainTranslationToAxis(delta, axis);
    }
    return TransformConstraint.constrainTranslationToPlane(delta, axis);
  }

  /**
   * Converts a gizmo axis enum to a unit direction vector in local space.
   * Linear axes map to their unit vectors; plane axes map to their normals.
   *
   * @param axis The gizmo axis or plane to convert.
   * @returns A unit direction or plane-normal vector in local space.
   */
  static axisToVector3(axis: GizmoAxis): THREE.Vector3 {
    if (axis === GizmoAxis.X) return new THREE.Vector3(1, 0, 0);
    if (axis === GizmoAxis.Y) return new THREE.Vector3(0, 1, 0);
    if (axis === GizmoAxis.Z) return new THREE.Vector3(0, 0, 1);
    if (axis === GizmoAxis.XY_PLANE) return new THREE.Vector3(0, 0, 1);
    if (axis === GizmoAxis.YZ_PLANE) return new THREE.Vector3(1, 0, 0);
    return new THREE.Vector3(0, 1, 0);
  }

  /**
   * Converts a gizmo axis to a unit direction by applying the given
   * orientation.
   *
   * @param axis The gizmo axis or plane to convert.
   * @param orientation Quaternion applied to the local axis or plane-normal
   *   vector.
   * @returns Unit direction after applying orientation and normalizing.
   */
  static axisToWorldVector(axis: GizmoAxis, orientation: THREE.Quaternion): THREE.Vector3 {
    return this.axisToVector3(axis).applyQuaternion(orientation).normalize();
  }
}
