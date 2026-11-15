import { describe, expect, it } from 'vitest';
import { EditorComponentMode } from '@/types/editor_component_mode.js';
import { openTopologyMeshEditFixture, readTopologyMeshFixtureGeometry } from './support/topology_mesh_edit_fixture.js';

describe('HandlerComponentMeshOperations split', () => {
  it('splits the selected face off, keeps it selected and undoes in one step', () => {
    const fixture = openTopologyMeshEditFixture();
    const before = readTopologyMeshFixtureGeometry(fixture);
    fixture.session.setComponentMode(EditorComponentMode.FACE, []);
    fixture.session
      .getComponentSelection()
      .replaceAll([{ targetId: fixture.targetId, kind: 'face', componentKey: '0' }]);
    expect(fixture.operations.splitOffSelectedFaces()).toBe(true);
    const after = readTopologyMeshFixtureGeometry(fixture);
    expect(after.positions.length).toBe(before.positions.length + before.faces[0]!.vertexIndices.length);
    expect(
      fixture.session
        .getComponentSelection()
        .getSelected()
        .map((entry) => entry.componentKey),
    ).toEqual(['0']);
    expect(fixture.commandStack.undo()).toBe(true);
    expect(readTopologyMeshFixtureGeometry(fixture).positions).toHaveLength(before.positions.length);
  });
});
