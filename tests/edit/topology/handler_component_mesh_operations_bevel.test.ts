import { describe, expect, it } from 'vitest';
import { EditorComponentMode } from '@/types/editor_component_mode.js';
import { buildComponentEdgeKey } from '@/edit/component/component_selection_entry.js';
import { bevelTopologyWorkingEdges } from '@/edit/topology/topology_edge_bevel.js';
import { cloneTopologyWorkingGeometry } from '@/edit/topology/topology_working_geometry.js';
import { openTopologyMeshEditFixture, readTopologyMeshFixtureGeometry } from './support/topology_mesh_edit_fixture.js';

describe('HandlerComponentMeshOperations bevel', () => {
  it('bevels a selected edge, selects the chamfer outline and undoes in one step', () => {
    const fixture = openTopologyMeshEditFixture();
    const before = readTopologyMeshFixtureGeometry(fixture);
    const edge = before.faces
      .flatMap((face) =>
        face.vertexIndices.map((vertex, corner) => [
          vertex,
          face.vertexIndices[(corner + 1) % face.vertexIndices.length]!,
        ]),
      )
      .find(
        ([a, b]) =>
          bevelTopologyWorkingEdges(cloneTopologyWorkingGeometry(before), [{ vertexA: a!, vertexB: b! }], 0.05).result
            .applied,
      )!;
    fixture.session.setComponentMode(EditorComponentMode.EDGE, []);
    fixture.session
      .getComponentSelection()
      .replaceAll([
        { targetId: fixture.targetId, kind: 'edge', componentKey: buildComponentEdgeKey(edge[0]!, edge[1]!) },
      ]);
    expect(fixture.operations.describeEdgeBevelCentre()).not.toBeNull();
    expect(fixture.operations.previewEdgeBevel(0.05).length).toBeGreaterThan(0);
    expect(fixture.operations.bevelSelectedEdges(0.05)).toBe(true);
    expect(readTopologyMeshFixtureGeometry(fixture).faces.length).toBe(before.faces.length + 1);
    expect(fixture.session.getComponentSelection().getSelected().length).toBeGreaterThanOrEqual(4);
    expect(fixture.commandStack.undo()).toBe(true);
    expect(readTopologyMeshFixtureGeometry(fixture).faces.length).toBe(before.faces.length);
  });

  it('only bevels in Edge mode', () => {
    const fixture = openTopologyMeshEditFixture();
    fixture.session.setComponentMode(EditorComponentMode.FACE, []);
    fixture.session
      .getComponentSelection()
      .replaceAll([{ targetId: fixture.targetId, kind: 'face', componentKey: '0' }]);
    expect(fixture.operations.bevelSelectedEdges(0.1)).toBe(false);
  });
});
