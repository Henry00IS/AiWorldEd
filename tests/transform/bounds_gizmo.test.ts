import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { BoundsGizmo } from '../../src/transform/bounds_gizmo.js';
import { Theme } from '../../src/theme.js';
import { OrientedBoundsData } from '../../src/transform/oriented_bounds.js';

describe('BoundsGizmo', () => {
  let gizmo: BoundsGizmo;

  beforeEach(() => {
    gizmo = new BoundsGizmo(Theme);
  });

  it('should create six handles', () => {
    const handles = gizmo.createHandles();
    expect(handles).toHaveLength(6);
  });

  it('should expose a root scene object', () => {
    gizmo.createHandles();
    const objects = gizmo.getAllSceneObjects();
    expect(objects).toHaveLength(1);
    expect(objects[0]).toBeInstanceOf(THREE.Group);
  });

  it('should update pose from oriented bounds', () => {
    gizmo.createHandles();
    const bounds = createBounds(new THREE.Vector3(1, 2, 3), new THREE.Vector3(2, 1, 0.5));
    gizmo.updateFromBounds(bounds, 0.2);
    const current = gizmo.getCurrentBounds();
    expect(current).not.toBeNull();
    expect(current!.center.x).toBeCloseTo(1, 5);
    expect(current!.halfExtents.x).toBeCloseTo(2, 5);
  });

  it('should hide root when bounds are cleared', () => {
    gizmo.createHandles();
    gizmo.updateFromBounds(createBounds(new THREE.Vector3(), new THREE.Vector3(1, 1, 1)));
    gizmo.updateFromBounds(null);
    expect(gizmo.getAllSceneObjects()[0].visible).toBe(false);
  });

  it('should keep resize handles and face picks available together', () => {
    gizmo.createHandles();
    gizmo.updateFromBounds(
      createBounds(new THREE.Vector3(), new THREE.Vector3(1, 1, 1)),
      0.2
    );
    const root = gizmo.getAllSceneObjects()[0];
    let handleCount = 0;
    let facePickCount = 0;
    root.traverse((child) => {
      if (!(child instanceof THREE.Mesh) || !child.visible) return;
      if (child.userData.isBoundsFacePick === true) facePickCount += 1;
      if (child.userData.handleId !== undefined) handleCount += 1;
    });
    expect(handleCount).toBe(6);
    expect(facePickCount).toBe(6);
  });

  it('should dispose without errors', () => {
    gizmo.createHandles();
    expect(() => gizmo.dispose()).not.toThrow();
  });

  it('should keep guide lines hidden until explicitly shown', () => {
    gizmo.createHandles();
    gizmo.updateFromBounds(
      createBounds(new THREE.Vector3(), new THREE.Vector3(1, 1, 1))
    );
    expect(gizmo.areGuideLinesVisible()).toBe(false);
    gizmo.setGuideLinesVisible(true);
    expect(gizmo.areGuideLinesVisible()).toBe(true);
  });

  it('should include guide line object under the root group', () => {
    gizmo.createHandles();
    const root = gizmo.getAllSceneObjects()[0];
    let found = false;
    root.traverse((child) => {
      if (child.userData.isBoundsGuideLines === true) found = true;
    });
    expect(found).toBe(true);
  });
});

/**
 * Builds simple axis-aligned bounds for gizmo tests.
 * @param center World center.
 * @param halfExtents Local half extents.
 * @returns Oriented bounds data.
 */
function createBounds(
  center: THREE.Vector3,
  halfExtents: THREE.Vector3
): OrientedBoundsData {
  return {
    center,
    quaternion: new THREE.Quaternion(),
    halfExtents
  };
}
