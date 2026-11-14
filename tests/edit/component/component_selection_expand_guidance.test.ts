import { describe, expect, it } from 'vitest';
import { EditorComponentMode } from '@/types/editor_component_mode.js';
import { buildComponentEdgeKey, type ComponentSelectionEntry } from '@/edit/component/component_selection_entry.js';
import type { ComponentTopologyTarget } from '@/edit/component/component_selection_topology.js';
import { componentSelectionExpand } from '@/edit/component/component_selection_expand.js';
import {
  EDIT_SELECT_NEED_EDGE_LOOP,
  EDIT_SELECT_NEED_EDGE_RING,
  EDIT_SELECT_NEED_FACE_PAIR,
  EDIT_SELECT_NEED_VERTEX_PAIR,
  EDIT_SELECT_NO_EDGE_LOOP,
  EDIT_SELECT_NO_EDGE_RING,
  EDIT_SELECT_NO_FACE_STRIP,
  editSelectOperationGuidance,
  editSelectOperationStatus,
} from '@/edit/component/component_selection_expand_guidance.js';
import { SolidBrushFactory } from '@/solid/brush/solid_brush_factory.js';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';

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
    for (let x = 0; x < columns; x++) appendGridFace(faces, edges, at, x, y);
  }
  return { targetId, edges: [...edges.values()], faces };
}

/**
 * Appends one quad to a grid topology.
 *
 * @param faces Face list.
 * @param edges Edge map.
 * @param at Vertex index lookup.
 * @param x Quad column.
 * @param y Quad row.
 */
function appendGridFace(
  faces: ComponentTopologyTarget['faces'],
  edges: Map<string, { edgeKey: string; vertexA: number; vertexB: number }>,
  at: (x: number, y: number) => number,
  x: number,
  y: number,
): void {
  const loop = [at(x, y), at(x + 1, y), at(x + 1, y + 1), at(x, y + 1)];
  const edgeKeys = loop.map((vertex, index) => storeEdge(edges, vertex, loop[(index + 1) % 4]!));
  faces.push({ faceIndex: faces.length, vertexIndices: loop, edgeKeys });
}

/**
 * Stores an undirected edge and returns its key.
 *
 * @param edges Edge map.
 * @param vertexA First vertex.
 * @param vertexB Second vertex.
 * @returns Edge key.
 */
function storeEdge(
  edges: Map<string, { edgeKey: string; vertexA: number; vertexB: number }>,
  vertexA: number,
  vertexB: number,
): string {
  const edgeKey = buildComponentEdgeKey(vertexA, vertexB);
  edges.set(edgeKey, { edgeKey, vertexA, vertexB });
  return edgeKey;
}

/**
 * Builds conversion topology from a solid brush's face loops.
 *
 * @param targetId Target id.
 * @param brush Brush.
 * @returns Topology.
 */
function topologyFromBrush(targetId: string, brush: SolidBrush): ComponentTopologyTarget {
  const edges = new Map<string, { edgeKey: string; vertexA: number; vertexB: number }>();
  const faces = brush.faces.map((face, faceIndex) => brushFaceTopology(faceIndex, brush, edges, face));
  return { targetId, edges: [...edges.values()], faces };
}

/**
 * Builds one brush face descriptor and records its edges.
 *
 * @param faceIndex Face index.
 * @param brush Brush.
 * @param edges Edge map.
 * @param face Brush face.
 * @returns Face descriptor.
 */
function brushFaceTopology(
  faceIndex: number,
  brush: SolidBrush,
  edges: Map<string, { edgeKey: string; vertexA: number; vertexB: number }>,
  face: SolidBrush['faces'][number],
): ComponentTopologyTarget['faces'][number] {
  const vertexIndices = brush.getFaceVertexIndices(face);
  const edgeKeys = vertexIndices.map((vertex, index) =>
    storeEdge(edges, vertex, vertexIndices[(index + 1) % vertexIndices.length]!),
  );
  return { faceIndex, vertexIndices, edgeKeys };
}

/**
 * Builds a box brush topology.
 *
 * @returns Topology.
 */
