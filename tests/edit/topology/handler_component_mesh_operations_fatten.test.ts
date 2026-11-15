import { describe, expect, it } from 'vitest';
import { EditorComponentMode } from '@/types/editor_component_mode.js';
import { openTopologyMeshEditFixture, readTopologyMeshFixtureGeometry } from './support/topology_mesh_edit_fixture.js';

describe('HandlerComponentMeshOperations shrink and fatten', () => {
  it('moves the selected face along its normal, keeps it selected and undoes in one step', () => {
    const fixture = openTopologyMeshEditFixture();
    const before = readTopologyMeshFixtureGeometry(fixture);
    fixture.session.setComponentMode(EditorComponentMode.FACE, []);
    fixture.session
      .getComponentSelection()
      .replaceAll([{ targetId: fixture.targetId, kind: 'face', componentKey: '0' }]);
    expect(fixture.operations.previewExtrude(0.25, 'fatten').length).toBeGreaterThan(0);
    expect(fixture.operations.describeExtrudeLabel('fatten')).toBe('Shrink / Fatten');
    expect(fixture.operations.extrudeSelection(0.25, 'fatten')).toBe(true);
    const after = readTopologyMeshFixtureGeometry(fixture);
    expect(after.faces).toHaveLength(before.faces.length);
    const moved = before.faces[0]!.vertexIndices[0]!;
    expect(after.positions[moved]!.distanceTo(before.positions[moved]!)).toBeGreaterThan(0.01);
    expect(
      fixture.session
        .getComponentSelection()
        .getSelected()
        .map((entry) => entry.componentKey),
    ).toEqual(['0']);
    expect(fixture.commandStack.undo()).toBe(true);
    expect(readTopologyMeshFixtureGeometry(fixture).positions[moved]!.toArray()).toEqual(
      before.positions[moved]!.toArray(),
    );
  });
});
