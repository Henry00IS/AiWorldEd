import { describe, expect, it } from 'vitest';
import { EditorComponentMode } from '@/types/editor_component_mode.js';
import { openTopologyMeshEditFixture, readTopologyMeshFixtureGeometry } from './support/topology_mesh_edit_fixture.js';

describe('HandlerComponentMeshOperations smooth', () => {
  it('relaxes the selected vertices and undoes in one step', () => {
    const fixture = openTopologyMeshEditFixture();
    const before = readTopologyMeshFixtureGeometry(fixture).positions.map((point) => point.clone());
    fixture.session.setComponentMode(EditorComponentMode.VERTEX, []);
    fixture.session
      .getComponentSelection()
      .replaceAll(
        [0, 1].map((vertex) => ({ targetId: fixture.targetId, kind: 'vertex' as const, componentKey: String(vertex) })),
      );
    expect(fixture.operations.smoothSelectedVertices()).toBe(true);
    const after = readTopologyMeshFixtureGeometry(fixture).positions;
    expect(after[0]!.distanceTo(before[0]!)).toBeGreaterThan(1e-6);
    expect(after[2]!.toArray()).toEqual(before[2]!.toArray());
    expect(fixture.commandStack.undo()).toBe(true);
    expect(readTopologyMeshFixtureGeometry(fixture).positions[0]!.toArray()).toEqual(before[0]!.toArray());
  });

  it('works only in Vertex mode', () => {
    const fixture = openTopologyMeshEditFixture();
    fixture.session.setComponentMode(EditorComponentMode.FACE, []);
    expect(fixture.operations.smoothSelectedVertices()).toBe(false);
  });
});
