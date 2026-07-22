import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CsgMeshBuilder } from '../../src/csg/csg_mesh_builder.js';
import {
  collectPlaneIntersectionPoints,
  buildPlaneCapPolygon
} from '../../src/csg/csg_plane_cap.js';
import { planeToCsgForm } from '../../src/csg/csg_plane_from_points.js';

describe('csg_plane_cap', () => {
  it('should collect four mid-plane hits for an axis-aligned box', () => {
    const mesh = createUnitBoxMesh();
    const polygons = new CsgMeshBuilder().meshToPolygons(mesh);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 0, 0)
    );
    const csg = planeToCsgForm(plane);
    const points = collectPlaneIntersectionPoints(
      polygons,
      csg.normal,
      csg.constant
    );
    expect(points.length).toBeGreaterThanOrEqual(4);
    points.forEach((point) => {
      expect(Math.abs(point.x)).toBeLessThan(1e-4);
    });
  });

  it('should build a cap polygon with outward normal', () => {
    const mesh = createUnitBoxMesh();
    const polygons = new CsgMeshBuilder().meshToPolygons(mesh);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 0, 0)
    );
    const csg = planeToCsgForm(plane);
    const outward = csg.normal.clone().negate();
    const cap = buildPlaneCapPolygon(
      polygons,
      csg.normal,
      csg.constant,
      outward
    );
    expect(cap).not.toBeNull();
    expect(cap!.getVertices().length).toBeGreaterThanOrEqual(3);
    const alignment = cap!.getPlaneNormal().dot(outward);
    expect(alignment).toBeGreaterThan(0.5);
  });
});

/**
 * Creates a 2×2×2 box centered at the origin.
 * @returns A mesh ready for world-space CSG extraction.
 */
function createUnitBoxMesh(): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
  mesh.updateMatrixWorld(true);
  return mesh;
}
