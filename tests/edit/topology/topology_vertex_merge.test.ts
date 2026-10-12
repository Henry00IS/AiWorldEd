import { describe, expect, it } from 'vitest';
import { SolidBrushFactory } from '@/solid/brush/solid_brush_factory.js';
import { mergeTopologyWorkingVertices } from '@/edit/topology/topology_vertex_merge.js';
import { detectTopologyCoincidentClusters } from '@/edit/topology/topology_coincident.js';
import { collectTopologyWorkingEdges } from '@/edit/topology/topology_working_edges_collect.js';
import { brushToWorkingGeometry } from '@/edit/topology/topology_working_from_brush.js';
import { topologyWorkingVertexRead } from '@/edit/topology/topology_working_vertex_read.js';

describe('topology_vertex_merge', () => {
  it('merges two selected cube vertices at their center', () => {
    const working = brushToWorkingGeometry(SolidBrushFactory.createCenteredBox(2, 2, 2));
    const edge = collectTopologyWorkingEdges(working)[0];
    expect(edge).toBeTruthy();
    if (!edge) {
      return;
    }
    const beforeCount = working.positions.length;
    const result = mergeTopologyWorkingVertices(working, [edge.vertexA, edge.vertexB], 'at_center');
    expect(result.applied).toBe(true);
    expect(working.positions.length).toBeLessThan(beforeCount);
  });

  it('welds authored coincident vertices by distance', () => {
    const working = brushToWorkingGeometry(SolidBrushFactory.createCenteredBox(2, 2, 2));
    const source = topologyWorkingVertexRead(working, 0);
    expect(source).toBeTruthy();
    if (!source) {
      return;
    }
    working.positions.push(source.clone());
    const clustersBefore = detectTopologyCoincidentClusters(working);
    expect(clustersBefore.length).toBeGreaterThan(0);
    const result = mergeTopologyWorkingVertices(working, [], 'by_distance');
    expect(result.applied).toBe(true);
    expect(detectTopologyCoincidentClusters(working)).toHaveLength(0);
  });
});
