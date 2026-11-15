import { describe, expect, it } from 'vitest';
import { EditorComponentMode } from '@/types/editor_component_mode.js';
import { buildComponentEdgeKey } from '@/edit/component/component_selection_entry.js';
import {
  openTopologyMeshEditFixture,
  readTopologyMeshFixtureGeometry,
  type TopologyMeshEditFixture,
} from './support/topology_mesh_edit_fixture.js';

describe('HandlerComponentMeshOperations bridge edge loops', () => {
  it('bridges two border edges of a hole and undoes in one step', () => {
    const fixture = openTopologyMeshEditFixture();
    const holeEdges = cutQuadHole(fixture);
    const holed = readTopologyMeshFixtureGeometry(fixture).faces.length;
    selectEdges(fixture, [holeEdges[0]!, holeEdges[2]!]);
    expect(fixture.operations.bridgeSelectedEdgeLoops()).toBe(true);
    expect(readTopologyMeshFixtureGeometry(fixture).faces.length).toBe(holed + 1);
    expect(fixture.commandStack.undo()).toBe(true);
    expect(readTopologyMeshFixtureGeometry(fixture).faces.length).toBe(holed);
  });

  it('refuses a single edge run and works only in Edge mode', () => {
    const fixture = openTopologyMeshEditFixture();
    const holeEdges = cutQuadHole(fixture);
    selectEdges(fixture, [holeEdges[0]!, holeEdges[1]!]);
    expect(fixture.operations.bridgeSelectedEdgeLoops()).toBe(false);
    fixture.session.setComponentMode(EditorComponentMode.VERTEX, []);
    expect(fixture.operations.bridgeSelectedEdgeLoops()).toBe(false);
  });
});

/**
 * Turns the first two triangles of the box side into a quad hole by removing
 * them, and returns the four border edges of that hole in loop order.
 *
 * @param fixture Live fixture.
 * @returns Border edges as vertex pairs.
 */
function cutQuadHole(fixture: TopologyMeshEditFixture): Array<[number, number]> {
  const geometry = readTopologyMeshFixtureGeometry(fixture);
  const [first, second] = [geometry.faces[0]!.vertexIndices, geometry.faces[1]!.vertexIndices];
  const shared = first.filter((vertex) => second.includes(vertex));
  const loop = [
    ...first.filter((vertex) => !shared.includes(vertex)),
    shared[0]!,
    ...second.filter((vertex) => !shared.includes(vertex)),
    shared[1]!,
  ];
  fixture.session.setComponentMode(EditorComponentMode.FACE, []);
  fixture.session
    .getComponentSelection()
    .replaceAll(
      ['0', '1'].map((componentKey) => ({ targetId: fixture.targetId, kind: 'face' as const, componentKey })),
    );
  fixture.handler.deleteSelection();
  return loop.map((vertex, index) => [vertex, loop[(index + 1) % loop.length]!]);
}

/**
 * Selects edges in Edge mode.
 *
 * @param fixture Live fixture.
 * @param edges Vertex pairs.
 */
function selectEdges(fixture: TopologyMeshEditFixture, edges: Array<[number, number]>): void {
  fixture.session.setComponentMode(EditorComponentMode.EDGE, []);
  fixture.session.getComponentSelection().replaceAll(
    edges.map(([a, b]) => ({
      targetId: fixture.targetId,
      kind: 'edge' as const,
      componentKey: buildComponentEdgeKey(a, b),
    })),
  );
}
