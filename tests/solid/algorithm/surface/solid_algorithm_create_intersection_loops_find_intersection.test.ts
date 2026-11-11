import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SolidPlane } from '@/solid/brush/solid_plane.js';
import { HashedVertexTable } from '@/solid/algorithm/spatial/hashed_vertex_table.js';
import { SolidAlgorithmCreateIntersectionLoopsFindIntersection } from '@/solid/algorithm/surface/solid_algorithm_create_intersection_loops_find_intersection.js';
import type { SolidAlgorithmPlanePair } from '@/solid/algorithm/surface/solid_algorithm_plane_pair.js';
import type { SolidAlgorithmPlaneVertexIndexPair } from '@/solid/algorithm/surface/solid_algorithm_plane_vertex_index_pair.js';

/**
 * Builds the planes of a box of half extent one whose top face is split into
 * two coplanar halves (indices 0 and 1).
 *
 * @returns Box planes with a split top face.
 */
function boxPlanesWithSplitTop(): SolidPlane[] {
  const up = new THREE.Vector3(0, 1, 0);
  return [
    new SolidPlane(up.clone(), -1),
    new SolidPlane(up.clone(), -1),
    new SolidPlane(new THREE.Vector3(1, 0, 0), -1),
    new SolidPlane(new THREE.Vector3(-1, 0, 0), -1),
    new SolidPlane(new THREE.Vector3(0, 0, 1), -1),
    new SolidPlane(new THREE.Vector3(0, 0, -1), -1),
    new SolidPlane(new THREE.Vector3(0, -1, 0), -1),
  ];
}

/**
 * Builds the seam edge between the two coplanar top halves, running along Z at
 * x = 0.
 *
 * @param planes Box planes from boxPlanesWithSplitTop.
 * @returns Edge plane pair of the seam.
 */
function splitTopSeam(planes: readonly SolidPlane[]): SolidAlgorithmPlanePair {
  const [topHalf0, topHalf1] = planes;
  if (!topHalf0 || !topHalf1) {
    throw new Error('missing top halves');
  }
  return {
    plane0: topHalf0,
    plane1: topHalf1,
    edgeVertex0: new THREE.Vector3(0, 1, -1),
    edgeVertex1: new THREE.Vector3(0, 1, 1),
    planeIndex0: 0,
    planeIndex1: 1,
  };
}

describe('SolidAlgorithmCreateIntersectionLoopsFindIntersection', () => {
  it('finds where a crossing plane meets an edge between two coplanar faces', () => {
    const crossingDepth = 0.5;
    const crossingPlanes = [new SolidPlane(new THREE.Vector3(0, 0, 1), -crossingDepth)];
    const boxPlanes = boxPlanesWithSplitTop();
    const vertexTable = new HashedVertexTable();
    const found0: SolidAlgorithmPlaneVertexIndexPair[] = [];
    const found1: SolidAlgorithmPlaneVertexIndexPair[] = [];
    SolidAlgorithmCreateIntersectionLoopsFindIntersection.find(
      crossingPlanes,
      crossingPlanes.length,
      crossingPlanes.length,
      boxPlanes,
      boxPlanes.length,
      boxPlanes.length,
      [splitTopSeam(boxPlanes)],
      [0],
      vertexTable,
      new HashedVertexTable(),
      found0,
      found1,
    );
    expect(found0).toHaveLength(1);
    expect(found1.map((pair) => pair.planeIndex).sort()).toEqual([0, 1]);
    const crossing = found0[0];
    expect(crossing).toBeDefined();
    if (!crossing) {
      return;
    }
    const expectedCrossing = new THREE.Vector3(0, 1, crossingDepth);
    expect(vertexTable.get(crossing.vertexIndex).distanceTo(expectedCrossing)).toBeLessThan(1e-9);
  });
});
