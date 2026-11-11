import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SolidSurfaceReplayVertexDifference } from '@/solid/algorithm/surface/replay/solid_surface_replay_vertex_difference.js';

/**
 * SolidSurfaceReplayVertexDifference tracks weld-table vertices that changed
 * between compiles.
 */
describe('SolidSurfaceReplayVertexDifference', () => {
  it('reports nothing when a face inserted the same vertices again', () => {
    const difference = new SolidSurfaceReplayVertexDifference();
    const vertices = [new THREE.Vector3(1, 2, 3), new THREE.Vector3(4, 5, 6)];
    difference.recordReplacement(
      vertices,
      vertices.map((vertex) => vertex.clone()),
    );
    expect(
      difference.intersectsBounds(new THREE.Box3(new THREE.Vector3(-10, -10, -10), new THREE.Vector3(10, 10, 10))),
    ).toBe(false);
    expect(difference.touchesQueries(vertices, 1)).toBe(false);
  });

  it('reports a moved vertex near queries and inside bounds only', () => {
    const difference = new SolidSurfaceReplayVertexDifference();
    const before = new THREE.Vector3(0, 0, 0);
    const after = new THREE.Vector3(0.25, 0, 0);
    difference.recordReplacement([before], [after]);
    expect(difference.touchesQueries([new THREE.Vector3(0.3, 0, 0)], 0.1)).toBe(true);
    expect(difference.touchesQueries([new THREE.Vector3(5, 5, 5)], 0.1)).toBe(false);
    const far = new THREE.Box3(new THREE.Vector3(3, 3, 3), new THREE.Vector3(4, 4, 4));
    expect(difference.intersectsBounds(far)).toBe(false);
    difference.clear();
    expect(difference.touchesQueries([before], 1)).toBe(false);
  });

  it('cancels a vertex removed by one face and added back by another', () => {
    const difference = new SolidSurfaceReplayVertexDifference();
    const point = new THREE.Vector3(1, 1, 1);
    difference.recordReplacement([point], []);
    difference.recordReplacement([], [point.clone()]);
    expect(difference.touchesQueries([point], 1)).toBe(false);
  });

  it('only reports the changed middle of a replaced list, including reordered vertices', () => {
    const difference = new SolidSurfaceReplayVertexDifference();
    const point = (x: number) => new THREE.Vector3(x, 0, 0);
    difference.recordReplacement(
      [point(0), point(10), point(20), point(30)],
      [point(0), point(15), point(20), point(30)],
    );
    expect(difference.touchesQueries([point(0), point(20), point(30)], 1)).toBe(false);
    expect(difference.touchesQueries([point(10)], 1)).toBe(true);
    expect(difference.touchesQueries([point(15)], 1)).toBe(true);
    difference.clear();
    difference.recordReplacement([point(1), point(2), point(3)], [point(1), point(3), point(2)]);
    expect(difference.touchesQueries([point(1), point(2), point(3)], 0.5)).toBe(false);
    expect(difference.intersectsBounds(new THREE.Box3(point(-5), point(5)))).toBe(false);
  });
});
