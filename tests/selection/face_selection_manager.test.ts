import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { FaceSelectionManager } from '../../src/selection/face_selection_manager.js';

describe('FaceSelectionManager', () => {
  let manager: FaceSelectionManager;
  let meshA: THREE.Mesh;
  let meshB: THREE.Mesh;

  beforeEach(() => {
    manager = new FaceSelectionManager();
    meshA = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial()
    );
    meshB = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial()
    );
  });

  it('should start with empty selection', () => {
    expect(manager.getSelectedFaceCount()).toBe(0);
    expect(manager.getSelectedFaces()).toEqual([]);
  });

  it('should select a whole coplanar face on a box (two triangles)', () => {
    manager.selectFace(meshA, 0, false);
    expect(manager.getSelectedFaceCount()).toBe(2);
    expect(manager.isFaceSelected(meshA, 0)).toBe(true);
  });

  it('should select only one triangle when expand is disabled', () => {
    manager.selectFace(meshA, 0, false, false);
    expect(manager.getSelectedFaceCount()).toBe(1);
    expect(manager.isFaceSelected(meshA, 0)).toBe(true);
  });

  it('should clear previous selection when not adding to selection', () => {
    manager.selectFace(meshA, 0, false, false);
    manager.selectFace(meshB, 1, false, false);
    expect(manager.getSelectedFaceCount()).toBe(1);
    expect(manager.isFaceSelected(meshA, 0)).toBe(false);
    expect(manager.isFaceSelected(meshB, 1)).toBe(true);
  });

  it('should add to existing selection when addToSelection is true', () => {
    manager.selectFace(meshA, 0, false, false);
    manager.selectFace(meshA, 1, true, false);
    expect(manager.getSelectedFaceCount()).toBe(2);
    expect(manager.isFaceSelected(meshA, 0)).toBe(true);
    expect(manager.isFaceSelected(meshA, 1)).toBe(true);
  });

  it('should not duplicate when selecting the same face', () => {
    manager.selectFace(meshA, 0, false, false);
    manager.selectFace(meshA, 0, false, false);
    expect(manager.getSelectedFaceCount()).toBe(1);
  });

  it('should not duplicate when adding the same face', () => {
    manager.selectFace(meshA, 0, false, false);
    manager.selectFace(meshA, 0, true, false);
    expect(manager.getSelectedFaceCount()).toBe(1);
  });

  it('should deselect all faces', () => {
    manager.selectFace(meshA, 0, false, false);
    manager.selectFace(meshA, 1, true, false);
    manager.selectFace(meshB, 0, true, false);
    manager.deselectAll();
    expect(manager.getSelectedFaceCount()).toBe(0);
  });

  it('should handle deselectAll on empty selection without error', () => {
    expect(() => manager.deselectAll()).not.toThrow();
  });

  it('should remove a specific face from selection', () => {
    manager.selectFace(meshA, 0, false, false);
    manager.selectFace(meshA, 1, true, false);
    manager.removeFace(meshA, 0);
    expect(manager.getSelectedFaceCount()).toBe(1);
    expect(manager.isFaceSelected(meshA, 0)).toBe(false);
    expect(manager.isFaceSelected(meshA, 1)).toBe(true);
  });

  it('should handle removing non-selected face gracefully', () => {
    manager.selectFace(meshA, 0, false, false);
    manager.removeFace(meshB, 5);
    expect(manager.getSelectedFaceCount()).toBe(1);
  });

  it('should fire callback on selection change', () => {
    let callbackCount = 0;
    manager.setSelectionChangedCallback(() => { callbackCount++; });
    manager.selectFace(meshA, 0, false, false);
    expect(callbackCount).toBe(1);
  });

  it('should fire callback with correct selection array', () => {
    let capturedFaces: ReturnType<typeof manager.getSelectedFaces> | null = null;
    manager.setSelectionChangedCallback((faces) => { capturedFaces = faces; });
    manager.selectFace(meshA, 0, false, false);
    expect(capturedFaces).not.toBeNull();
    expect(capturedFaces?.length).toBe(1);
    expect(capturedFaces?.[0].mesh).toBe(meshA);
    expect(capturedFaces?.[0].faceIndex).toBe(0);
  });

  it('should compute average normal for a single face', () => {
    const geometry = createTriangleOnXZPlane();
    const testMesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
    manager.selectFace(testMesh, 0, false);
    const normal = manager.computeAverageNormal();
    expect(normal.length()).toBeCloseTo(1);
  });

  it('should compute average normal for multiple faces', () => {
    const geometry1 = createTriangleOnXZPlane();
    const mesh1 = new THREE.Mesh(geometry1, new THREE.MeshBasicMaterial());
    const geometry2 = createTriangleOnXZPlane();
    const mesh2 = new THREE.Mesh(geometry2, new THREE.MeshBasicMaterial());
    manager.selectFace(mesh1, 0, false);
    manager.selectFace(mesh2, 0, true);
    const normal = manager.computeAverageNormal();
    expect(normal.length()).toBeCloseTo(1);
  });

  it('should return zero-ish normal for empty selection', () => {
    const normal = manager.computeAverageNormal();
    expect(normal.x).toBeCloseTo(0, 3);
    expect(normal.y).toBeCloseTo(0, 3);
    expect(normal.z).toBeCloseTo(0, 3);
  });

  it('should clear all state', () => {
    manager.selectFace(meshA, 0, false);
    let callbackFired = false;
    manager.setSelectionChangedCallback(() => { callbackFired = true; });
    manager.clear();
    expect(manager.getSelectedFaceCount()).toBe(0);
    manager.selectFace(meshA, 0, false);
    expect(callbackFired).toBe(false);
  });
});

/**
 * Creates a simple triangle geometry on the XZ plane facing up.
 * @returns A buffer geometry with 3 vertices forming one triangle.
 */
function createTriangleOnXZPlane(): THREE.BufferGeometry {
  const vertices = new Float32Array([
    0, 0, 0,
    1, 0, 0,
    0.5, 0, 1
  ]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  return geometry;
}

