import { describe, expect, it } from 'vitest';
import { splitTopologyWorkingFaces } from '@/edit/topology/topology_face_copy.js';
import { topologyTestBox } from './support/topology_test_geometry.js';

describe('splitTopologyWorkingFaces', () => {
  it('gives the selected faces their own corners and leaves the rest alone', () => {
    const geometry = topologyTestBox(1);
    const others = geometry.faces.slice(2).map((face) => face.vertexIndices.slice());
    const corners = geometry.positions.length;
    expect(splitTopologyWorkingFaces(geometry, [0, 1]).applied).toBe(true);
    expect(geometry.faces.slice(2).map((face) => face.vertexIndices)).toEqual(others);
    const split = new Set(geometry.faces.slice(0, 2).flatMap((face) => face.vertexIndices));
    const rest = new Set(others.flat());
    expect([...split].some((vertex) => rest.has(vertex))).toBe(false);
    expect(geometry.positions.length).toBe(corners + split.size);
    expect(geometry.faces).toHaveLength(6);
  });

  it('keeps corners shared between selected faces shared', () => {
    const geometry = topologyTestBox(1);
    splitTopologyWorkingFaces(geometry, [0, 2]);
    const a = new Set(geometry.faces[0]!.vertexIndices);
    const shared = geometry.faces[2]!.vertexIndices.filter((vertex) => a.has(vertex));
    expect(shared.length).toBe(sharedCount(topologyTestBox(1), 0, 2));
  });

  it('refuses an empty selection and faces already apart', () => {
    const geometry = topologyTestBox(1);
    expect(splitTopologyWorkingFaces(geometry, []).applied).toBe(false);
    expect(splitTopologyWorkingFaces(geometry, [0, 1, 2, 3, 4, 5]).applied).toBe(false);
  });
});

/**
 * Counts the corners two faces of a geometry share.
 *
 * @param geometry Geometry.
 * @param first First face.
 * @param second Second face.
 * @returns Shared corner count.
 */
function sharedCount(geometry: ReturnType<typeof topologyTestBox>, first: number, second: number): number {
  const a = new Set(geometry.faces[first]!.vertexIndices);
  return geometry.faces[second]!.vertexIndices.filter((vertex) => a.has(vertex)).length;
}
