import { describe, expect, it } from 'vitest';
import { EditorComponentMode } from '@/types/editor_component_mode.js';
import { openTopologyMeshEditFixture, readTopologyMeshFixtureGeometry } from './support/topology_mesh_edit_fixture.js';

describe('HandlerComponentMeshOperations poke and triangulate', () => {
  it('pokes the selected face, selects every piece and undoes in one step', () => {
    const fixture = openTopologyMeshEditFixture();
    const before = readTopologyMeshFixtureGeometry(fixture);
    const corners = before.faces[0]!.vertexIndices.length;
    fixture.session.setComponentMode(EditorComponentMode.FACE, []);
    fixture.session
      .getComponentSelection()
      .replaceAll([{ targetId: fixture.targetId, kind: 'face', componentKey: '0' }]);
    expect(fixture.operations.pokeSelectedFaces()).toBe(true);
    expect(readTopologyMeshFixtureGeometry(fixture).faces.length).toBe(before.faces.length + corners - 1);
    expect(fixture.session.getComponentSelection().getSelected()).toHaveLength(corners);
    expect(fixture.operations.triangulateSelectedFaces()).toBe(false);
    expect(fixture.commandStack.undo()).toBe(true);
    expect(readTopologyMeshFixtureGeometry(fixture).faces.length).toBe(before.faces.length);
  });
});
