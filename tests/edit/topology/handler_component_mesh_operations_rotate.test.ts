import { describe, expect, it } from 'vitest';
import { EditorComponentMode } from '@/types/editor_component_mode.js';
import { openTopologyMeshEditFixture, readTopologyMeshFixtureGeometry } from './support/topology_mesh_edit_fixture.js';

describe('HandlerComponentMeshOperations rotate edges', () => {
  it('turns a diagonal, selects the new edge and undoes in one step', () => {
    const fixture = openTopologyMeshEditFixture();
    const before = readTopologyMeshFixtureGeometry(fixture);
    const counts = new Map<string, number>();
    for (const face of before.faces) {
      face.vertexIndices.forEach((vertex, corner) => {
        const next = face.vertexIndices[(corner + 1) % face.vertexIndices.length]!;
        const key = [vertex, next].sort((a, b) => a - b).join(':');
        counts.set(key, (counts.get(key) ?? 0) + 1);
      });
    }
    const loops = before.faces.map((face) => face.vertexIndices.join(','));
    fixture.session.setComponentMode(EditorComponentMode.EDGE, []);
    const turned = [...counts.entries()].some(([key, count]) => {
      if (count !== 2) return false;
      fixture.session
        .getComponentSelection()
        .replaceAll([{ targetId: fixture.targetId, kind: 'edge', componentKey: key }]);
      return fixture.operations.rotateSelectedEdges();
    });
    expect(turned).toBe(true);
    const selected = fixture.session.getComponentSelection().getSelected();
    expect(selected).toHaveLength(1);
    expect(selected[0]!.kind).toBe('edge');
    expect(fixture.commandStack.undo()).toBe(true);
    expect(readTopologyMeshFixtureGeometry(fixture).faces.map((face) => face.vertexIndices.join(','))).toEqual(loops);
  });
});
