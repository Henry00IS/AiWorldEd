import { EditorComponentMode } from '@/types/editor_component_mode.js';
import {
  buildComponentEdgeKey,
  type ComponentSelectionEntry,
  type ComponentSelectionKind,
} from './component_selection_entry.js';
import type { ComponentTopologyTarget } from './component_selection_topology.js';

/** Selection operations offered in Edit Mode. */
export type EditSelectOperation = 'all' | 'none' | 'invert' | 'more' | 'less' | 'linked' | 'loop' | 'ring';

/** Neighbourhood tables of one target. */
interface SelectionGraph {
  vertices: number[];
  edges: Map<string, { a: number; b: number; faces: number[] }>;
  faces: Map<number, { vertices: number[]; edges: string[] }>;
  vertexEdges: Map<number, string[]>;
}

/**
 * Applies a selection operation to the Edit Mode selection. Only components of
 * the current mode's kind are read and returned. All and Invert cover every
 * edited target; the others work on each target's own selection. Selection
 * never changes geometry, so brushes stay valid.
 *
 * @param operation Operation.
 * @param selected Current selection.
 * @param mode Current component mode.
 * @param topologies Topology of every edited target.
 * @returns New selection.
 */
export function componentSelectionExpand(
  operation: EditSelectOperation,
  selected: readonly ComponentSelectionEntry[],
  mode: EditorComponentMode,
  topologies: readonly ComponentTopologyTarget[],
): ComponentSelectionEntry[] {
  if (operation === 'none') return [];
  const kind = componentSelectionKindOf(mode);
  const result: ComponentSelectionEntry[] = [];
  for (const topology of topologies) {
    const graph = selectionGraph(topology);
    const picked = new Set(
      selected
        .filter((entry) => entry.targetId === topology.targetId && entry.kind === kind)
        .map((entry) => entry.componentKey),
    );
    if (picked.size === 0 && operation !== 'all' && operation !== 'invert') continue;
    const next = selectionOperate(operation, kind, picked, graph);
    for (const componentKey of next) result.push({ targetId: topology.targetId, kind, componentKey });
  }
  return result;
}

/** Why a loop or ring did not grow the selection. */
export type EditSelectLoopGuidanceKind =
  'needSelection' | 'needVertexPair' | 'needFacePair' | 'noEdgeLoop' | 'noEdgeRing' | 'noFaceStrip';

/** Outcome of walking loops or rings on one target. */
type LoopWalkClass = 'empty' | 'stuck' | 'ok';

/** Combined walk outcomes across every edited target. */
interface LoopWalkSummary {
  picked: boolean;
  stuck: boolean;
  grewOrComplete: boolean;
}

/**
 * Classifies why Select Loop or Select Ring did not run, or returns null when
 * the current selection already started a loop or ring (including one that is
 * already complete).
 *
 * @param operation Loop or ring.
 * @param selected Current selection.
 * @param mode Current component mode.
 * @param topologies Topology of every edited target.
 * @returns Guidance kind, or null when the operation applied.
 */
export function classifyEditSelectLoopOrRing(
  operation: 'loop' | 'ring',
  selected: readonly ComponentSelectionEntry[],
  mode: EditorComponentMode,
  topologies: readonly ComponentTopologyTarget[],
): EditSelectLoopGuidanceKind | null {
  const summary = summarizeLoopWalks(operation, selected, mode, topologies);
  const kind = componentSelectionKindOf(mode);
  if (summary.grewOrComplete) return null;
  if (summary.stuck) return stuckGuidanceKind(operation, kind);
  if (summary.picked) return missingSeedGuidanceKind(kind);
  return 'needSelection';
}

/**
 * Walks every target and records whether any loop or ring started, grew, or
 * stayed stuck.
 *
 * @param operation Loop or ring.
 * @param selected Current selection.
 * @param mode Current component mode.
 * @param topologies Topology of every edited target.
 * @returns Combined walk summary.
 */
function summarizeLoopWalks(
  operation: 'loop' | 'ring',
  selected: readonly ComponentSelectionEntry[],
  mode: EditorComponentMode,
  topologies: readonly ComponentTopologyTarget[],
): LoopWalkSummary {
  const kind = componentSelectionKindOf(mode);
  const summary: LoopWalkSummary = { picked: false, stuck: false, grewOrComplete: false };
  for (const topology of topologies) accumulateLoopWalk(summary, operation, kind, selected, topology);
  return summary;
}

/**
 * Adds one target's walk outcome to the running summary.
 *
 * @param summary Running summary.
 * @param operation Loop or ring.
 * @param kind Current component kind.
 * @param selected Current selection.
 * @param topology Target topology.
 */
