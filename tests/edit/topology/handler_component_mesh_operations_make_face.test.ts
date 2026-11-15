import { describe, expect, it } from 'vitest';
import { EditorComponentMode } from '@/types/editor_component_mode.js';
import { buildComponentEdgeKey } from '@/edit/component/component_selection_entry.js';
import { openTopologyMeshEditFixture, readTopologyMeshFixtureGeometry } from './support/topology_mesh_edit_fixture.js';

describe('HandlerComponentMeshOperations make face', () => {
  it('refills a deleted face from its corner vertices and undoes in one step', () => {
    const fixture = openTopologyMeshEditFixture();
    const loop = readTopologyMeshFixtureGeometry(fixture).faces[0]!.vertexIndices.slice();
    fixture.session.setComponentMode(EditorComponentMode.FACE, []);
    fixture.session
      .getComponentSelection()
      .replaceAll([{ targetId: fixture.targetId, kind: 'face', componentKey: '0' }]);
    expect(fixture.handler.deleteSelection()).toBe(true);
    const holed = readTopologyMeshFixtureGeometry(fixture).faces.length;
    fixture.session.setComponentMode(EditorComponentMode.VERTEX, []);
    fixture.session
      .getComponentSelection()
      .replaceAll(loop.map((vertex) => ({ targetId: fixture.targetId, kind: 'vertex', componentKey: String(vertex) })));
    expect(fixture.operations.makeFaceFromSelection()).toBe(true);
    expect(readTopologyMeshFixtureGeometry(fixture).faces.length).toBe(holed + 1);
    expect(fixture.commandStack.undo()).toBe(true);
    expect(readTopologyMeshFixtureGeometry(fixture).faces.length).toBe(holed);
  });

  it('uses the ends of selected edges in Edge mode and refuses an existing face', () => {
    const fixture = openTopologyMeshEditFixture();
    const loop = readTopologyMeshFixtureGeometry(fixture).faces[0]!.vertexIndices;
    fixture.session.setComponentMode(EditorComponentMode.EDGE, []);
    fixture.session.getComponentSelection().replaceAll(
      loop.map((vertex, corner) => ({
        targetId: fixture.targetId,
        kind: 'edge' as const,
        componentKey: buildComponentEdgeKey(vertex, loop[(corner + 1) % loop.length]!),
      })),
    );
    expect(fixture.operations.makeFaceFromSelection()).toBe(false);
  });
});
