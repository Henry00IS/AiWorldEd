import { describe, expect, it } from 'vitest';
import { EditorComponentMode } from '@/types/editor_component_mode.js';
import { openTopologyMeshEditFixture, readTopologyMeshFixtureGeometry } from './support/topology_mesh_edit_fixture.js';

describe('HandlerComponentMeshOperations join triangles', () => {
  it('joins the triangles of a box side into quads, selects them and undoes in one step', () => {
    const fixture = openTopologyMeshEditFixture();
    const before = readTopologyMeshFixtureGeometry(fixture);
    fixture.session.setComponentMode(EditorComponentMode.FACE, []);
    fixture.session.getComponentSelection().replaceAll(
      before.faces.map((_face, index) => ({
        targetId: fixture.targetId,
        kind: 'face' as const,
        componentKey: String(index),
      })),
    );
    expect(fixture.operations.joinSelectedTriangles()).toBe(true);
    const after = readTopologyMeshFixtureGeometry(fixture);
    expect(after.faces.length).toBeLessThan(before.faces.length);
    expect(fixture.session.getComponentSelection().getSelected()).toHaveLength(after.faces.length);
    expect(fixture.commandStack.undo()).toBe(true);
    expect(readTopologyMeshFixtureGeometry(fixture).faces.length).toBe(before.faces.length);
  });
});
