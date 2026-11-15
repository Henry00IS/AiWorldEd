import { describe, expect, it } from 'vitest';
import { EditorComponentMode } from '@/types/editor_component_mode.js';
import { buildComponentEdgeKey } from '@/edit/component/component_selection_entry.js';
import { openTopologyMeshEditFixture, readTopologyMeshFixtureGeometry } from './support/topology_mesh_edit_fixture.js';

describe('HandlerComponentMeshOperations connect vertices', () => {
  it('cuts a face between two selected corners and undoes in one step', () => {
    const fixture = openTopologyMeshEditFixture();
    const [a, b] = readTopologyMeshFixtureGeometry(fixture).faces[0]!.vertexIndices;
    fixture.session.setComponentMode(EditorComponentMode.EDGE, []);
    fixture.session
      .getComponentSelection()
      .replaceAll([{ targetId: fixture.targetId, kind: 'edge', componentKey: buildComponentEdgeKey(a!, b!) }]);
    fixture.operations.subdivideSelectedEdges(1);
    const before = readTopologyMeshFixtureGeometry(fixture);
    const loop = before.faces[0]!.vertexIndices;
    fixture.session.setComponentMode(EditorComponentMode.VERTEX, []);
    fixture.session.getComponentSelection().replaceAll(
      [loop[1]!, loop[3]!].map((vertex) => ({
        targetId: fixture.targetId,
        kind: 'vertex' as const,
        componentKey: String(vertex),
      })),
    );
    expect(fixture.operations.connectSelectedVertices()).toBe(true);
    expect(readTopologyMeshFixtureGeometry(fixture).faces.length).toBe(before.faces.length + 1);
    expect(fixture.session.getComponentSelection().getSelected()).toHaveLength(2);
    expect(fixture.commandStack.undo()).toBe(true);
    expect(readTopologyMeshFixtureGeometry(fixture).faces.length).toBe(before.faces.length);
  });

  it('only connects in Vertex mode', () => {
    const fixture = openTopologyMeshEditFixture();
    fixture.session.setComponentMode(EditorComponentMode.FACE, []);
    fixture.session
      .getComponentSelection()
      .replaceAll([{ targetId: fixture.targetId, kind: 'face', componentKey: '0' }]);
    expect(fixture.operations.connectSelectedVertices()).toBe(false);
  });
});
