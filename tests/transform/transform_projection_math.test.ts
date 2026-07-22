import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { GizmoAxis } from '../../src/types/transform_mode.js';
import { TransformProjectionMath } from '../../src/transform/transform_projection_math.js';

describe('TransformProjectionMath', () => {
  /**
   * Builds a camera looking down -Z at the origin for projection tests.
   * @returns A perspective camera with a known orientation.
   */
  function createForwardCamera(): THREE.PerspectiveCamera {
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    camera.position.set(0, 0, 5);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    return camera;
  }

  it('should build a camera plane through the pivot facing the camera', () => {
    const camera = createForwardCamera();
    const pivot = new THREE.Vector3(1, 2, 3);
    const plane = TransformProjectionMath.buildCameraPlane(camera, pivot);
    const distance = plane.distanceToPoint(pivot);
    expect(Math.abs(distance)).toBeLessThan(1e-6);
  });

  it('should detect an edge-on rotation axis relative to the camera', () => {
    const camera = createForwardCamera();
    const edgeOnAxis = new THREE.Vector3(1, 0, 0);
    const faceOnAxis = new THREE.Vector3(0, 0, 1);
    expect(TransformProjectionMath.isAxisEdgeOn(camera, edgeOnAxis)).toBe(true);
    expect(TransformProjectionMath.isAxisEdgeOn(camera, faceOnAxis)).toBe(false);
  });

  it('should constrain deltas to single axes and planes', () => {
    const delta = new THREE.Vector3(2, 3, 4);
    const xOnly = TransformProjectionMath.constrainDelta(delta, GizmoAxis.X);
    expect(xOnly.x).toBeCloseTo(2);
    expect(xOnly.y).toBeCloseTo(0);
    expect(xOnly.z).toBeCloseTo(0);
    const xyPlane = TransformProjectionMath.constrainDelta(delta, GizmoAxis.XY_PLANE);
    expect(xyPlane.z).toBeCloseTo(0);
  });

  it('should map gizmo axes to unit direction vectors', () => {
    expect(TransformProjectionMath.axisToVector3(GizmoAxis.X)).toEqual(
      new THREE.Vector3(1, 0, 0)
    );
    expect(TransformProjectionMath.axisToVector3(GizmoAxis.Y)).toEqual(
      new THREE.Vector3(0, 1, 0)
    );
    expect(TransformProjectionMath.axisToVector3(GizmoAxis.Z)).toEqual(
      new THREE.Vector3(0, 0, 1)
    );
  });
});
