import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { rotateTopologyWorkingEdges } from '@/edit/topology/topology_edge_rotate.js';
import type { TopologyWorkingGeometry } from '@/edit/topology/topology_working_geometry.js';
import { topologyTestBox, topologyTestIsClosedAndConsistent } from './support/topology_test_geometry.js';

describe('rotateTopologyWorkingEdges', () => {
  it('gives a split square the other diagonal', () => {
    const geometry = splitSquare();
    const outcome = rotateTopologyWorkingEdges(geometry, [{ vertexA: 2, vertexB: 0 }]);
    expect(outcome.result.applied).toBe(true);
    expect([...outcome.edges[0]!].sort()).toEqual([1, 3]);
    expect(geometry.faces.map((face) => face.vertexIndices.length)).toEqual([3, 3]);
    expect(geometry.faces.every((face) => face.vertexIndices.includes(1) && face.vertexIndices.includes(3))).toBe(true);
    for (const face of geometry.faces) {
      face.vertexIndices.forEach((vertex, corner) => expect(face.cornerUvs[corner]!.u).toBe(vertex));
    }
  });

  it('keeps a closed box closed and drops the turned edge', () => {
    const geometry = topologyTestBox(2);
    const outcome = rotateTopologyWorkingEdges(geometry, [{ vertexA: 1, vertexB: 2 }]);
    expect(outcome.result.applied).toBe(true);
    expect(topologyTestIsClosedAndConsistent(geometry)).toBe(true);
    const joined = geometry.faces.some((face) => face.vertexIndices.includes(1) && face.vertexIndices.includes(2));
    expect(joined).toBe(false);
  });

  it('refuses border edges and turns that would fold a face', () => {
    expect(rotateTopologyWorkingEdges(splitSquare(), [{ vertexA: 0, vertexB: 1 }]).result.applied).toBe(false);
    const dart = splitSquare();
    dart.positions[0]!.set(0.6, 0.6, 0);
    expect(rotateTopologyWorkingEdges(dart, [{ vertexA: 0, vertexB: 2 }]).result.applied).toBe(false);
    expect(dart.faces[0]!.vertexIndices).toEqual([0, 1, 2]);
  });
});

/**
 * Builds a unit square split from corner 0 to corner 2, with each corner's U
 * equal to its vertex index.
 *
 * @returns Square geometry.
 */
function splitSquare(): TopologyWorkingGeometry {
  const positions = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ].map(([x, y]) => new THREE.Vector3(x, y, 0));
  const face = (loop: number[]) => ({
    vertexIndices: loop,
    cornerUvs: loop.map((vertex) => ({ u: vertex, v: 0 })),
    textureId: 't',
  });
  return { positions, faces: [face([0, 1, 2]), face([0, 2, 3])] };
}