function brushBox(): ComponentTopologyTarget {
  return topologyFromBrush('brush', SolidBrushFactory.createCenteredBox(1, 1, 1));
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

/**
 * Runs a loop or ring and returns the new keys plus guidance.
 *
 * @param operation Loop or ring.
 * @param selected Current selection.
 * @param mode Component mode.
 * @param topologies Topologies.
 * @returns Keys and guidance.
 */
function runLoopOrRing(
  operation: 'loop' | 'ring',
  selected: readonly ComponentSelectionEntry[],
  mode: EditorComponentMode,
  topologies: readonly ComponentTopologyTarget[],
): { keys: string[]; guidance: string | null; status: string } {
  const next = componentSelectionExpand(operation, selected, mode, topologies);
  return {
    keys: keys(next),
    guidance: editSelectOperationGuidance(operation, selected, mode, topologies),
    status: editSelectOperationStatus(operation, selected, mode, topologies, next),
  };
}

describe('Select Loop does nothing until there is something to loop from', () => {
  it('keeps a single selected vertex and explains that a shared edge is needed', () => {
    const topology = grid(3, 3);
    const selected = entries('grid', 'vertex', [4]);
    const result = runLoopOrRing('loop', selected, EditorComponentMode.VERTEX, [topology]);
    expect(result.keys).toEqual(['4']);
    expect(result.guidance).toBe(EDIT_SELECT_NEED_VERTEX_PAIR);
  });

  it('keeps a single selected face and explains that two adjacent faces are needed', () => {
    const topology = grid(3, 3);
    const selected = entries('grid', 'face', [4]);
    const result = runLoopOrRing('loop', selected, EditorComponentMode.FACE, [topology]);
    expect(result.keys).toEqual(['4']);
    expect(result.guidance).toBe(EDIT_SELECT_NEED_FACE_PAIR);
  });

  it('does not grow a box-brush edge at three-way corners and points to Select Ring', () => {
    const topology = brushBox();
    const seed = topology.edges[0]!.edgeKey;
    const selected = entries('brush', 'edge', [seed]);
    const result = runLoopOrRing('loop', selected, EditorComponentMode.EDGE, [topology]);
    expect(result.keys).toEqual([seed]);
    expect(result.guidance).toBe(EDIT_SELECT_NO_EDGE_LOOP);
  });

  it('explains what to select when loop runs with nothing selected in Edge select', () => {
    const result = runLoopOrRing('loop', [], EditorComponentMode.EDGE, [grid(2, 2)]);
    expect(result.keys).toEqual([]);
    expect(result.guidance).toBe(EDIT_SELECT_NEED_EDGE_LOOP);
    expect(result.status).toBe(EDIT_SELECT_NEED_EDGE_LOOP);
  });

  it('explains what to select when ring runs with nothing selected in Edge select', () => {
    const result = runLoopOrRing('ring', [], EditorComponentMode.EDGE, [grid(2, 2)]);
    expect(result.keys).toEqual([]);
    expect(result.guidance).toBe(EDIT_SELECT_NEED_EDGE_RING);
  });

  it('explains when a lone vertex cannot start a ring', () => {
    const result = runLoopOrRing('ring', entries('grid', 'vertex', [0]), EditorComponentMode.VERTEX, [grid(2, 2)]);
    expect(result.keys).toEqual(['0']);
    expect(result.guidance).toBe(EDIT_SELECT_NEED_VERTEX_PAIR);
  });

  it('explains when a lone face cannot start a ring', () => {
    const result = runLoopOrRing('ring', entries('grid', 'face', [0]), EditorComponentMode.FACE, [grid(2, 2)]);
    expect(result.keys).toEqual(['0']);
    expect(result.guidance).toBe(EDIT_SELECT_NEED_FACE_PAIR);
  });
});

describe('Select Loop and Select Ring when a walk can run', () => {
  it('runs an edge loop on a quad mesh and reports the new count', () => {
    const topology = grid(3, 3);
    const selected = entries('grid', 'edge', ['5:6']);
    const result = runLoopOrRing('loop', selected, EditorComponentMode.EDGE, [topology]);
    expect(result.keys).toEqual(['4:5', '5:6', '6:7']);
    expect(result.guidance).toBeNull();
    expect(result.status).toBe('3 components selected');
  });

  it('runs an edge loop on a grid-shaped brush cage the same way as a mesh', () => {
    const topology = { ...grid(3, 3), targetId: 'brush' };
    const selected = entries('brush', 'edge', ['5:6']);
    const result = runLoopOrRing('loop', selected, EditorComponentMode.EDGE, [topology]);
    expect(result.keys).toEqual(['4:5', '5:6', '6:7']);
    expect(result.guidance).toBeNull();
  });

  it('selects an edge ring around a box brush and stays silent', () => {
    const topology = brushBox();
    const seed = topology.edges[0]!.edgeKey;
    const result = runLoopOrRing('ring', entries('brush', 'edge', [seed]), EditorComponentMode.EDGE, [topology]);
    expect(result.keys.length).toBe(4);
    expect(result.keys).toContain(seed);
    expect(result.guidance).toBeNull();
  });

  it('keeps an already complete grid edge loop selected without guidance', () => {
    const topology = grid(3, 3);
    const selected = entries('grid', 'edge', ['4:5', '5:6', '6:7']);
    const result = runLoopOrRing('loop', selected, EditorComponentMode.EDGE, [topology]);
    expect(result.keys).toEqual(['4:5', '5:6', '6:7']);
    expect(result.guidance).toBeNull();
  });

  it('extends vertices along a shared-edge loop on a quad mesh', () => {
    const topology = grid(3, 3);
    const selected = entries('grid', 'vertex', [5, 6]);
    const result = runLoopOrRing('loop', selected, EditorComponentMode.VERTEX, [topology]);
    expect(result.keys).toEqual(['4', '5', '6', '7']);
    expect(result.guidance).toBeNull();
  });

  it('points at Select Ring when two box-brush vertices share an edge that cannot loop', () => {
    const topology = brushBox();
    const edge = topology.edges[0]!;
    const selected = entries('brush', 'vertex', [edge.vertexA, edge.vertexB]);
    const result = runLoopOrRing('loop', selected, EditorComponentMode.VERTEX, [topology]);
    expect(result.keys).toEqual(
      [String(edge.vertexA), String(edge.vertexB)].sort((a, b) => a.localeCompare(b, 'en', { numeric: true })),
    );
    expect(result.guidance).toBe(EDIT_SELECT_NO_EDGE_LOOP);
  });
});

describe('Select Ring stuck cases', () => {
  it('explains when a triangle mesh edge cannot form a quad ring', () => {
    const topology: ComponentTopologyTarget = {
      targetId: 'tri',
      edges: [
        { edgeKey: '0:1', vertexA: 0, vertexB: 1 },
        { edgeKey: '1:2', vertexA: 1, vertexB: 2 },
        { edgeKey: '0:2', vertexA: 0, vertexB: 2 },
      ],
      faces: [{ faceIndex: 0, vertexIndices: [0, 1, 2], edgeKeys: ['0:1', '1:2', '0:2'] }],
    };
    const result = runLoopOrRing('ring', entries('tri', 'edge', ['0:1']), EditorComponentMode.EDGE, [topology]);
    expect(result.keys).toEqual(['0:1']);
    expect(result.guidance).toBe(EDIT_SELECT_NO_EDGE_RING);
  });

  it('explains when two selected faces do not sit in a quad strip', () => {
    const topology: ComponentTopologyTarget = {
      targetId: 'tris',
      edges: [
        { edgeKey: '0:1', vertexA: 0, vertexB: 1 },
        { edgeKey: '1:2', vertexA: 1, vertexB: 2 },
        { edgeKey: '0:2', vertexA: 0, vertexB: 2 },
        { edgeKey: '1:3', vertexA: 1, vertexB: 3 },
        { edgeKey: '2:3', vertexA: 2, vertexB: 3 },
      ],
      faces: [
        { faceIndex: 0, vertexIndices: [0, 1, 2], edgeKeys: ['0:1', '1:2', '0:2'] },
        { faceIndex: 1, vertexIndices: [1, 3, 2], edgeKeys: ['1:3', '2:3', '1:2'] },
      ],
    };
    const result = runLoopOrRing('loop', entries('tris', 'face', [0, 1]), EditorComponentMode.FACE, [topology]);
    expect(result.keys).toEqual(['0', '1']);
    expect(result.guidance).toBe(EDIT_SELECT_NO_FACE_STRIP);
  });
});
