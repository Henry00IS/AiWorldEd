import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { ConvexPolygonClipper } from '../../src/solid/algorithm/convex_polygon_clipper.js';
import { SolidPlane } from '../../src/solid/brush/solid_plane.js';

/**
 * Unit tests for convex polygon plane clipping used by solid CSG.
 */
describe('ConvexPolygonClipper', () => {
  it('clips a unit square by a mid plane keeping both halves', () => {
    const square = [
      new THREE.Vector3(-1, -1, 0),
      new THREE.Vector3(1, -1, 0),
      new THREE.Vector3(1, 1, 0),
      new THREE.Vector3(-1, 1, 0)
    ];
    const plane = new SolidPlane(new THREE.Vector3(1, 0, 0), 0);
    const result = ConvexPolygonClipper.clipByPlane(square, plane);
    expect(result.inside.length).toBeGreaterThanOrEqual(3);
    expect(result.outside.length).toBeGreaterThanOrEqual(3);
    for (const point of result.inside) {
      expect(point.x).toBeLessThanOrEqual(1e-5);
    }
    for (const point of result.outside) {
      expect(point.x).toBeGreaterThanOrEqual(-1e-5);
    }
  });

  it('clips a polygon fully inside all planes of a box', () => {
    const square = [
      new THREE.Vector3(-0.5, -0.5, 0),
      new THREE.Vector3(0.5, -0.5, 0),
      new THREE.Vector3(0.5, 0.5, 0),
      new THREE.Vector3(-0.5, 0.5, 0)
    ];
    const planes = [
      new SolidPlane(new THREE.Vector3(1, 0, 0), -1),
      new SolidPlane(new THREE.Vector3(-1, 0, 0), -1),
      new SolidPlane(new THREE.Vector3(0, 1, 0), -1),
      new SolidPlane(new THREE.Vector3(0, -1, 0), -1)
    ];
    const clipped = ConvexPolygonClipper.clipInsideAllPlanes(square, planes);
    expect(clipped.length).toBe(4);
  });
});
