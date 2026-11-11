import { EditorComponentMode } from '@/types/editor_component_mode.js';
import type { ComponentSelectionEntry } from './component_selection_entry.js';
import type { ComponentTopologyTarget } from './component_selection_topology.js';

/** Expanded per-target selection used while converting modes. */
interface ExpandedComponentSelection {
  vertices: Set<number>;
  edges: Set<string>;
  faces: Set<number>;
}

/**
 * Converts the current component selection into the target mode using Expansion
 * and contraction rules between component modes.
 *
 * @param selected Current selection entries (any component kinds).
 * @param targetMode Mode to convert into.
 * @param topologies Domain topologies keyed by target id.
 * @returns Converted selection entries of only the target mode kind.
 */
export function convertComponentSelectionForMode(
  selected: readonly ComponentSelectionEntry[],
  targetMode: EditorComponentMode,
  topologies: readonly ComponentTopologyTarget[],
): ComponentSelectionEntry[] {
  const topologyById = indexTopologiesByTargetId(topologies);
  const converted: ComponentSelectionEntry[] = [];
  for (const [targetId, entries] of groupEntriesByTarget(selected)) {
    const topology = topologyById.get(targetId);
    if (!topology) {
      continue;
    }
    const expanded = expandSelectionForTarget(entries, topology);
    appendConvertedEntries(converted, targetId, targetMode, expanded, topology);
  }
  return converted;
}

/**
 * Indexes topology targets by id.
 *
 * @param topologies Topology list.
 * @returns Map of target id → topology.
 */
function indexTopologiesByTargetId(
  topologies: readonly ComponentTopologyTarget[],
): Map<string, ComponentTopologyTarget> {
  const map = new Map<string, ComponentTopologyTarget>();
  for (const topology of topologies) {
    map.set(topology.targetId, topology);
  }
  return map;
}

/**
 * Groups selection entries by domain target id.
 *
 * @param selected Selection entries.
 * @returns Map of target id → entries.
 */
function groupEntriesByTarget(selected: readonly ComponentSelectionEntry[]): Map<string, ComponentSelectionEntry[]> {
  const map = new Map<string, ComponentSelectionEntry[]>();
  for (const entry of selected) {
    const list = map.get(entry.targetId);
    if (list) {
      list.push(entry);
      continue;
    }
    map.set(entry.targetId, [entry]);
  }
  return map;
}

/**
 * Expands selected components to vertices, edges, and faces they imply.
 *
 * @param entries Entries for one target.
 * @param topology Target topology.
 * @returns Expanded sets.
 */
function expandSelectionForTarget(
  entries: readonly ComponentSelectionEntry[],
  topology: ComponentTopologyTarget,
): ExpandedComponentSelection {
  const expanded: ExpandedComponentSelection = {
    vertices: new Set(),
    edges: new Set(),
    faces: new Set(),
  };
  for (const entry of entries) {
    expandOneEntry(entry, topology, expanded);
  }
  return expanded;
}

/**
 * Expands one selection entry into the expanded sets.
 *
 * @param entry Selection entry.
 * @param topology Target topology.
 * @param expanded Output sets.
 */
function expandOneEntry(
  entry: ComponentSelectionEntry,
  topology: ComponentTopologyTarget,
  expanded: ExpandedComponentSelection,
): void {
  if (entry.kind === 'vertex') {
    expanded.vertices.add(Number(entry.componentKey));
    return;
  }
  if (entry.kind === 'edge') {
    expandEdgeEntry(entry.componentKey, topology, expanded);
    return;
  }
  expandFaceEntry(Number(entry.componentKey), topology, expanded);
}

/**
 * Expands a selected edge to the edge and its endpoints.
 *
 * @param edgeKey Edge key.
 * @param topology Target topology.
 * @param expanded Output sets.
 */
function expandEdgeEntry(
  edgeKey: string,
  topology: ComponentTopologyTarget,
  expanded: ExpandedComponentSelection,
): void {
  expanded.edges.add(edgeKey);
  const edge = topology.edges.find((item) => item.edgeKey === edgeKey);
  if (!edge) {
    return;
  }
  expanded.vertices.add(edge.vertexA);
  expanded.vertices.add(edge.vertexB);
}

/**
 * Expands a selected face to the face, boundary edges, and vertices.
 *
 * @param faceIndex Face index.
 * @param topology Target topology.
 * @param expanded Output sets.
 */
function expandFaceEntry(
  faceIndex: number,
  topology: ComponentTopologyTarget,
  expanded: ExpandedComponentSelection,
): void {
  if (!Number.isFinite(faceIndex)) {
    return;
  }
  const face = topology.faces.find((item) => item.faceIndex === faceIndex);
  if (!face) {
    return;
  }
  expanded.faces.add(faceIndex);
  for (const edgeKey of face.edgeKeys) {
    expanded.edges.add(edgeKey);
  }
  for (const vertexIndex of face.vertexIndices) {
    expanded.vertices.add(vertexIndex);
  }
}

