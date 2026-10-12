import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  resolveLayoutGizmoOrientation,
  updateLayoutGizmoCameraScale,
  type ContextHelpersLayoutGizmo,
} from '@/layout/setup/helpers_layout_gizmo.js';
import { GridSnap } from '@/transform/snap/grid_snap.js';
import { TransformSpace } from '@/types/transform_space.js';

describe('layout_gizmo_helpers', () => {
  it('uses the workspace grid rotation for global space', () => {
    const mesh = new THREE.Mesh();
    mesh.rotation.set(0.5, 1.0, -0.25);
    mesh.updateMatrixWorld(true);
    const { gridSnap, orientation } = createRotatedGridSnap();
    const resolved = resolveLayoutGizmoOrientation({ transformSpace: TransformSpace.Global, gridSnap }, [mesh]);
    expect(resolved.equals(orientation)).toBe(true);
  });

  it('uses the workspace grid rotation for global space with an empty selection', () => {
    const { gridSnap, orientation } = createRotatedGridSnap();
    const resolved = resolveLayoutGizmoOrientation({ transformSpace: TransformSpace.Global, gridSnap }, []);
    expect(resolved.equals(orientation)).toBe(true);
  });

  it('uses the single selected object world rotation for local space', () => {
    const mesh = new THREE.Mesh();
    mesh.rotation.set(0.25, -0.5, 0.75);
    mesh.updateMatrixWorld(true);
    const expected = new THREE.Quaternion();
    mesh.getWorldQuaternion(expected);
    const { gridSnap } = createRotatedGridSnap();
    const orientation = resolveLayoutGizmoOrientation({ transformSpace: TransformSpace.Local, gridSnap }, [mesh]);
    expect(orientation.equals(expected)).toBe(true);
  });

  it('uses identity orientation for multi-select local space', () => {
    const first = new THREE.Mesh();
    const second = new THREE.Mesh();
    first.rotation.set(0.1, 0.2, 0.3);
    second.rotation.set(-0.2, 0.4, -0.1);
    first.updateMatrixWorld(true);
    second.updateMatrixWorld(true);
    const { gridSnap } = createRotatedGridSnap();
    const orientation = resolveLayoutGizmoOrientation({ transformSpace: TransformSpace.Local, gridSnap }, [
      first,
      second,
    ]);
    expect(orientation.equals(new THREE.Quaternion())).toBe(true);
  });

  it('does not stamp a shared camera scale onto viewport clones from the global path', () => {
    const updateScaleForCamera = vi.fn();
    const context = {
      selectionManager: {
        getSelectedObjectCount: () => 1,
      },
      transformGizmo: {
        updateScaleForCamera,
      },
      getGizmoScaleCamera: () => new THREE.PerspectiveCamera(),
    } as unknown as ContextHelpersLayoutGizmo;
    updateLayoutGizmoCameraScale(context);
    expect(updateScaleForCamera).not.toHaveBeenCalled();
  });
});

/**
 * Builds a grid snap whose workspace basis is a non-identity rotation.
 *
 * @returns Snap store and the quaternion written into it.
 */
function createRotatedGridSnap(): { gridSnap: GridSnap; orientation: THREE.Quaternion } {
  const gridSnap = new GridSnap(true, 1);
  const axis = new THREE.Vector3(1, 1, 0).normalize();
  const orientation = new THREE.Quaternion().setFromAxisAngle(axis, Math.PI / 5);
  gridSnap.setWorkspaceBasisQuaternion(orientation);
  return { gridSnap, orientation };
}