function accumulateLoopWalk(
  summary: LoopWalkSummary,
  operation: 'loop' | 'ring',
  kind: ComponentSelectionKind,
  selected: readonly ComponentSelectionEntry[],
  topology: ComponentTopologyTarget,
): void {
  const picked = pickedComponentKeys(selected, topology.targetId, kind);
  if (picked.size > 0) summary.picked = true;
  applyWalkClassToSummary(summary, classifyLoopWalk(operation, kind, picked, selectionGraph(topology)));
}

/**
 * Records a single target walk class on the running summary.
 *
 * @param summary Running summary.
 * @param walkClass Walk class for one target.
 */
function applyWalkClassToSummary(summary: LoopWalkSummary, walkClass: LoopWalkClass): void {
  if (walkClass === 'stuck') summary.stuck = true;
  if (walkClass === 'ok') summary.grewOrComplete = true;
}

/**
 * Classifies a loop or ring walk on one target.
 *
 * @param operation Loop or ring.
 * @param kind Current component kind.
 * @param picked Selected keys of that kind on the target.
 * @param graph Target graph.
 * @returns Walk class.
 */
function classifyLoopWalk(
  operation: 'loop' | 'ring',
  kind: ComponentSelectionKind,
  picked: ReadonlySet<string>,
  graph: SelectionGraph,
): LoopWalkClass {
  if (kind === 'face') return classifyFaceStripWalk(picked, graph);
  if (kind === 'vertex') return classifyVertexLoopWalk(operation, picked, graph);
  return classifyEdgeLoopWalk(operation, picked, graph);
}

/**
 * Classifies an edge loop or ring from the selected edges.
 *
 * @param operation Loop or ring.
 * @param picked Selected edge keys.
 * @param graph Target graph.
 * @returns Walk class.
 */
function classifyEdgeLoopWalk(
  operation: 'loop' | 'ring',
  picked: ReadonlySet<string>,
  graph: SelectionGraph,
): LoopWalkClass {
  if (picked.size === 0) return 'empty';
  let longWalk = false;
  let extended = false;
  for (const seed of picked) {
    const walked = operation === 'ring' ? selectionEdgeRing(seed, graph) : selectionEdgeLoop(seed, graph);
    if (walked.length > 1) longWalk = true;
    if (walked.some((key) => !picked.has(key))) extended = true;
  }
  return extended || longWalk ? 'ok' : 'stuck';
}

/**
 * Classifies a vertex loop or ring from edges shared by selected vertices.
 *
 * @param operation Loop or ring.
 * @param picked Selected vertex keys.
 * @param graph Target graph.
 * @returns Walk class.
 */
function classifyVertexLoopWalk(
  operation: 'loop' | 'ring',
  picked: ReadonlySet<string>,
  graph: SelectionGraph,
): LoopWalkClass {
  const seeds = vertexSeedEdges(picked, graph);
  if (seeds.length === 0) return 'empty';
  return classifyEdgeLoopWalk(operation, new Set(seeds), graph);
}

/**
 * Lists edges whose both endpoints are selected.
 *
 * @param picked Selected vertex keys.
 * @param graph Target graph.
 * @returns Seed edge keys.
 */
function vertexSeedEdges(picked: ReadonlySet<string>, graph: SelectionGraph): string[] {
  return [...graph.edges]
    .filter(([, edge]) => picked.has(String(edge.a)) && picked.has(String(edge.b)))
    .map(([key]) => key);
}

/**
 * Classifies a face strip from the selected faces.
 *
 * @param picked Selected face keys.
 * @param graph Target graph.
 * @returns Walk class.
 */
function classifyFaceStripWalk(picked: ReadonlySet<string>, graph: SelectionGraph): LoopWalkClass {
  if (!hasAdjacentSelectedFacePair(picked, graph)) return 'empty';
  const found = selectionFaceStrips(picked, graph);
  if (found.length > picked.size) return 'ok';
  return hasQuadSharedSelectedEdge(picked, graph) ? 'ok' : 'stuck';
}

/**
 * Returns whether two selected faces share an edge.
 *
 * @param picked Selected face keys.
 * @param graph Target graph.
 * @returns True when a neighbouring pair is selected.
 */
function hasAdjacentSelectedFacePair(picked: ReadonlySet<string>, graph: SelectionGraph): boolean {
  for (const edge of graph.edges.values()) {
    const [left, right] = edge.faces;
    if (edge.faces.length === 2 && picked.has(String(left)) && picked.has(String(right))) return true;
  }
  return false;
}

