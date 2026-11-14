import { describe, expect, it } from 'vitest';
import { EditorComponentMode } from '@/types/editor_component_mode.js';
import { buildComponentEdgeKey } from '@/edit/component/component_selection_entry.js';
import { TOPOLOGY_VERTEX_EQUAL_EPSILON } from '@/edit/topology/topology_epsilon.js';
import { openTopologyMeshEditFixture, readTopologyMeshFixtureGeometry } from './support/topology_mesh_edit_fixture.js';

describe('HandlerComponentTopology knife selection', () => {
  it('selects the new vertex after a cut in Vertex mode', () => {
    const fixture = openTopologyMeshEditFixture();
    const before = readTopologyMeshFixtureGeometry(fixture);
    const [vertexA, vertexB] = before.faces[0]!.vertexIndices;
    const parameter = 0.25 + Math.random() * 0.5;
    const expected = before.positions[vertexA!]!.clone().lerp(before.positions[vertexB!]!, parameter);
    expect(fixture.handler.splitEdge(fixture.targetId, vertexA!, vertexB!, parameter)).toBe(true);
    const selected = fixture.session.getComponentSelection().getSelected();
    expect(selected).toHaveLength(1);
    expect(selected[0]!.kind).toBe('vertex');
    const after = readTopologyMeshFixtureGeometry(fixture);
    const position = after.positions[Number(selected[0]!.componentKey)]!;
    expect(position.distanceTo(expected)).toBeLessThan(TOPOLOGY_VERTEX_EQUAL_EPSILON);
  });

  it('selects both halves of the cut edge in Edge mode', () => {
    const fixture = openTopologyMeshEditFixture();
    fixture.session.setComponentMode(EditorComponentMode.EDGE, []);
    const before = readTopologyMeshFixtureGeometry(fixture);
    const [vertexA, vertexB] = before.faces[0]!.vertexIndices;
    expect(fixture.handler.splitEdge(fixture.targetId, vertexA!, vertexB!, 0.5)).toBe(true);
    const created = readTopologyMeshFixtureGeometry(fixture).positions.length - 1;
    const keys = fixture.session
      .getComponentSelection()
      .getSelected()
      .map((entry) => entry.componentKey)
      .sort();
    expect(keys).toEqual([buildComponentEdgeKey(vertexA!, created), buildComponentEdgeKey(created, vertexB!)].sort());
  });
});
