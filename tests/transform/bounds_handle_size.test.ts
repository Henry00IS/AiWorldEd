import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { TransformGizmo } from '../../src/transform/transform_gizmo.js';
import { TransformMode } from '../../src/types/transform_mode.js';
import { Theme } from '../../src/theme.js';

describe('bounds handle size vs camera distance', () => {
  it('should not grow bounds handles when the perspective camera is far away', () => {
    const nearCamera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    nearCamera.position.set(0, 2, 4);
    const farCamera = new THREE.PerspectiveCamera(60, 1, 0.1, 10000);
    farCamera.position.set(0, 200, 400);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
    mesh.position.set(0, 1, 0);
    mesh.updateMatrixWorld(true);
    const gizmoNear = new TransformGizmo(Theme);
    gizmoNear.setMode(TransformMode.BOUNDS);
    gizmoNear.updateBoundsFromMeshes([mesh], nearCamera);
    const nearSize = readFirstHandleScale(gizmoNear);
    const gizmoFar = new TransformGizmo(Theme);
    gizmoFar.setMode(TransformMode.BOUNDS);
    gizmoFar.updateBoundsFromMeshes([mesh], farCamera);
    const farSize = readFirstHandleScale(gizmoFar);
    expect(farSize).toBeCloseTo(nearSize, 5);
    gizmoNear.dispose();
    gizmoFar.dispose();
  });
});

/**
 * Reads a representative bounds handle mesh scale from the gizmo master group.
 * @param gizmo Transform gizmo after bounds update.
 * @returns Uniform scale of the first bounds handle mesh, or 0.
 */
function readFirstHandleScale(gizmo: TransformGizmo): number {
  const handles = gizmo.getHandles();
  if (handles.length === 0) return 0;
  return handles[0].getVisualMesh().scale.x;
}
