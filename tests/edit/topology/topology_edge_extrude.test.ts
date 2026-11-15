import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { extrudeTopologyWorkingEdges } from '@/edit/topology/topology_edge_extrude.js';
import type { TopologyWorkingGeometry } from '@/edit/topology/topology_working_geometry.js';
import { topologyTestBox } from './support/topology_test_geometry.js';

describe('extrudeTopologyWorkingEdges', () => {
  it('pulls a plate edge straight out of the plate into a new quad', () => {
    const geometry = plate();
    const distance = 0.5 + Math.random();
    const outcome = extrudeTopologyWorkingEdges(geometry, [{ vertexA: 0, vertexB: 1 }], distance);
    expect(outcome.result.applied).toBe(true);
    expect(geometry.faces).toHaveLength(2);
    const [outerA, outerB] = outcome.outerEdges[0]!;
    expect(geometry.positions[outerA]!.distanceTo(new THREE.Vector3(0, -distance, 0))).toBeCloseTo(0, 9);
    expect(geometry.positions[outerB]!.distanceTo(new THREE.Vector3(1, -distance, 0))).toBeCloseTo(0, 9);
    expect(hasOneWayEdges(geometry)).toBe(true);
    expect(geometry.faces[1]!.cornerUvs.every((uv) => Number.isFinite(uv.u) && Number.isFinite(uv.v))).toBe(true);
  });

  it('keeps a strip of even width around a corner of two border edges', () => {
    const geometry = plate();
    const outcome = extrudeTopologyWorkingEdges(
      geometry,
      [
        { vertexA: 0, vertexB: 1 },
        { vertexA: 1, vertexB: 2 },
      ],
      1,
    );
    expect(outcome.outerEdges).toHaveLength(2);
    const corner = outcome.outerEdges[0]![1];
    expect(geometry.positions[corner]!.distanceTo(new THREE.Vector3(2, -1, 0))).toBeCloseTo(0, 9);
    expect(hasOneWayEdges(geometry)).toBe(true);
  });

  it('refuses edges that two faces share and a zero distance', () => {
    const geometry = topologyTestBox(1);
    expect(extrudeTopologyWorkingEdges(geometry, [{ vertexA: 0, vertexB: 1 }], 1).result.applied).toBe(false);
    expect(extrudeTopologyWorkingEdges(plate(), [{ vertexA: 0, vertexB: 1 }], 0).result.applied).toBe(false);
  });
});

/**
 * Builds one unit square facing +Z.
 *
 * @returns Plate geometry.
 */
function plate(): TopologyWorkingGeometry {
  return {
    positions: [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ].map(([x, y]) => new THREE.Vector3(x, y, 0)),
    faces: [
      {
        vertexIndices: [0, 1, 2, 3],
        cornerUvs: [
          { u: 0, v: 0 },
          { u: 1, v: 0 },
          { u: 1, v: 1 },
          { u: 0, v: 1 },
        ],
        textureId: 't',
      },
    ],
  };
}

/**
 * Returns whether no directed edge is used twice, so neighbours wind alike.
 *
 * @param geometry Geometry.
 * @returns True when every directed edge is unique.
 */
function hasOneWayEdges(geometry: TopologyWorkingGeometry): boolean {
  const seen = new Set<string>();
  for (const face of geometry.faces) {
    for (const [corner, vertex] of face.vertexIndices.entries()) {
      const key = `${vertex}>${face.vertexIndices[(corner + 1) % face.vertexIndices.length]}`;
      if (seen.has(key)) return false;
      seen.add(key);
    }
  }
  return true;
}
