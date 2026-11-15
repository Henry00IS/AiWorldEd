import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { bridgeTopologyWorkingEdgeLoops } from '@/edit/topology/topology_edge_bridge.js';
import { collectTopologyEdgeChains } from '@/edit/topology/topology_edge_chain.js';
import type { TopologyWorkingGeometry } from '@/edit/topology/topology_working_geometry.js';
import {
  topologyTestBox,
  topologyTestIsClosedAndConsistent,
  topologyTestVolume,
} from './support/topology_test_geometry.js';

describe('bridgeTopologyWorkingEdgeLoops', () => {
  it('joins two facing plates into a closed box', () => {
    const size = 1 + Math.random();
    const geometry = twoPlates(size, 3);
    const result = bridgeTopologyWorkingEdgeLoops(geometry, [...loopEdges([0, 1, 2, 3]), ...loopEdges([4, 5, 6, 7])]);
    expect(result.applied).toBe(true);
    expect(geometry.faces).toHaveLength(6);
    expect(topologyTestIsClosedAndConsistent(geometry)).toBe(true);
    expect(topologyTestVolume(geometry)).toBeCloseTo(size * size * size, 9);
  });

  it('matches the closest corners even when the second loop is numbered from elsewhere', () => {
    const geometry = twoPlates(1, 2);
    expect(
      bridgeTopologyWorkingEdgeLoops(geometry, [...loopEdges([0, 1, 2, 3]), ...loopEdges([4, 5, 6, 7])]).applied,
    ).toBe(true);
    for (const face of geometry.faces.slice(2)) {
      const points = face.vertexIndices.map((vertex) => geometry.positions[vertex]!);
      const longest = Math.max(...points.map((point, index) => point.distanceTo(points[(index + 1) % points.length]!)));
      expect(longest).toBeLessThan(1.0001);
    }
  });

  it('bridges two open edge chains with a strip of quads', () => {
    const geometry = topologyTestBox(1);
    geometry.faces.splice(1, 1);
    const result = bridgeTopologyWorkingEdgeLoops(geometry, [
      { vertexA: 4, vertexB: 5 },
      { vertexA: 7, vertexB: 6 },
    ]);
    expect(result.applied).toBe(true);
    expect(geometry.faces).toHaveLength(6);
    expect(topologyTestIsClosedAndConsistent(geometry)).toBe(true);
  });

  it('refuses one loop, three loops or loops of different length', () => {
    const geometry = topologyTestBox(1);
    expect(bridgeTopologyWorkingEdgeLoops(geometry, loopEdges([4, 5, 6, 7])).applied).toBe(false);
    expect(
      bridgeTopologyWorkingEdgeLoops(geometry, [
        { vertexA: 4, vertexB: 5 },
        { vertexA: 5, vertexB: 6 },
        { vertexA: 0, vertexB: 1 },
      ]).applied,
    ).toBe(false);
  });
});

describe('collectTopologyEdgeChains', () => {
  it('finds open and closed chains and refuses branches', () => {
    const chains = collectTopologyEdgeChains([
      ...loopEdges([0, 1, 2]),
      { vertexA: 5, vertexB: 6 },
      { vertexA: 6, vertexB: 7 },
    ])!;
    expect(chains.map((chain) => chain.closed).sort()).toEqual([false, true]);
    expect(chains.find((chain) => !chain.closed)!.vertices).toEqual([5, 6, 7]);
    expect(collectTopologyEdgeChains([...loopEdges([0, 1, 2]), { vertexA: 0, vertexB: 9 }])).toBeNull();
  });
});

/**
 * Builds two square plates facing each other, the second numbered from a
 * shifted corner.
 *
 * @param size Edge length and gap.
 * @param shift Corner the second plate starts at.
 * @returns Geometry with two faces.
 */
function twoPlates(size: number, shift: number): TopologyWorkingGeometry {
  const square = [
    [0, 0],
    [size, 0],
    [size, size],
    [0, size],
  ];
  const bottom = square.map(([x, y]) => new THREE.Vector3(x, y, 0));
  const top = [0, 1, 2, 3].map((index) => {
    const [x, y] = square[(index + shift) % 4]!;
    return new THREE.Vector3(x, y, size);
  });
  const uvs = [0, 1, 2, 3].map(() => ({ u: 0, v: 0 }));
  const topLoop = [0, 1, 2, 3].map((index) => 4 + ((4 - shift + index) % 4));
  return {
    positions: [...bottom, ...top],
    faces: [
      { vertexIndices: [3, 2, 1, 0], cornerUvs: uvs, textureId: 't' },
      { vertexIndices: topLoop, cornerUvs: uvs.map((uv) => ({ ...uv })), textureId: 't' },
    ],
  };
}

/**
 * Lists the edges of a closed loop.
 *
 * @param loop Vertices.
 * @returns Edges.
 */
function loopEdges(loop: number[]): Array<{ vertexA: number; vertexB: number }> {
  return loop.map((vertex, index) => ({ vertexA: vertex, vertexB: loop[(index + 1) % loop.length]! }));
}
