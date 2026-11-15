import { describe, expect, it } from 'vitest';
import { EditorComponentMode } from '@/types/editor_component_mode.js';
import { openTopologyMeshEditFixture, readTopologyMeshFixtureGeometry } from './support/topology_mesh_edit_fixture.js';

describe('HandlerComponentMeshOperations solidify', () => {
  it('refuses a face of a closed mesh and works only in Face mode', () => {
    const fixture = openTopologyMeshEditFixture();
    const before = readTopologyMeshFixtureGeometry(fixture).faces.length;
    fixture.session.setComponentMode(EditorComponentMode.FACE, []);
    fixture.session.getComponentSelection().replaceAll(
      [...Array(before).keys()].map((index) => ({
        targetId: fixture.targetId,
        kind: 'face' as const,
        componentKey: String(index),
      })),
    );
    expect(fixture.operations.solidifySelectedFaces(0.2)).toBe(false);
    fixture.session.setComponentMode(EditorComponentMode.EDGE, []);
    expect(fixture.operations.solidifySelectedFaces(0.2)).toBe(false);
  });

  it('solidifies a loose face, keeps it selected and undoes in one step', () => {
    const fixture = openTopologyMeshEditFixture();
    const count = readTopologyMeshFixtureGeometry(fixture).faces.length;
    selectFaces(fixture, [...Array(count).keys()].slice(1));
    expect(fixture.handler.deleteSelection()).toBe(true);
    const before = readTopologyMeshFixtureGeometry(fixture);
    expect(before.faces).toHaveLength(1);
    selectFaces(fixture, [0]);
    expect(fixture.operations.previewSolidify(0.2).length).toBeGreaterThan(0);
    expect(fixture.operations.solidifySelectedFaces(0.2)).toBe(true);
    const corners = before.faces[0]!.vertexIndices.length;
    expect(readTopologyMeshFixtureGeometry(fixture).faces).toHaveLength(2 + corners);
    expect(
      fixture.session
        .getComponentSelection()
        .getSelected()
        .map((entry) => entry.componentKey),
    ).toEqual(['0']);
    expect(fixture.commandStack.undo()).toBe(true);
    expect(readTopologyMeshFixtureGeometry(fixture).faces).toHaveLength(1);
  });
});

/**
 * Selects faces in Face mode.
 *
 * @param fixture Live fixture.
 * @param faces Face indices.
 */
function selectFaces(fixture: ReturnType<typeof openTopologyMeshEditFixture>, faces: number[]): void {
  fixture.session.setComponentMode(EditorComponentMode.FACE, []);
  fixture.session
    .getComponentSelection()
    .replaceAll(
      faces.map((face) => ({ targetId: fixture.targetId, kind: 'face' as const, componentKey: String(face) })),
    );
}
