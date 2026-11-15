import { describe, expect, it } from 'vitest';
import { EditorComponentMode } from '@/types/editor_component_mode.js';
import { openTopologyMeshEditFixture, readTopologyMeshFixtureGeometry } from './support/topology_mesh_edit_fixture.js';

describe('HandlerComponentMeshOperations fill holes', () => {
  it('fills the hole left by a deleted face and undoes in one step', () => {
    const fixture = openTopologyMeshEditFixture();
    const before = readTopologyMeshFixtureGeometry(fixture);
    const rim = before.faces[0]!.vertexIndices;
    fixture.session.setComponentMode(EditorComponentMode.FACE, []);
    fixture.session
      .getComponentSelection()
      .replaceAll([{ targetId: fixture.targetId, kind: 'face', componentKey: '0' }]);
    expect(fixture.handler.deleteSelection()).toBe(true);
    const holed = readTopologyMeshFixtureGeometry(fixture).faces.length;
    fixture.session.setComponentMode(EditorComponentMode.VERTEX, []);
    fixture.session
      .getComponentSelection()
      .replaceAll([{ targetId: fixture.targetId, kind: 'vertex', componentKey: String(rim[0]) }]);
    expect(fixture.operations.fillSelectedHoles()).toBe(true);
    expect(readTopologyMeshFixtureGeometry(fixture).faces).toHaveLength(holed + 1);
    expect(fixture.commandStack.undo()).toBe(true);
    expect(readTopologyMeshFixtureGeometry(fixture).faces).toHaveLength(holed);
  });
});
