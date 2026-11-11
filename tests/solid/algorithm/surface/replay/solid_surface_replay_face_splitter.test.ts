import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { HashedVertexTable } from '@/solid/algorithm/spatial/hashed_vertex_table.js';
import { SolidAlgorithmLoopFaceSplitter } from '@/solid/algorithm/surface/solid_algorithm_loop_face_splitter.js';
import type { SolidAlgorithmSurfaceLoop } from '@/solid/algorithm/surface/solid_algorithm_surface_loop.js';
import { SolidSurfaceReplayFaceSplitter } from '@/solid/algorithm/surface/replay/solid_surface_replay_face_splitter.js';
import { SurfaceCategory } from '@/solid/types/surface_category.js';

/**
 * Builds a square face on the XY plane.
 *
 * @param size Edge length.
 * @returns Corner vertices in counter-clockwise order.
 */
function squareFace(size: number): THREE.Vector3[] {
  return [
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(size, 0, 0),
    new THREE.Vector3(size, size, 0),
    new THREE.Vector3(0, size, 0),
  ];
}

/**
 * Builds a square loop on the face plane.
 *
 * @param x Minimum X.
 * @param y Minimum Y.
 * @param size Edge length.
 * @param peerBrushIndex Owning peer index.
 * @returns Surface loop on face 0.
 */
function squareLoop(x: number, y: number, size: number, peerBrushIndex: number): SolidAlgorithmSurfaceLoop {
  return {
    subjectBrushIndex: 0,
    peerBrushIndex,
    basePlaneIndex: 0,
    interiorCategory: SurfaceCategory.Inside,
    loopVertices: [
      new THREE.Vector3(x, y, 0),
      new THREE.Vector3(x + size, y, 0),
      new THREE.Vector3(x + size, y + size, 0),
      new THREE.Vector3(x, y + size, 0),
    ],
  };
}

/**
 * Serializes fragments to compare coordinates exactly.
 *
 * @param pieces Fragments.
 * @returns Text form.
 */
function piecesText(pieces: readonly THREE.Vector3[][]): string {
  return pieces.map((piece) => piece.map((vertex) => `${vertex.x},${vertex.y},${vertex.z}`).join(';')).join('|');
}

/**
 * SolidSurfaceReplayFaceSplitter matches the plain splitter while
 * checkpointing.
 */
describe('SolidSurfaceReplayFaceSplitter', () => {
  it('produces the same fragments and weld table as the plain splitter', () => {
    const loops = [squareLoop(1, 1, 3, 1), squareLoop(2.5, 2, 4, 2), squareLoop(6, 6, 2, 3)];
    const plainTable = new HashedVertexTable();
    const plain = SolidAlgorithmLoopFaceSplitter.splitByLoops(squareFace(10), loops, plainTable);
    const split = SolidSurfaceReplayFaceSplitter.split(squareFace(10), loops, new HashedVertexTable(), null, 2);
    expect(piecesText(split.pieces)).toBe(piecesText(plain));
    expect(split.insertedVertices.length).toBe(plainTable.count);
    expect(split.checkpoint?.loopCount).toBe(2);
    expect(split.weldQueries.length).toBeGreaterThanOrEqual(split.insertedVertices.length);
  });

  it('resuming from a checkpoint with a changed last loop equals splitting from scratch', () => {
    const stable = [squareLoop(1, 1, 3, 1), squareLoop(2.5, 2, 4, 2)];
    const first = SolidSurfaceReplayFaceSplitter.split(
      squareFace(10),
      [...stable, squareLoop(5, 5, 2, 3)],
      new HashedVertexTable(),
      null,
      2,
    );
    const changed = [...stable, squareLoop(5.3, 4.9, 2, 3)];
    const resumed = SolidSurfaceReplayFaceSplitter.split(
      squareFace(10),
      changed,
      new HashedVertexTable(),
      first.checkpoint,
      2,
    );
    const fresh = SolidSurfaceReplayFaceSplitter.split(squareFace(10), changed, new HashedVertexTable(), null, -1);
    expect(piecesText(resumed.pieces)).toBe(piecesText(fresh.pieces));
    expect(piecesText([resumed.insertedVertices])).toBe(piecesText([fresh.insertedVertices]));
    expect(resumed.checkpoint).toBe(first.checkpoint);
  });

  it('returns nothing for a degenerate face', () => {
    const split = SolidSurfaceReplayFaceSplitter.split(
      squareFace(1).slice(0, 2),
      [],
      new HashedVertexTable(),
      null,
      -1,
    );
    expect(split.pieces).toEqual([]);
    expect(split.checkpoint).toBeNull();
  });
});
