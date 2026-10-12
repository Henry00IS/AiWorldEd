import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { SolidBrushFactory } from '@/solid/brush/solid_brush_factory.js';
import { detectTopologyCoincidentClusters } from '@/edit/topology/topology_coincident.js';
import { brushToWorkingGeometry } from '@/edit/topology/topology_working_from_brush.js';
import { topologyWorkingVertexRead } from '@/edit/topology/topology_working_vertex_read.js';

describe('topology_coincident', () => {
  it('groups three vertices at one position as a single cluster', () => {
    const working = brushToWorkingGeometry(SolidBrushFactory.createCenteredBox(2, 2, 2));
    const source = topologyWorkingVertexRead(working, 0);
    expect(source).toBeTruthy();
    if (!source) {
      return;
    }
    working.positions.push(source.clone());
    working.positions.push(source.clone());
    const clusters = detectTopologyCoincidentClusters(working);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]?.vertexIndices).toHaveLength(3);
  });

  it('reports no clusters on a unique-vertex cube', () => {
    const working = brushToWorkingGeometry(SolidBrushFactory.createCenteredBox(2, 2, 2));
    expect(detectTopologyCoincidentClusters(working)).toHaveLength(0);
  });

  it('groups vertices that fall in neighboring grid cells', () => {
    const working = brushToWorkingGeometry(SolidBrushFactory.createCenteredBox(2, 2, 2));
    const samples = uniqueLineSamples(4000);
    for (const sample of samples) {
      working.positions.push(sample);
    }
    const epsilon = 1e-4;
    working.positions.push(samples[10]!.clone());
    const boundary = new Vector3(epsilon * 0.99, 50, 0);
    const nextCell = new Vector3(epsilon * 1.01, 50, 0);
    working.positions.push(boundary, nextCell);
    const clusters = detectTopologyCoincidentClusters(working, epsilon);
    expect(clusters.length).toBe(2);
    expect(clusters.every((cluster) => cluster.vertexIndices.length === 2)).toBe(true);
  });

  it('groups samples that sit in diagonally neighboring cells', () => {
    const epsilon = 1e-4;
    const working = brushToWorkingGeometry(SolidBrushFactory.createCenteredBox(2, 2, 2));
    working.positions.push(new Vector3(epsilon * 0.99, epsilon * 0.99, epsilon * 0.99));
    working.positions.push(new Vector3(epsilon * 1.01, epsilon * 1.01, epsilon * 1.01));
    const clusters = detectTopologyCoincidentClusters(working, epsilon);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]?.vertexIndices).toHaveLength(2);
  });
});

/**
 * Builds separated positions along X so only explicit duplicates cluster.
 *
 * @param count Sample count.
 * @returns Positions one unit apart.
 */
function uniqueLineSamples(count: number): Vector3[] {
  const samples: Vector3[] = [];
  for (let index = 0; index < count; index++) {
    samples.push(new Vector3(100 + index, 0, 0));
  }
  return samples;
}
