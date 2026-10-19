import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import { ManagerViewportSync } from '@/layout/viewport/manager_viewport_sync.js';
import { Viewport2D } from '@/viewports/core/viewport_2d.js';
import { Viewport3D } from '@/viewports/core/viewport_3d.js';

/**
 * Creates a minimal viewport mock with the methods required by
 * ViewportSyncManager.
 *
 * @param scene The scene to associate with this viewport mock.
 * @returns A partial viewport instance.
 */
function createViewportMock(scene: THREE.Scene): Viewport2D {
  return {
    getScene: () => scene,
    setSelectableObjects: vi.fn(),
  } as unknown as Viewport2D;
}

/**
 * Returns the mesh list from the latest setSelectableObjects call.
 *
 * @param viewport Viewport mock whose setSelectableObjects is a spy.
 * @returns Meshes passed on the most recent call.
 */
function latestSelectableMeshes(viewport: Viewport2D): THREE.Mesh[] {
  const calls = (viewport.setSelectableObjects as ReturnType<typeof vi.fn>).mock.calls;
  return calls[calls.length - 1]![0] as THREE.Mesh[];
}

/**
 * Creates a world group with test child meshes at specified positions.
 *
 * @param positions Array of position tuples for child meshes.
 * @returns The populated group.
 */
function createWorldGroupWithChildren(positions: [number, number, number][]): THREE.Group {
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

describe('ViewportSyncManager (shared scene)', () => {
  let syncManager: ManagerViewportSync;
  let scene: THREE.Scene;
  let viewportTop: Viewport2D;
  let viewportFront: Viewport2D;
  let viewportSide: Viewport2D;
  let viewport3D: Viewport3D;

  beforeEach(() => {
    scene = new THREE.Scene();
    viewportTop = createViewportMock(scene);
    viewportFront = createViewportMock(scene);
    viewportSide = createViewportMock(scene);
    viewport3D = createViewportMock(scene) as unknown as Viewport3D;
    syncManager = new ManagerViewportSync(viewportTop, viewportFront, viewportSide, viewport3D);
  });

  it('should set world meshes as selectable on every viewport', () => {
    const worldObject = createWorldGroupWithChildren([
      [0, 0, 0],
      [1, 0, 0],
    ]);
    syncManager.syncWorldObjectToViewports(worldObject);
    expect(viewportTop.setSelectableObjects).toHaveBeenCalled();
    const selectable = (viewportTop.setSelectableObjects as ReturnType<typeof vi.fn>).mock.calls[0]![0] as THREE.Mesh[];
    expect(selectable).toHaveLength(2);
    expect(selectable[0]).toBe(worldObject.children[0]);
  });

  it('should resolve world meshes by identity when no source uuid is present', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    expect(syncManager.resolveToWorldMesh(mesh)).toBe(mesh);
  });

  it('should omit meshes parented after the last sync until the next sync', () => {
    const worldObject = createWorldGroupWithChildren([[0, 0, 0]]);
    syncManager.syncWorldObjectToViewports(worldObject);
    const added = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    worldObject.add(added);
    expect(latestSelectableMeshes(viewportTop)).toHaveLength(1);
    expect(latestSelectableMeshes(viewportTop)).not.toContain(added);
    syncManager.syncWorldObjectToViewports(worldObject);
    expect(latestSelectableMeshes(viewportTop)).toContain(added);
  });

  it('should keep world geometry alive across resync', () => {
    const worldObject = createWorldGroupWithChildren([[0, 0, 0]]);
    const originalGeometry = (worldObject.children[0] as THREE.Mesh).geometry;
    syncManager.syncWorldObjectToViewports(worldObject);
    syncManager.syncWorldObjectToViewports(worldObject);
    expect((worldObject.children[0] as THREE.Mesh).geometry).toBe(originalGeometry);
  });
});
