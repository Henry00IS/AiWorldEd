import { describe, expect, it } from 'vitest';
import { fillTopologyWorkingHoles } from '@/edit/topology/topology_face_fill_holes.js';
import {
  topologyTestBox,
  topologyTestIsClosedAndConsistent,
  topologyTestVolume,
} from './support/topology_test_geometry.js';

describe('fillTopologyWorkingHoles', () => {
  it('closes an open box again from one rim vertex', () => {
    const size = 1 + Math.random();
    const geometry = topologyTestBox(size);
    const rim = geometry.faces.splice(0, 1)[0]!.vertexIndices;
    expect(fillTopologyWorkingHoles(geometry, [rim[2]!]).applied).toBe(true);
    expect(geometry.faces).toHaveLength(6);
    expect(topologyTestIsClosedAndConsistent(geometry)).toBe(true);
    expect(topologyTestVolume(geometry)).toBeCloseTo(size ** 3, 9);
  });

  it('fills only the holes the selection touches', () => {
    const geometry = topologyTestBox(1);
    geometry.faces.splice(0, 2);
    expect(fillTopologyWorkingHoles(geometry, [3]).applied).toBe(true);
    expect(geometry.faces).toHaveLength(5);
    expect([...geometry.faces[4]!.vertexIndices].sort()).toEqual([0, 1, 2, 3]);
  });

  it('refuses a closed mesh', () => {
    const geometry = topologyTestBox(1);
    expect(fillTopologyWorkingHoles(geometry, [0, 1, 2]).applied).toBe(false);
  });
});
