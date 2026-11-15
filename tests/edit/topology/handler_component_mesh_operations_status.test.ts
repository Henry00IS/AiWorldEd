import { describe, expect, it } from 'vitest';
import { EditorComponentMode } from '@/types/editor_component_mode.js';
import { openTopologyMeshEditFixture, readTopologyMeshFixtureGeometry } from './support/topology_mesh_edit_fixture.js';

describe('HandlerComponentMeshOperations status', () => {
  it('shows the fresh selection count after an operation clears the selection', () => {
    const fixture = openTopologyMeshEditFixture();
    const [a, b] = readTopologyMeshFixtureGeometry(fixture).faces[0]!.vertexIndices;
    fixture.session.setComponentMode(EditorComponentMode.EDGE, []);
    fixture.session
      .getComponentSelection()
      .replaceAll([
        { targetId: fixture.targetId, kind: 'edge', componentKey: `${Math.min(a!, b!)}:${Math.max(a!, b!)}` },
      ]);
    expect(fixture.operations.collapseSelectedEdges()).toBe(true);
    expect(fixture.statusMessages.at(-1)).toBe('Edit Mode · Edge · 0 selected');
  });

  it('shows the fresh selection count after an operation selects new components', () => {
    const fixture = openTopologyMeshEditFixture();
    fixture.session.setComponentMode(EditorComponentMode.FACE, []);
    fixture.session
      .getComponentSelection()
      .replaceAll([{ targetId: fixture.targetId, kind: 'face', componentKey: '0' }]);
    expect(fixture.operations.pokeSelectedFaces()).toBe(true);
    const count = fixture.session.getComponentSelection().getSelectedCount();
    expect(count).toBeGreaterThan(1);
    expect(fixture.statusMessages.at(-1)).toBe(`Edit Mode · Face · ${count} selected`);
  });
});
