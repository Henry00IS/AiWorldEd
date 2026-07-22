import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { CsgPlaneSplit } from '../../src/csg/csg_plane_split.js';

describe('CsgPlaneSplit', () => {
  let splitter: CsgPlaneSplit;

  beforeEach(() => {
    splitter = new CsgPlaneSplit();
  });

  it('should clip a box to the positive X half and keep volume there', () => {
    const mesh = createBoxMesh(2, 2, 2);
    const plane = midPlaneThroughMesh(mesh, new THREE.Vector3(1, 0, 0));
    const result = splitter.clipMeshToPlane(mesh, plane, true, 'KeepPos');
    expect(result).not.toBeNull();
    expect(result!.name).toBe('KeepPos');
    expect(triangleCount(result!)).toBeGreaterThan(0);
    const center = computeWorldBoundsCenter(result!);
    expect(center.x).toBeGreaterThan(0);
  });

  it('should clip a box to the negative X half', () => {
    const mesh = createBoxMesh(2, 2, 2);
    const plane = midPlaneThroughMesh(mesh, new THREE.Vector3(1, 0, 0));
    const result = splitter.clipMeshToPlane(mesh, plane, false, 'KeepNeg');
    expect(result).not.toBeNull();
    const center = computeWorldBoundsCenter(result!);
    expect(center.x).toBeLessThan(0);
  });

  it('should split a box into two non-empty pieces', () => {
    const mesh = createBoxMesh(2, 2, 2);
    const plane = midPlaneThroughMesh(mesh, new THREE.Vector3(0, 1, 0));
    const result = splitter.splitMeshByPlane(mesh, plane, 'A', 'B');
    expect(result).not.toBeNull();
    expect(triangleCount(result!.frontMesh)).toBeGreaterThan(0);
    expect(triangleCount(result!.backMesh)).toBeGreaterThan(0);
    const frontCenter = computeWorldBoundsCenter(result!.frontMesh);
    const backCenter = computeWorldBoundsCenter(result!.backMesh);
    expect(frontCenter.y).not.toBeCloseTo(backCenter.y, 1);
  });

  it('should return null when the keep side misses the mesh', () => {
    const mesh = createBoxMesh(1, 1, 1);
    mesh.position.set(10, 0, 0);
    mesh.updateMatrixWorld(true);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 0, 0)
    );
    const result = splitter.clipMeshToPlane(mesh, plane, false);
    expect(result).toBeNull();
  });

  it('should produce capped geometry with a solid triangle count', () => {
    const mesh = createBoxMesh(2, 2, 2);
    const plane = midPlaneThroughMesh(mesh, new THREE.Vector3(1, 0, 0));
    const capped = splitter.clipMeshToPlane(mesh, plane, true);
    expect(capped).not.toBeNull();
    expect(triangleCount(capped!)).toBeGreaterThanOrEqual(8);
  });
});

/**
 * Creates a box mesh centered at the origin.
 * @param width Box width.
 * @param height Box height.
 * @param depth Box depth.
 * @returns Mesh with updated world matrix.
 */
function createBoxMesh(width: number, height: number, depth: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth));
  mesh.updateMatrixWorld(true);
  return mesh;
}

/**
 * Builds a plane through the mesh world bounds center with the given normal.
 * @param mesh Source mesh.
 * @param normal Plane normal.
 * @returns Cutting plane.
 */
function midPlaneThroughMesh(
  mesh: THREE.Mesh,
  normal: THREE.Vector3
): THREE.Plane {
  const center = computeWorldBoundsCenter(mesh);
  return new THREE.Plane().setFromNormalAndCoplanarPoint(
    normal.clone().normalize(),
    center
  );
}

/**
 * Computes the world-space bounding-box center of a mesh.
 * @param mesh Mesh to measure.
 * @returns Center point.
 */
function computeWorldBoundsCenter(mesh: THREE.Mesh): THREE.Vector3 {
  mesh.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(mesh);
  return box.getCenter(new THREE.Vector3());
}

/**
 * Counts triangles in a mesh geometry.
 * @param mesh Mesh to inspect.
 * @returns Triangle count.
 */
function triangleCount(mesh: THREE.Mesh): number {
  const geometry = mesh.geometry;
  if (geometry.index) {
    return geometry.index.count / 3;
  }
  return geometry.getAttribute('position').count / 3;
}