/**
 * Returns whether two selected faces share an edge of a quad.
 *
 * @param picked Selected face keys.
 * @param graph Target graph.
 * @returns True when a shared quad edge exists.
 */
function hasQuadSharedSelectedEdge(picked: ReadonlySet<string>, graph: SelectionGraph): boolean {
  for (const [edgeKey, edge] of graph.edges) {
    const [left, right] = edge.faces;
    if (edge.faces.length !== 2 || !picked.has(String(left)) || !picked.has(String(right))) continue;
    if (left !== undefined && selectionOpposite(graph, left, edgeKey)) return true;
  }
  return false;
}

/**
 * Returns the guidance kind used when a walk started but could not continue.
 *
 * @param operation Loop or ring.
 * @param kind Current component kind.
 * @returns Guidance kind.
 */
function stuckGuidanceKind(operation: 'loop' | 'ring', kind: ComponentSelectionKind): EditSelectLoopGuidanceKind {
  if (kind === 'face') return 'noFaceStrip';
  return operation === 'loop' ? 'noEdgeLoop' : 'noEdgeRing';
}

/**
 * Returns the guidance kind used when the mode has a selection but no loop or
 * ring seed.
 *
 * @param kind Current component kind.
 * @returns Guidance kind.
 */
function missingSeedGuidanceKind(kind: ComponentSelectionKind): EditSelectLoopGuidanceKind {
  if (kind === 'vertex') return 'needVertexPair';
  if (kind === 'face') return 'needFacePair';
  return 'needSelection';
}

/**
 * Collects selected component keys of one kind on one target.
 *
 * @param selected Current selection.
 * @param targetId Target id.
 * @param kind Kind of the current mode.
 * @returns Selected keys on that target.
 */
function pickedComponentKeys(
  selected: readonly ComponentSelectionEntry[],
  targetId: string,
  kind: ComponentSelectionKind,
): Set<string> {
  return new Set(
    selected.filter((entry) => entry.targetId === targetId && entry.kind === kind).map((entry) => entry.componentKey),
  );
}

/**
 * Returns the component kind a mode selects.
 *
 * @param mode Component mode.
 * @returns Kind.
 */
function componentSelectionKindOf(mode: EditorComponentMode): ComponentSelectionKind {
  if (mode === EditorComponentMode.VERTEX) return 'vertex';
  if (mode === EditorComponentMode.EDGE) return 'edge';
  return 'face';
}

/**
 * Builds the neighbourhood tables of a target.
 *
 * @param topology Topology.
 * @returns Graph.
 */
function selectionGraph(topology: ComponentTopologyTarget): SelectionGraph {
  const edges = new Map<string, { a: number; b: number; faces: number[] }>();
  const vertexEdges = new Map<number, string[]>();
  const faces = new Map<number, { vertices: number[]; edges: string[] }>();
  const vertices = new Set<number>();
  const addEdge = (a: number, b: number): string => {
    const key = buildComponentEdgeKey(a, b);
    if (!edges.has(key)) {
      edges.set(key, { a, b, faces: [] });
      for (const vertex of [a, b]) {
        vertices.add(vertex);
        const list = vertexEdges.get(vertex) ?? [];
        list.push(key);
        vertexEdges.set(vertex, list);
      }
    }
    return key;
  };
  for (const edge of topology.edges) addEdge(edge.vertexA, edge.vertexB);
  for (const face of topology.faces) {
    const loop = face.vertexIndices;
    const keys = loop.map((vertex, index) => addEdge(vertex, loop[(index + 1) % loop.length]!));
    for (const key of keys) edges.get(key)?.faces.push(face.faceIndex);
    faces.set(face.faceIndex, { vertices: loop.slice(), edges: keys });
  }
  return { vertices: [...vertices].sort((a, b) => a - b), edges, faces, vertexEdges };
}

/**
 * Runs one operation on one target.
 *
 * @param operation Operation.
 * @param kind Component kind.
 * @param picked Selected component keys.
 * @param graph Target graph.
 * @returns Selected component keys after the operation.
 */
function selectionOperate(
  operation: EditSelectOperation,
  kind: ComponentSelectionKind,
  picked: ReadonlySet<string>,
  graph: SelectionGraph,
): string[] {
  const universe = selectionUniverse(kind, graph);
  if (operation === 'all') return universe;
  if (operation === 'invert') return universe.filter((key) => !picked.has(key));
  if (operation === 'more') return selectionGrow(kind, picked, graph);
  if (operation === 'less') return selectionShrink(kind, picked, graph);
  if (operation === 'linked') return selectionLinked(kind, picked, graph);
  return selectionLoop(operation, kind, picked, graph);
}

