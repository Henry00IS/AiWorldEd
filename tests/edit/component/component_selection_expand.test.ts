import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { EditorComponentMode } from '@/types/editor_component_mode.js';
import { buildComponentEdgeKey, type ComponentSelectionEntry } from '@/edit/component/component_selection_entry.js';
import type { ComponentTopologyTarget } from '@/edit/component/component_selection_topology.js';
import { buildComponentTopologyFromMeshDocument } from '@/edit/component/component_selection_topology.js';
import { componentSelectionExpand } from '@/edit/component/component_selection_expand.js';
import { meshDocumentFromBufferGeometryWelded } from '@/edit/mesh/mesh_edit_weld.js';

/**
 * Builds a flat grid of quads, vertices numbered row by row.
 *
 * @param columns Quads across.
 * @param rows Quads down.
 * @param targetId Target id.
 * @returns Topology.
 */
function grid(columns: number, rows: number, targetId = 'grid'): ComponentTopologyTarget {
  const at = (x: number, y: number): number => y * (columns + 1) + x;
  const faces: ComponentTopologyTarget['faces'] = [];
  const edges = new Map<string, { edgeKey: string; vertexA: number; vertexB: number }>();
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < columns; x++) {
      const loop = [at(x, y), at(x + 1, y), at(x + 1, y + 1), at(x, y + 1)];
      const edgeKeys = loop.map((vertex, index) => {
        const next = loop[(index + 1) % 4]!;
        const edgeKey = buildComponentEdgeKey(vertex, next);
        edges.set(edgeKey, { edgeKey, vertexA: vertex, vertexB: next });
        return edgeKey;
      });
      faces.push({ faceIndex: faces.length, vertexIndices: loop, edgeKeys });
    }
  }
  return { targetId, edges: [...edges.values()], faces };
}

/**
 * Builds a box: six quads, every corner shared by three faces.
 *
 * @returns Topology.
 */
function box(): ComponentTopologyTarget {
  const loops = [
    [0, 1, 2, 3],
    [4, 7, 6, 5],
    [0, 4, 5, 1],
    [1, 5, 6, 2],
    [2, 6, 7, 3],
    [3, 7, 4, 0],
  ];
  const edges = new Map<string, { edgeKey: string; vertexA: number; vertexB: number }>();
  const faces = loops.map((loop, faceIndex) => ({
    faceIndex,
    vertexIndices: loop,
    edgeKeys: loop.map((vertex, index) => {
      const next = loop[(index + 1) % 4]!;
      const edgeKey = buildComponentEdgeKey(vertex, next);
      edges.set(edgeKey, { edgeKey, vertexA: vertex, vertexB: next });
      return edgeKey;
    }),
  }));
  return { targetId: 'box', edges: [...edges.values()], faces };
}

/**
 * Builds entries of one kind.
 *
 * @param targetId Target id.
 * @param kind Kind.
 * @param keys Component keys.
 * @returns Entries.
 */
function entries(
  targetId: string,
  kind: ComponentSelectionEntry['kind'],
  keys: readonly (string | number)[],
): ComponentSelectionEntry[] {
  return keys.map((key) => ({ targetId, kind, componentKey: String(key) }));
}

/**
 * Returns the sorted keys of entries.
 *
 * @param list Entries.
 * @returns Keys.
 */
function keys(list: readonly ComponentSelectionEntry[]): string[] {
  return list.map((entry) => entry.componentKey).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
}

