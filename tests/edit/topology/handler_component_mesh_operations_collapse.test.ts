import { describe, expect, it } from 'vitest';
import { EditorComponentMode } from '@/types/editor_component_mode.js';
import { openTopologyMeshEditFixture, readTopologyMeshFixtureGeometry } from './support/topology_mesh_edit_fixture.js';

describe('HandlerComponentMeshOperations collapse edges', () => {
  it('collapses the selected edge in Edge mode and undoes in one step', () => {
    const fixture = openTopologyMeshEditFixture();
    const before = readTopologyMeshFixtureGeometry(fixture);
    const [a, b] = before.faces[0]!.vertexIndices;
    fixture.session.setComponentMode(EditorComponentMode.EDGE, []);
    fixture.session
      .getComponentSelection()
      .replaceAll([
        { targetId: fixture.targetId, kind: 'edge', componentKey: `${Math.min(a!, b!)}:${Math.max(a!, b!)}` },
      ]);
    expect(fixture.operations.collapseSelectedEdges()).toBe(true);
    expect(readTopologyMeshFixtureGeometry(fixture).positions.length).toBeLessThan(before.positions.length);
    expect(fixture.session.getComponentSelection().getSelected()).toEqual([]);
    expect(fixture.commandStack.undo()).toBe(true);
    expect(readTopologyMeshFixtureGeometry(fixture).positions).toHaveLength(before.positions.length);
  });
});