/**
 * Appends converted entries for one target and mode.
 *
 * @param output Output list.
 * @param targetId Domain target id.
 * @param targetMode Destination mode.
 * @param expanded Expanded selection.
 * @param topology Target topology.
 */
function appendConvertedEntries(
  output: ComponentSelectionEntry[],
  targetId: string,
  targetMode: EditorComponentMode,
  expanded: ExpandedComponentSelection,
  topology: ComponentTopologyTarget,
): void {
  if (targetMode === EditorComponentMode.VERTEX) {
    appendVertexEntries(output, targetId, expanded.vertices);
    return;
  }
  if (targetMode === EditorComponentMode.EDGE) {
    appendEdgeEntries(output, targetId, collectEdgesForEdgeMode(expanded, topology));
    return;
  }
  appendFaceEntries(output, targetId, collectFacesForFaceMode(expanded, topology));
}

/**
 * Collects edges for edge mode (selected edges plus fully-selected-vertex
 * edges).
 *
 * @param expanded Expanded selection.
 * @param topology Target topology.
 * @returns Edge keys.
 */
function collectEdgesForEdgeMode(expanded: ExpandedComponentSelection, topology: ComponentTopologyTarget): Set<string> {
  const edgeKeys = new Set<string>(expanded.edges);
  for (const edge of topology.edges) {
    if (!expanded.vertices.has(edge.vertexA) || !expanded.vertices.has(edge.vertexB)) {
      continue;
    }
    edgeKeys.add(edge.edgeKey);
  }
  return edgeKeys;
}

/**
 * Collects faces for face mode (selected faces plus fully selected loops).
 *
 * @param expanded Expanded selection.
 * @param topology Target topology.
 * @returns Face indices.
 */
function collectFacesForFaceMode(expanded: ExpandedComponentSelection, topology: ComponentTopologyTarget): Set<number> {
  const faceIndices = new Set<number>(expanded.faces);
  for (const face of topology.faces) {
    if (isFaceFullySelected(face, expanded)) {
      faceIndices.add(face.faceIndex);
    }
  }
  return faceIndices;
}

/**
 * Returns whether a face should be selected in face mode. Full edge loops
 * promote; full vertex loops promote only when no incomplete edge loop would
 * otherwise claim the face via edge-endpoint vertices.
 *
 * @param face Face topology.
 * @param expanded Expanded selection.
 * @returns True when the face should stay selected in face mode.
 */
function isFaceFullySelected(
  face: ComponentTopologyTarget['faces'][number],
  expanded: ExpandedComponentSelection,
): boolean {
  if (face.edgeKeys.length > 0 && face.edgeKeys.every((edgeKey) => expanded.edges.has(edgeKey))) {
    return true;
  }
  if (face.vertexIndices.length === 0) {
    return false;
  }
  if (!face.vertexIndices.every((vertexIndex) => expanded.vertices.has(vertexIndex))) {
    return false;
  }
  return !faceHasPartialEdgeSelection(face.edgeKeys, expanded.edges);
}

/**
 * Returns true when some but not all of the given edges are selected.
 *
 * @param edgeKeys Face boundary edge keys.
 * @param selectedEdges Expanded edge set.
 * @returns True for an incomplete edge loop.
 */
function faceHasPartialEdgeSelection(edgeKeys: readonly string[], selectedEdges: Set<string>): boolean {
  let selectedCount = 0;
  for (const edgeKey of edgeKeys) {
    if (selectedEdges.has(edgeKey)) {
      selectedCount += 1;
    }
  }
  return selectedCount > 0 && selectedCount < edgeKeys.length;
}

/**
 * Appends vertex selection entries.
 *
 * @param output Output list.
 * @param targetId Domain target id.
 * @param vertices Selected vertex indices.
 */
function appendVertexEntries(output: ComponentSelectionEntry[], targetId: string, vertices: Set<number>): void {
  for (const vertexIndex of vertices) {
    if (!Number.isFinite(vertexIndex)) {
      continue;
    }
    output.push({ targetId, kind: 'vertex', componentKey: String(vertexIndex) });
  }
}

/**
 * Appends edge selection entries.
 *
 * @param output Output list.
 * @param targetId Domain target id.
 * @param edgeKeys Selected edge keys.
 */
function appendEdgeEntries(output: ComponentSelectionEntry[], targetId: string, edgeKeys: Set<string>): void {
  for (const edgeKey of edgeKeys) {
    output.push({ targetId, kind: 'edge', componentKey: edgeKey });
  }
}

/**
 * Appends face selection entries.
 *
 * @param output Output list.
 * @param targetId Domain target id.
 * @param faceIndices Selected face indices.
 */
function appendFaceEntries(output: ComponentSelectionEntry[], targetId: string, faceIndices: Set<number>): void {
  for (const faceIndex of faceIndices) {
    output.push({ targetId, kind: 'face', componentKey: String(faceIndex) });
  }
}
