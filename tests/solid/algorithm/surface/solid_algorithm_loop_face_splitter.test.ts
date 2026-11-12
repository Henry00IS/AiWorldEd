import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { HashedVertexTable } from '@/solid/algorithm/spatial/hashed_vertex_table.js';
import { SolidAlgorithmLoopFaceSplitter } from '@/solid/algorithm/surface/solid_algorithm_loop_face_splitter.js';
import type { SolidAlgorithmSurfaceLoop } from '@/solid/algorithm/surface/solid_algorithm_surface_loop.js';
import { SurfaceCategory } from '@/solid/types/surface_category.js';

/**
 * Builds a unit square face on the XY plane.
 *
 * @returns Four corner vertices.
 */
function unitSquareFace(): THREE.Vector3[] {
  return [
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(2, 0, 0),
    new THREE.Vector3(2, 2, 0),
    new THREE.Vector3(0, 2, 0),
  ];
}

/**
 * Builds a convex hole loop inside the unit square.
 *
 * @returns Hole vertices.
 */
function centeredHoleLoop(): THREE.Vector3[] {
  return [
    new THREE.Vector3(0.5, 0.5, 0),
    new THREE.Vector3(1.5, 0.5, 0),
    new THREE.Vector3(1.5, 1.5, 0),
    new THREE.Vector3(0.5, 1.5, 0),
  ];
}

/**
 * Builds a surface loop record for splitter tests.
 *
 * @param loopVertices Loop polygon.
 * @returns Surface loop on face 0.
 */
function makeLoop(loopVertices: THREE.Vector3[]): SolidAlgorithmSurfaceLoop {
  return {
    subjectBrushIndex: 0,
    peerBrushIndex: 1,
    basePlaneIndex: 0,
    interiorCategory: SurfaceCategory.Inside,
    loopVertices,
  };
}

/** Loop face splitter welding and fragment production. */
describe('SolidAlgorithmLoopFaceSplitter', () => {
  it('returns the face unchanged when no loops are present', () => {
    const table = new HashedVertexTable();
    const fragments = SolidAlgorithmLoopFaceSplitter.splitByLoops(unitSquareFace(), [], table);
    expect(fragments).toHaveLength(1);
    expect(fragments[0]).toHaveLength(4);
  });

  it('splits a face into more than one fragment for an interior loop', () => {
    const table = new HashedVertexTable();
    const fragments = SolidAlgorithmLoopFaceSplitter.splitByLoops(
      unitSquareFace(),
      [makeLoop(centeredHoleLoop())],
      table,
    );
    expect(fragments.length).toBeGreaterThan(1);
    for (const fragment of fragments) {
      expect(fragment.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('welds shared cut points to identical table positions', () => {
    const table = new HashedVertexTable();
    const fragments = SolidAlgorithmLoopFaceSplitter.splitByLoops(
      unitSquareFace(),
      [makeLoop(centeredHoleLoop())],
      table,
    );
    const allPoints: THREE.Vector3[] = [];
    for (const fragment of fragments) {
      for (const vertex of fragment) {
        allPoints.push(vertex);
      }
    }
    const nearHoleCorner = allPoints.filter(
      (point) => Math.abs(point.x - 0.5) < 1e-6 && Math.abs(point.y - 0.5) < 1e-6,
    );
    expect(nearHoleCorner.length).toBeGreaterThan(0);
    const first = nearHoleCorner[0];
    if (!first) {
      return;
    }
    for (const point of nearHoleCorner) {
      expect(point.x).toBe(first.x);
      expect(point.y).toBe(first.y);
      expect(point.z).toBe(first.z);
    }
  });

  it('emits a fragment lying inside every loop edge as one piece in edge-walk order', () => {
    const table = new HashedVertexTable();
    const triangle = [
      new THREE.Vector3(0.75, 0.75, 0),
      new THREE.Vector3(1.25, 0.75, 0),
      new THREE.Vector3(1, 1.25, 0),
    ];
    const pieces = SolidAlgorithmLoopFaceSplitter.splitFragmentsByOneLoop([triangle], centeredHoleLoop(), table);
    expect(pieces).toHaveLength(1);
    // Four uniform edge clips each start the ring at its second vertex: 4 mod 3 = 1.
    expect(pieces[0]?.map((vertex) => vertex.toArray())).toEqual([
      [1.25, 0.75, 0],
      [1, 1.25, 0],
      [0.75, 0.75, 0],
    ]);
  });

  it('keeps the total area when a fragment straddles the loop after uniform edges', () => {
    const table = new HashedVertexTable();
    const square = [
      new THREE.Vector3(1, 1, 0),
      new THREE.Vector3(1.75, 1, 0),
      new THREE.Vector3(1.75, 1.25, 0),
      new THREE.Vector3(1, 1.25, 0),
    ];
    const pieces = SolidAlgorithmLoopFaceSplitter.splitFragmentsByOneLoop([square], centeredHoleLoop(), table);
    const area = (ring: THREE.Vector3[]): number =>
      Math.abs(
        ring.reduce(
          (sum, a, i) =>
            sum + a.x * (ring[(i + 1) % ring.length]?.y ?? 0) - (ring[(i + 1) % ring.length]?.x ?? 0) * a.y,
          0,
        ),
      ) / 2;
    expect(pieces.length).toBe(2);
    expect(pieces.reduce((sum, piece) => sum + area(piece), 0)).toBeCloseTo(0.1875, 12);
  });
});
