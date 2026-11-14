import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SeamPolygonTriangulator } from '@/solid/mesh/seam/seam_polygon_triangulator.js';

/**
 * Twice the signed area of a triangle seen from +y.
 *
 * @param a First corner.
 * @param b Second corner.
 * @param c Third corner.
 * @returns Signed doubled area.
 */
function doubledAreaFromAbove(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3): number {
  return new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).y;
}

/**
 * Builds a rectangle in the y = 0 plane wound counter-clockwise from +y, with
 * extra points placed on its edges.
 *
 * @param width Extent along x.
 * @param depth Extent along z.
 * @param pointsOnNearEdge Fractions along the z = depth edge for extra points.
 * @param pointsOnFarEdge Fractions along the z = 0 edge for extra points.
 * @returns Outline vertices.
 */
function rectangleWithEdgePoints(
  width: number,
  depth: number,
  pointsOnNearEdge: number[],
  pointsOnFarEdge: number[],
): THREE.Vector3[] {
  const outline = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, depth)];
  for (const fraction of pointsOnNearEdge) outline.push(new THREE.Vector3(width * fraction, 0, depth));
  outline.push(new THREE.Vector3(width, 0, depth), new THREE.Vector3(width, 0, 0));
  for (const fraction of pointsOnFarEdge) outline.push(new THREE.Vector3(width * (1 - fraction), 0, 0));
  return outline;
}

/**
 * Checks a triangulation covers the outline with triangles that all have area.
 *
 * @param outline Outline vertices.
 * @param corners Flat triangle corner indices.
 * @param expectedArea Area the outline encloses.
 */
function expectFullTriangulationWithoutFlatTriangles(
  outline: THREE.Vector3[],
  corners: number[],
  expectedArea: number,
): void {
  expect(corners.length).toBe((outline.length - 2) * 3);
  let total = 0;
  for (let index = 0; index < corners.length; index += 3) {
    const doubled = doubledAreaFromAbove(
      outline[corners[index]!]!,
      outline[corners[index + 1]!]!,
      outline[corners[index + 2]!]!,
    );
    expect(doubled).toBeGreaterThan(1e-9);
    total += doubled / 2;
  }
  expect(total).toBeCloseTo(expectedArea, 9);
}

describe('Seam polygon triangulator', () => {
  it('fans from the first vertex when nothing lies on its edges', () => {
    const outline = rectangleWithEdgePoints(2, 1, [], []);
    expect(new SeamPolygonTriangulator().triangulate(outline)).toEqual([0, 1, 2, 0, 2, 3]);
  });

  it('never lays a triangle along one straight edge when points sit on opposite edges', () => {
    const outline = rectangleWithEdgePoints(3, 1.5, [0.25, 0.6], [0.5]);
    const corners = new SeamPolygonTriangulator().triangulate(outline);
    expectFullTriangulationWithoutFlatTriangles(outline, corners, 4.5);
  });

  it('still finds flat-free triangles when every edge carries points', () => {
    const triangle = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(1, 0, 2),
      new THREE.Vector3(2, 0, 2),
      new THREE.Vector3(3, 0, 2),
      new THREE.Vector3(4, 0, 0),
    ];
    const withMiddle = [
      ...triangle.slice(0, 4),
      new THREE.Vector3(3.5, 0, 1),
      triangle[4]!,
      new THREE.Vector3(2, 0, 0),
    ];
    const corners = new SeamPolygonTriangulator().triangulate(withMiddle);
    expectFullTriangulationWithoutFlatTriangles(withMiddle, corners, 6);
  });

  it('reports outlines whose vertices all lie on one line as having no area', () => {
    const line = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(3, 0, 0)];
    expect(new SeamPolygonTriangulator().outlineHasArea(line)).toBe(false);
    expect(new SeamPolygonTriangulator().outlineHasArea(rectangleWithEdgePoints(1, 1, [], []))).toBe(true);
  });

  /** A fan never cuts a triangle from the points of one edge. */
  it('fans so that no triangle lies along one edge', () => {
    const outline = rectangleWithEdgePoints(2, 1, [0.5], []);
    const corners = new SeamPolygonTriangulator().triangulate(outline);
    for (let offset = 0; offset < corners.length; offset += 3) {
      const triangle = corners.slice(offset, offset + 3).map((index) => outline[index]!);
      expect(triangle.every((vertex) => vertex.z === 1)).toBe(false);
    }
  });

  /** A corner almost in line with a run of edge points is not used as apex. */
  it('does not fan from a corner that is nearly in line with a run of points', () => {
    const outline = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0.25, 0, 0.25),
      new THREE.Vector3(0.5, 0, 0.5),
      new THREE.Vector3(0.75, 0, 0.75),
      new THREE.Vector3(1.0001, 0, 1),
      new THREE.Vector3(2, 0, 0),
    ];
    const corners = new SeamPolygonTriangulator().triangulate(outline);
    expect(corners).toHaveLength(12);
    for (let offset = 0; offset < corners.length; offset += 3) {
      const [first, second, third] = corners.slice(offset, offset + 3).map((index) => outline[index]!);
      const doubledArea = new THREE.Vector3()
        .subVectors(second!, first!)
        .cross(new THREE.Vector3().subVectors(third!, first!))
        .length();
      expect(doubledArea).toBeGreaterThan(0.1);
    }
  });
});
