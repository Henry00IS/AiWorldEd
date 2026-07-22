import * as THREE from 'three';
import { GizmoAxis } from '../types/transform_mode.js';
import { TransformConstraint } from './transform_constraint.js';

/**
 * Projection and axis helpers used by transform drag interactions.
 */
export class TransformProjectionMath {
  /**
   * Builds a projection plane through the pivot facing the camera.
   * @param camera The viewport camera.
   * @param pivot The transform pivot point.
   * @returns A plane perpendicular to the camera's view direction.
   */
  static buildCameraPlane(
    camera: THREE.Camera,
    pivot: THREE.Vector3
  ): THREE.Plane {
    const normal = TransformProjectionMath.getCameraForwardDirection(camera);
    return new THREE.Plane().setFromNormalAndCoplanarPoint(normal, pivot);
  }

  /**
   * Computes the forward direction vector of the camera.
   * @param camera The camera to query.
   * @returns The normalized forward direction of the camera.
   */
  static getCameraForwardDirection(camera: THREE.Camera): THREE.Vector3 {
    const direction = new THREE.Vector3(0, 0, -1);
    direction.applyQuaternion(camera.quaternion);
    return direction.normalize();
  }

  /**
   * Returns true when the rotation axis is nearly edge-on to the camera.
   * @param camera The viewport camera.
   * @param axis The rotation axis.
   * @returns True if axis-plane projection would be unstable.
   */
  static isAxisEdgeOn(camera: THREE.Camera, axis: THREE.Vector3): boolean {
    const view = TransformProjectionMath.getCameraForwardDirection(camera);
    return Math.abs(axis.dot(view)) < 0.15;
  }

  /**
   * Converts a mouse event into normalized screen coordinates [0,1].
   * @param renderer The viewport renderer.
   * @param event The pointer event.
   * @returns Normalized screen position.
   */
  static getScreenPosition(
    renderer: THREE.WebGLRenderer,
    event: MouseEvent
  ): THREE.Vector2 {
    const rect = renderer.domElement.getBoundingClientRect();
    const x = (event.clientX - rect.left) / Math.max(rect.width, 1);
    const y = (event.clientY - rect.top) / Math.max(rect.height, 1);
    return new THREE.Vector2(x, y);
  }

  /**
   * Constrains a delta to the active axis or plane.
   * @param delta The original delta vector.
   * @param axis The gizmo axis to constrain to.
   * @returns The constrained delta vector.
   */
  static constrainDelta(
    delta: THREE.Vector3,
    axis: GizmoAxis
  ): THREE.Vector3 {
    if (axis === GizmoAxis.X || axis === GizmoAxis.Y || axis === GizmoAxis.Z) {
      return TransformConstraint.constrainTranslationToAxis(delta, axis);
    }
    return TransformConstraint.constrainTranslationToPlane(delta, axis);
  }

  /**
   * Converts a gizmo axis enum to a Three.js direction vector.
   * @param axis The gizmo axis.
   * @returns A unit direction vector for the axis.
   */
  static axisToVector3(axis: GizmoAxis): THREE.Vector3 {
    if (axis === GizmoAxis.X) return new THREE.Vector3(1, 0, 0);
    if (axis === GizmoAxis.Y) return new THREE.Vector3(0, 1, 0);
    if (axis === GizmoAxis.Z) return new THREE.Vector3(0, 0, 1);
    if (axis === GizmoAxis.XY_PLANE) return new THREE.Vector3(0, 0, 1);
    if (axis === GizmoAxis.YZ_PLANE) return new THREE.Vector3(1, 0, 0);
    return new THREE.Vector3(0, 1, 0);
  }
}
