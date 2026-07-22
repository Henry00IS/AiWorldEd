import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  createConvexPrismFromFace,
  orderConvexPolygon
} from '../../src/transform/convex_face_prism.js';
import { findCoplanarFaceIndices, getTriangleCount } from '../../src/selection/triangle_geometry_utils.js';

describe('createConvexPrismFromFace', () => {
  it('should create a new mesh without modifying the source', () => {
    const source = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const beforeCount = getTriangleCount(source.geometry);
    const faceIndices = findCoplanarFaceIndices(source.geometry, 0);
    const prism = createConvexPrismFromFace(source, faceIndices, 1.0, 'Extrude001');
    expect(prism).not.toBeNull();
    expect(getTriangleCount(source.geometry)).toBe(beforeCount);
    expect(prism!.name).toBe('Extrude001');
  });

  it('should produce a closed prism with more than one face', () => {
    const source = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
    const faceIndices = findCoplanarFaceIndices(source.geometry, 0);
    const prism = createConvexPrismFromFace(source, faceIndices, 0.5, 'Extrude002');
    expect(prism).not.toBeNull();
    expect(getTriangleCount(prism!.geometry)).toBeGreaterThanOrEqual(8);
  });

  it('should return null for empty face selection', () => {
    const source = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const prism = createConvexPrismFromFace(source, [], 1.0, 'Extrude003');
    expect(prism).toBeNull();
  });

  it('should include decorative edge outlines on the new solid', () => {
    const source = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const faceIndices = findCoplanarFaceIndices(source.geometry, 0);
    const prism = createConvexPrismFromFace(source, faceIndices, 1.0, 'Extrude004');
    const hasEdges = prism!.children.some((child) => child instanceof THREE.LineSegments);
    expect(hasEdges).toBe(true);
  });

  it('should keep decorative edges centered with the mesh geometry', () => {
    const source = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    source.position.set(0, 2, 0);
    source.updateMatrixWorld(true);
    const faceIndices = findCoplanarFaceIndices(source.geometry, 0);
    const prism = createConvexPrismFromFace(source, faceIndices, 1.0, 'Extrude005');
    const edge = prism!.children.find(
      (child) => child instanceof THREE.LineSegments
    ) as THREE.LineSegments;
    expect(edge).toBeDefined();
    edge.geometry.computeBoundingBox();
    prism!.geometry.computeBoundingBox();
    const edgeCenter = edge.geometry.boundingBox!.getCenter(new THREE.Vector3());
    const meshCenter = prism!.geometry.boundingBox!.getCenter(new THREE.Vector3());
    expect(edgeCenter.distanceTo(meshCenter)).toBeLessThan(0.01);
  });

  it('should place the prism near the extruded face in world space', () => {
    const source = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    source.position.set(0, 2, 0);
    source.updateMatrixWorld(true);
    const faceIndices = findCoplanarFaceIndices(source.geometry, 0);
    const prism = createConvexPrismFromFace(source, faceIndices, 1.0, 'Extrude006');
    expect(prism!.position.length()).toBeGreaterThan(0.1);
  });
});

describe('orderConvexPolygon', () => {
  it('should order four coplanar points into a cycle', () => {
    const normal = new THREE.Vector3(0, 1, 0);
    const points = [
      new THREE.Vector3(1, 0, 1),
      new THREE.Vector3(-1, 0, 1),
      new THREE.Vector3(-1, 0, -1),
      new THREE.Vector3(1, 0, -1)
    ];
    const ordered = orderConvexPolygon(points, normal);
    expect(ordered.length).toBe(4);
  });
});