/**
 * Lists every component of a kind.
 *
 * @param kind Kind.
 * @param graph Graph.
 * @returns Keys.
 */
function selectionUniverse(kind: ComponentSelectionKind, graph: SelectionGraph): string[] {
  if (kind === 'vertex') return graph.vertices.map(String);
  if (kind === 'edge') return [...graph.edges.keys()];
  return [...graph.faces.keys()].map(String);
}

/**
 * Lists the neighbours of a component: vertices along edges, edges through
 * shared vertices, faces across shared edges.
 *
 * @param kind Kind.
 * @param key Component key.
 * @param graph Graph.
 * @returns Neighbour keys.
 */
function selectionNeighbours(kind: ComponentSelectionKind, key: string, graph: SelectionGraph): string[] {
  if (kind === 'vertex') {
    const vertex = Number(key);
    return (graph.vertexEdges.get(vertex) ?? []).map((edgeKey) => {
      const edge = graph.edges.get(edgeKey)!;
      return String(edge.a === vertex ? edge.b : edge.a);
    });
  }
  if (kind === 'edge') {
    const edge = graph.edges.get(key);
    if (!edge) return [];
    return [edge.a, edge.b].flatMap((vertex) => graph.vertexEdges.get(vertex) ?? []).filter((other) => other !== key);
  }
  const face = graph.faces.get(Number(key));
  if (!face) return [];
  return face.edges
    .flatMap((edgeKey) => graph.edges.get(edgeKey)?.faces ?? [])
    .filter((other) => String(other) !== key)
    .map(String);
}

/**
 * Returns whether a component touches an open border of the surface.
 *
 * @param kind Kind.
 * @param key Component key.
 * @param graph Graph.
 * @returns True on a border.
 */
function selectionOnBorder(kind: ComponentSelectionKind, key: string, graph: SelectionGraph): boolean {
  const borderEdge = (edgeKey: string): boolean => (graph.edges.get(edgeKey)?.faces.length ?? 0) < 2;
  const borderVertex = (vertex: number): boolean => (graph.vertexEdges.get(vertex) ?? []).some(borderEdge);
  if (graph.faces.size === 0) return false;
  if (kind === 'vertex') return borderVertex(Number(key));
  if (kind === 'edge') {
    const edge = graph.edges.get(key);
    return !edge || borderVertex(edge.a) || borderVertex(edge.b);
  }
  return graph.faces.get(Number(key))?.edges.some(borderEdge) ?? true;
}

/**
 * Adds every neighbour of the selection.
 *
 * @param kind Kind.
 * @param picked Selection.
 * @param graph Graph.
 * @returns Grown selection.
 */
function selectionGrow(kind: ComponentSelectionKind, picked: ReadonlySet<string>, graph: SelectionGraph): string[] {
  const grown = new Set(picked);
  for (const key of picked) for (const neighbour of selectionNeighbours(kind, key, graph)) grown.add(neighbour);
  return [...grown];
}

/**
 * Drops the outer ring of the selection: components with an unselected
 * neighbour or on an open border.
 *
 * @param kind Kind.
 * @param picked Selection.
 * @param graph Graph.
 * @returns Shrunk selection.
 */
function selectionShrink(kind: ComponentSelectionKind, picked: ReadonlySet<string>, graph: SelectionGraph): string[] {
  return [...picked].filter(
    (key) =>
      !selectionOnBorder(kind, key, graph) &&
      selectionNeighbours(kind, key, graph).every((neighbour) => picked.has(neighbour)),
  );
}

/**
 * Adds everything connected to the selection.
 *
 * @param kind Kind.
 * @param picked Selection.
 * @param graph Graph.
 * @returns Connected components.
 */
function selectionLinked(kind: ComponentSelectionKind, picked: ReadonlySet<string>, graph: SelectionGraph): string[] {
  const reached = new Set(picked);
  const queue = [...picked];
  while (queue.length > 0) {
    const key = queue.pop()!;
    for (const neighbour of selectionNeighbours(kind, key, graph)) {
      if (reached.has(neighbour)) continue;
      reached.add(neighbour);
      queue.push(neighbour);
    }
  }
  return [...reached];
}

/**
 * Extends the selection into loops or rings. Edges: Loop runs straight through
 * four-way vertices, Ring steps across quads. Faces: both run a strip of quads
 * on from each pair of neighbouring selected faces. Vertices: the edges between
 * selected vertices are extended and their vertices returned.
 *
 * @param operation Loop or ring.
 * @param kind Kind.
 * @param picked Selection.
 * @param graph Graph.
 * @returns Extended selection.
 */
