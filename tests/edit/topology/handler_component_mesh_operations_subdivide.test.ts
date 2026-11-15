import { describe, expect, it } from 'vitest';
import { EditorComponentMode } from '@/types/editor_component_mode.js';
import { buildComponentEdgeKey } from '@/edit/component/component_selection_entry.js';
import { openTopologyMeshEditFixture, readTopologyMeshFixtureGeometry } from './support/topology_mesh_edit_fixture.js';

describe('HandlerComponentMeshOperations subdivide', () => {
  it('splits the selected edge, selects the pieces and undoes in one step', () => {
    const fixture = openTopologyMeshEditFixture();
    const before = readTopologyMeshFixtureGeometry(fixture);
    const [a, b] = before.faces[0]!.vertexIndices;
    fixture.session.setComponentMode(EditorComponentMode.EDGE, []);
    fixture.session
      .getComponentSelection()
      .replaceAll([{ targetId: fixture.targetId, kind: 'edge', componentKey: buildComponentEdgeKey(a!, b!) }]);
    expect(fixture.operations.subdivideSelectedEdges(2)).toBe(true);
    const after = readTopologyMeshFixtureGeometry(fixture);
    expect(after.positions.length).toBe(before.positions.length + 2);
    const selected = fixture.session.getComponentSelection().getSelected();
    expect(selected).toHaveLength(3);
    expect(selected.every((entry) => entry.kind === 'edge')).toBe(true);
    expect(fixture.commandStack.undo()).toBe(true);
    expect(readTopologyMeshFixtureGeometry(fixture).positions.length).toBe(before.positions.length);
  });

  it('only subdivides in Edge mode', () => {
    const fixture = openTopologyMeshEditFixture();
    fixture.session.setComponentMode(EditorComponentMode.FACE, []);
    fixture.session
      .getComponentSelection()
      .replaceAll([{ targetId: fixture.targetId, kind: 'face', componentKey: '0' }]);
    expect(fixture.operations.subdivideSelectedEdges(1)).toBe(false);
  });
});
