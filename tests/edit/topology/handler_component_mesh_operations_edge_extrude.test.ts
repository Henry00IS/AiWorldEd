import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { EditorComponentMode } from '@/types/editor_component_mode.js';
import { buildComponentEdgeKey } from '@/edit/component/component_selection_entry.js';
import { collectTopologyBorderEdges } from '@/edit/topology/topology_edge_extrude.js';
import { openTopologyMeshEditFixture, readTopologyMeshFixtureGeometry } from './support/topology_mesh_edit_fixture.js';

describe('HandlerComponentMeshOperations edge extrude', () => {
  it('pulls a border edge out of its face, selects the new edge and undoes in one step', () => {
    const fixture = openTopologyMeshEditFixture();
    fixture.mesh.scale.setScalar(2);
    fixture.mesh.updateMatrixWorld(true);
    fixture.session.setComponentMode(EditorComponentMode.FACE, []);
    fixture.session
      .getComponentSelection()
      .replaceAll([{ targetId: fixture.targetId, kind: 'face', componentKey: '1' }]);
    fixture.handler.deleteSelection();
    const before = readTopologyMeshFixtureGeometry(fixture);
    const loop = before.faces[0]!.vertexIndices;
    const candidates = loop.map((vertex, corner) => ({ vertexA: vertex, vertexB: loop[(corner + 1) % loop.length]! }));
    const border = collectTopologyBorderEdges(before, candidates)[0]!;
    fixture.session.setComponentMode(EditorComponentMode.EDGE, []);
    fixture.session
      .getComponentSelection()
      .replaceAll([
        { targetId: fixture.targetId, kind: 'edge', componentKey: buildComponentEdgeKey(border.from, border.to) },
      ]);
    expect(fixture.operations.describeExtrudeAxis()).not.toBeNull();
    expect(fixture.operations.describeExtrudeLabel('region')).toBe('Extrude Edges');
    expect(fixture.operations.previewExtrude(0.5, 'region').length).toBe(8);
    expect(fixture.operations.extrudeSelection(0.5, 'region')).toBe(true);
    const after = readTopologyMeshFixtureGeometry(fixture);
    expect(after.faces.length).toBe(before.faces.length + 1);
    const selected = fixture.session.getComponentSelection().getSelected();
    expect(selected).toHaveLength(1);
    const world = (point: THREE.Vector3) => point.clone().applyMatrix4(fixture.mesh.matrixWorld);
    for (const outer of selected[0]!.componentKey.split(':').map(Number)) {
      const gap = Math.min(...before.positions.map((point) => world(point).distanceTo(world(after.positions[outer]!))));
      expect(gap).toBeCloseTo(0.5, 6);
    }
    expect(fixture.commandStack.undo()).toBe(true);
    expect(readTopologyMeshFixtureGeometry(fixture).faces.length).toBe(before.faces.length);
  });

  it('keeps extruding faces in Face mode', () => {
    const fixture = openTopologyMeshEditFixture();
    fixture.session.setComponentMode(EditorComponentMode.FACE, []);
    fixture.session
      .getComponentSelection()
      .replaceAll([{ targetId: fixture.targetId, kind: 'face', componentKey: '0' }]);
    expect(fixture.operations.describeExtrudeLabel('individual')).toBe('Extrude Faces Individually');
    expect(fixture.operations.extrudeSelection(0.5, 'region')).toBe(true);
  });
});
