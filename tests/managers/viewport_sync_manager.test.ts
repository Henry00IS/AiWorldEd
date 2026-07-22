import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import { ViewportSyncManager } from '../../src/managers/viewport_sync_manager.js';

/**
 * Creates a minimal Viewport2D mock with the methods required by ViewportSyncManager.
 * @param scene The scene to associate with this viewport mock.
 * @returns A partial Viewport2D instance.
 */
function createViewport2DMock(scene: THREE.Scene): Viewport2D {
  return {
    getScene: () => scene,
    setSelectableObjects: vi.fn()
  } as unknown as Viewport2D;
}

/**
 * Creates a minimal Viewport3D mock with the methods required by ViewportSyncManager.
 * @param scene The scene to associate with this viewport mock.
 * @returns A partial Viewport3D instance.
 */
function createViewport3DMock(scene: THREE.Scene): Viewport3D {
  return {
    getScene: () => scene,
    setSelectableObjects: vi.fn()
  } as unknown as Viewport3D;
}

/**
 * Creates a world group with test child meshes at specified positions.
 * @param positions Array of position tuples for child meshes.
 * @returns The populated group.
 */
function createWorldGroupWithChildren(
  positions: [number, number, number][]
): THREE.Group {
  const group = new THREE.Group();
  positions.forEach(([x, y, z]) => {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    group.add(mesh);
  });
  return group;
}

/**
 * Finds the first Group child in a scene (the viewport clone).
 * @param scene The scene to search.
 * @returns The first group child.
 */
function findCloneGroup(scene: THREE.Scene): THREE.Group {
  const group = scene.children.find((child) => child instanceof THREE.Group);
  if (!group || !(group instanceof THREE.Group)) {
    throw new Error('Expected a clone group in the scene');
  }
  return group;
}

describe('ViewportSyncManager', () => {
  let syncManager: ViewportSyncManager;
  let sceneTop: THREE.Scene;
  let sceneFront: THREE.Scene;
  let sceneSide: THREE.Scene;
  let scene3D: THREE.Scene;
  let viewportTop: Viewport2D;
  let viewportFront: Viewport2D;
  let viewportSide: Viewport2D;
  let viewport3D: Viewport3D;

  beforeEach(() => {
    sceneTop = new THREE.Scene();
    sceneFront = new THREE.Scene();
    sceneSide = new THREE.Scene();
    scene3D = new THREE.Scene();
    viewportTop = createViewport2DMock(sceneTop);
    viewportFront = createViewport2DMock(sceneFront);
    viewportSide = createViewport2DMock(sceneSide);
    viewport3D = createViewport3DMock(scene3D);
    syncManager = new ViewportSyncManager(
      viewportTop,
      viewportFront,
      viewportSide,
      viewport3D
    );
  });

  describe('syncWorldObjectToViewports', () => {
    it('should keep world mesh geometry alive after resync dispose cycle', () => {
      const worldObject = createWorldGroupWithChildren([[0, 0, 0]]);
      const originalGeometry = (worldObject.children[0] as THREE.Mesh).geometry;
      syncManager.syncWorldObjectToViewports(worldObject);
      syncManager.syncWorldObjectToViewports(worldObject);
      expect((worldObject.children[0] as THREE.Mesh).geometry).toBe(originalGeometry);
      expect(originalGeometry.getAttribute('position')).toBeTruthy();
    });

    it('should place independent clones into all 2D scenes', () => {
      const worldObject = createWorldGroupWithChildren([[1, 2, 3]]);
      syncManager.syncWorldObjectToViewports(worldObject);
      expect(sceneTop.children.some((c) => c instanceof THREE.Group)).toBe(true);
      expect(sceneFront.children.some((c) => c instanceof THREE.Group)).toBe(true);
      expect(sceneSide.children.some((c) => c instanceof THREE.Group)).toBe(true);
      const cloneMesh = findCloneGroup(sceneTop).children[0] as THREE.Mesh;
      const worldMesh = worldObject.children[0] as THREE.Mesh;
      expect(cloneMesh.geometry).not.toBe(worldMesh.geometry);
    });
  });

  describe('syncClonePositionsToWorldObject', () => {
    it('should mirror child positions from original to all 2D viewport clones', () => {
      const worldObject = createWorldGroupWithChildren([
        [1, 2, 3],
        [4, 5, 6]
      ]);
      syncManager.syncWorldObjectToViewports(worldObject);

      worldObject.children[0].position.set(10, 20, 30);
      worldObject.children[1].position.set(40, 50, 60);
      syncManager.syncClonePositionsToWorldObject(worldObject);

      const clone1 = findCloneGroup(sceneTop);
      const clone2 = findCloneGroup(sceneFront);
      const clone3 = findCloneGroup(sceneSide);
      expect(clone1.children[0].position.x).toBe(10);
      expect(clone1.children[0].position.y).toBe(20);
      expect(clone1.children[0].position.z).toBe(30);
      expect(clone2.children[1].position.x).toBe(40);
      expect(clone2.children[1].position.y).toBe(50);
      expect(clone2.children[1].position.z).toBe(60);
      expect(clone3.children[0].position.x).toBe(10);
      expect(clone3.children[1].position.y).toBe(50);
    });

    it('should mirror rotation and scale from original to clones', () => {
      const worldObject = createWorldGroupWithChildren([[0, 0, 0]]);
      syncManager.syncWorldObjectToViewports(worldObject);

      worldObject.children[0].quaternion.setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        Math.PI / 4
      );
      worldObject.children[0].scale.set(2, 3, 4);
      syncManager.syncClonePositionsToWorldObject(worldObject);

      const clone = findCloneGroup(sceneTop);
      expect(clone.children[0].quaternion.x).toBeCloseTo(
        worldObject.children[0].quaternion.x
      );
      expect(clone.children[0].quaternion.y).toBeCloseTo(
        worldObject.children[0].quaternion.y
      );
      expect(clone.children[0].quaternion.z).toBeCloseTo(
        worldObject.children[0].quaternion.z
      );
      expect(clone.children[0].quaternion.w).toBeCloseTo(
        worldObject.children[0].quaternion.w
      );
      expect(clone.children[0].scale.x).toBe(2);
      expect(clone.children[0].scale.y).toBe(3);
      expect(clone.children[0].scale.z).toBe(4);
    });

    it('should sync matching children when clone child counts differ', () => {
      const worldObject = createWorldGroupWithChildren([[0, 0, 0], [1, 1, 1]]);
      syncManager.syncWorldObjectToViewports(worldObject);
      const clone = findCloneGroup(sceneTop);
      clone.remove(clone.children[1]);

      worldObject.children[0].position.set(99, 99, 99);
      syncManager.syncClonePositionsToWorldObject(worldObject);

      expect(clone.children[0].position.x).toBe(99);
      expect(clone.children.length).toBe(1);
    });

    it('should skip viewports that have no clone group present', () => {
      const worldObject = createWorldGroupWithChildren([[1, 2, 3]]);
      syncManager.syncWorldObjectToViewports(worldObject);
      sceneFront.clear();
      sceneSide.clear();
      sceneFront.add(new THREE.AmbientLight());
      sceneSide.add(new THREE.DirectionalLight());

      worldObject.children[0].position.set(100, 200, 300);

      expect(() =>
        syncManager.syncClonePositionsToWorldObject(worldObject)
      ).not.toThrow();
      expect(findCloneGroup(sceneTop).children[0].position.x).toBe(100);
    });
  });
});