function selectionLoop(
  operation: EditSelectOperation,
  kind: ComponentSelectionKind,
  picked: ReadonlySet<string>,
  graph: SelectionGraph,
): string[] {
  if (kind === 'face') return selectionFaceStrips(picked, graph);
  const seeds =
    kind === 'edge'
      ? [...picked]
      : [...graph.edges]
          .filter(([, edge]) => picked.has(String(edge.a)) && picked.has(String(edge.b)))
          .map(([key]) => key);
  const found = new Set<string>(seeds);
  for (const seed of seeds) {
    for (const key of operation === 'ring' ? selectionEdgeRing(seed, graph) : selectionEdgeLoop(seed, graph))
      found.add(key);
  }
  if (kind === 'edge') return [...found];
  const vertices = new Set(picked);
  for (const key of found) {
    const edge = graph.edges.get(key);
    if (edge) vertices.add(String(edge.a)).add(String(edge.b));
  }
  return [...vertices];
}

/**
 * Walks an edge loop both ways from an edge, crossing only vertices where four
 * edges meet, taking the edge that shares no face with the incoming one.
 *
 * @param start Start edge key.
 * @param graph Graph.
 * @returns Loop edge keys.
 */
function selectionEdgeLoop(start: string, graph: SelectionGraph): string[] {
  const first = graph.edges.get(start);
  if (!first) return [];
  const found = new Set([start]);
  for (const from of [first.a, first.b]) {
    let edgeKey = start;
    let vertex = from;
    for (;;) {
      const around = graph.vertexEdges.get(vertex) ?? [];
      if (around.length !== 4) break;
      const faces = new Set(graph.edges.get(edgeKey)?.faces ?? []);
      const next = around.find(
        (candidate) =>
          candidate !== edgeKey && !(graph.edges.get(candidate)?.faces ?? []).some((face) => faces.has(face)),
      );
      if (!next || found.has(next)) break;
      found.add(next);
      const edge = graph.edges.get(next)!;
      vertex = edge.a === vertex ? edge.b : edge.a;
      edgeKey = next;
    }
  }
  return [...found];
}

/**
 * Walks an edge ring both ways from an edge, stepping across each quad to the
 * opposite edge.
 *
 * @param start Start edge key.
 * @param graph Graph.
 * @returns Ring edge keys.
 */
function selectionEdgeRing(start: string, graph: SelectionGraph): string[] {
  const found = new Set([start]);
  for (const firstFace of graph.edges.get(start)?.faces ?? []) {
    let edgeKey = start;
    let faceIndex: number | undefined = firstFace;
    while (faceIndex !== undefined) {
      const opposite = selectionOpposite(graph, faceIndex, edgeKey);
      if (!opposite || found.has(opposite)) break;
      found.add(opposite);
      const from: number = faceIndex;
      faceIndex = graph.edges.get(opposite)?.faces.find((face) => face !== from);
      edgeKey = opposite;
    }
  }
  return [...found];
}

/**
 * Extends each pair of selected faces sharing an edge into a strip of quads,
 * both ways.
 *
 * @param picked Selected faces.
 * @param graph Graph.
 * @returns Strip faces.
 */
function selectionFaceStrips(picked: ReadonlySet<string>, graph: SelectionGraph): string[] {
  const found = new Set(picked);
  for (const [edgeKey, edge] of graph.edges) {
    const [left, right] = edge.faces;
    if (edge.faces.length !== 2 || !picked.has(String(left)) || !picked.has(String(right))) continue;
    for (const [from, onward] of [
      [left!, right!],
      [right!, left!],
    ] as const) {
      let shared = edgeKey;
      let previous = from;
      let face: number | undefined = onward;
      while (face !== undefined) {
        const opposite = selectionOpposite(graph, face, shared);
        if (!opposite) break;
        const current: number = face;
        const next = graph.edges.get(opposite)?.faces.find((other) => other !== current);
        if (next === undefined || next === previous || found.has(String(next))) break;
        found.add(String(next));
        previous = current;
        face = next;
        shared = opposite;
      }
    }
  }
  return [...found];
}

/**
 * Returns the edge across a quad from one of its edges.
 *
 * @param graph Graph.
 * @param faceIndex Face index.
 * @param edgeKey Edge on the face.
 * @returns Opposite edge key, or null when the face is no quad.
 */
function selectionOpposite(graph: SelectionGraph, faceIndex: number, edgeKey: string): string | null {
  const face = graph.faces.get(faceIndex);
  if (!face || face.edges.length !== 4) return null;
  const index = face.edges.indexOf(edgeKey);
  return index < 0 ? null : face.edges[(index + 2) % 4]!;
}
