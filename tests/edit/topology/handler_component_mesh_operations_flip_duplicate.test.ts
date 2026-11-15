import { describe, expect, it } from 'vitest';
import { EditorComponentMode } from '@/types/editor_component_mode.js';
import { openTopologyMeshEditFixture, readTopologyMeshFixtureGeometry } from './support/topology_mesh_edit_fixture.js';

describe('HandlerComponentMeshOperations flip and duplicate', () => {
  it('flips the selected face and undoes in one step', () => {
    const fixture = openTopologyMeshEditFixture();
    const loop = readTopologyMeshFixtureGeometry(fixture).faces[0]!.vertexIndices.slice();
    selectFirstFace(fixture);
    expect(fixture.operations.flipSelectedFaces()).toBe(true);
    expect(readTopologyMeshFixtureGeometry(fixture).faces[0]!.vertexIndices).toEqual([...loop].reverse());
    expect(fixture.commandStack.undo()).toBe(true);
    expect(readTopologyMeshFixtureGeometry(fixture).faces[0]!.vertexIndices).toEqual(loop);
  });

  it('duplicates the selected face and selects the copy', () => {
    const fixture = openTopologyMeshEditFixture();
    const before = readTopologyMeshFixtureGeometry(fixture);
    selectFirstFace(fixture);
    expect(fixture.operations.duplicateSelectedFaces()).toBe(true);
    const after = readTopologyMeshFixtureGeometry(fixture);
    expect(after.faces).toHaveLength(before.faces.length + 1);
    const selected = fixture.session.getComponentSelection().getSelected();
    expect(selected.map((entry) => entry.componentKey)).toEqual([String(before.faces.length)]);
    expect(fixture.commandStack.undo()).toBe(true);
    expect(readTopologyMeshFixtureGeometry(fixture).faces).toHaveLength(before.faces.length);
  });
});

/**
 * Selects face 0 in Face mode.
 *
 * @param fixture Live fixture.
 */
function selectFirstFace(fixture: ReturnType<typeof openTopologyMeshEditFixture>): void {
  fixture.session.setComponentMode(EditorComponentMode.FACE, []);
  fixture.session.getComponentSelection().replaceAll([{ targetId: fixture.targetId, kind: 'face', componentKey: '0' }]);
}