describe('edit selection operations', () => {
  it('selects all, none and the inverse across every edited target', () => {
    const topology = grid(2, 1);
    const other = grid(1, 1, 'other');
    const picked = entries('grid', 'face', [0]);
    expect(keys(componentSelectionExpand('all', picked, EditorComponentMode.FACE, [topology, other]))).toEqual([
      '0',
      '0',
      '1',
    ]);
    expect(componentSelectionExpand('none', picked, EditorComponentMode.FACE, [topology])).toEqual([]);
    expect(keys(componentSelectionExpand('invert', picked, EditorComponentMode.FACE, [topology]))).toEqual(['1']);
    expect(componentSelectionExpand('all', [], EditorComponentMode.VERTEX, [topology, other])).toHaveLength(10);
  });

  it('grows and shrinks vertices along edges', () => {
    const topology = grid(2, 2);
    const more = componentSelectionExpand('more', entries('grid', 'vertex', [4]), EditorComponentMode.VERTEX, [
      topology,
    ]);
    expect(keys(more)).toEqual(['1', '3', '4', '5', '7']);
    expect(keys(componentSelectionExpand('less', more, EditorComponentMode.VERTEX, [topology]))).toEqual(['4']);
  });

  it('grows faces across shared edges and shrinks back to the inner faces', () => {
    const topology = grid(3, 3);
    const more = componentSelectionExpand('more', entries('grid', 'face', [4]), EditorComponentMode.FACE, [topology]);
    expect(keys(more)).toEqual(['1', '3', '4', '5', '7']);
    const all = componentSelectionExpand('all', more, EditorComponentMode.FACE, [topology]);
    expect(keys(componentSelectionExpand('less', all, EditorComponentMode.FACE, [topology]))).toEqual(['4']);
  });

  it('grows edges through shared vertices', () => {
    const topology = grid(1, 1);
    const more = componentSelectionExpand('more', entries('grid', 'edge', ['0:1']), EditorComponentMode.EDGE, [
      topology,
    ]);
    expect(keys(more)).toEqual(['0:1', '0:2', '1:3']);
  });

  it('selects every component connected to the selection, not other islands', () => {
    const topology: ComponentTopologyTarget = {
      targetId: 'two',
      edges: [...grid(1, 1).edges, { edgeKey: '10:11', vertexA: 10, vertexB: 11 }],
      faces: grid(1, 1).faces,
    };
    expect(
      keys(componentSelectionExpand('linked', entries('two', 'vertex', [0]), EditorComponentMode.VERTEX, [topology])),
    ).toEqual(['0', '1', '2', '3']);
  });

  it('runs an edge loop straight through four-way vertices and stops at the border', () => {
    const topology = grid(3, 3);
    const loop = componentSelectionExpand('loop', entries('grid', 'edge', ['5:6']), EditorComponentMode.EDGE, [
      topology,
    ]);
    expect(keys(loop)).toEqual(['4:5', '5:6', '6:7']);
  });

  it('selects an edge ring across quads, around a box too', () => {
    const ring = componentSelectionExpand('ring', entries('grid', 'edge', ['1:5']), EditorComponentMode.EDGE, [
      grid(3, 1),
    ]);
    expect(keys(ring)).toEqual(['0:4', '1:5', '2:6', '3:7']);
    const around = componentSelectionExpand('ring', entries('box', 'edge', ['0:1']), EditorComponentMode.EDGE, [box()]);
    expect(keys(around)).toEqual(['0:1', '2:3', '4:5', '6:7']);
  });

  it('loops faces from two neighbours all the way around a box', () => {
    const loop = componentSelectionExpand('loop', entries('box', 'face', [0, 3]), EditorComponentMode.FACE, [box()]);
    expect(keys(loop)).toEqual(['0', '1', '3', '5']);
    const strip = componentSelectionExpand('ring', entries('grid', 'face', [1, 2]), EditorComponentMode.FACE, [
      grid(4, 1),
    ]);
    expect(keys(strip)).toEqual(['0', '1', '2', '3']);
  });

  it('works on welded mesh documents', () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1, 2, 2, 2);
    const topology = buildComponentTopologyFromMeshDocument('mesh', meshDocumentFromBufferGeometryWelded(geometry));
    const one = entries('mesh', 'face', [topology.faces[0]!.faceIndex]);
    const linked = componentSelectionExpand('linked', one, EditorComponentMode.FACE, [topology]);
    expect(linked).toHaveLength(topology.faces.length);
    const grown = componentSelectionExpand('more', one, EditorComponentMode.FACE, [topology]);
    expect(grown.length).toBeGreaterThan(1);
    expect(grown.length).toBeLessThan(topology.faces.length);
    geometry.dispose();
  });
});

describe('edit selection shortcuts', () => {
  it('maps the selection keys and leaves other combinations alone', async () => {
    const { editSelectShortcutOperation } = await import('@/edit/tool/edit_select_tool.js');
    const key = (init: KeyboardEventInit): KeyboardEvent => new KeyboardEvent('keydown', init);
    expect(editSelectShortcutOperation('KeyA', key({ ctrlKey: true }))).toBe('all');
    expect(editSelectShortcutOperation('KeyA', key({ altKey: true }))).toBe('none');
    expect(editSelectShortcutOperation('KeyI', key({ ctrlKey: true }))).toBe('invert');
    expect(editSelectShortcutOperation('NumpadAdd', key({ ctrlKey: true }))).toBe('more');
    expect(editSelectShortcutOperation('BracketLeft', key({ ctrlKey: true }))).toBe('less');
    expect(editSelectShortcutOperation('KeyL', key({ ctrlKey: true }))).toBe('linked');
    expect(editSelectShortcutOperation('KeyL', key({ altKey: true }))).toBe('loop');
    expect(editSelectShortcutOperation('KeyR', key({ altKey: true }))).toBe('ring');
    expect(editSelectShortcutOperation('KeyR', key({ ctrlKey: true }))).toBeNull();
    expect(editSelectShortcutOperation('KeyA', key({ ctrlKey: true, shiftKey: true }))).toBeNull();
    expect(editSelectShortcutOperation('KeyA', key({}))).toBeNull();
  });
});
