import { EditorComponentMode } from '@/types/editor_component_mode.js';
import { buildComponentEdgeKey, type ComponentSelectionEntry } from '@/edit/component/component_selection_entry.js';

/**
 * Builds the component selection for a committed loop cut.
 *
 * @param targetId Domain target id.
 * @param mode Active component mode.
 * @param insertedVertexIndices New vertices in loop order.
 * @returns Vertex entries, ring-edge entries, or an empty list in face mode.
 */
export function buildLoopCutComponentSelection(
  targetId: string,
  mode: EditorComponentMode,
  insertedVertexIndices: readonly number[],
): ComponentSelectionEntry[] {
  if (mode === EditorComponentMode.VERTEX) {
    return buildLoopCutVertexSelection(targetId, insertedVertexIndices);
  }
  if (mode === EditorComponentMode.EDGE) {
    return buildLoopCutEdgeSelection(targetId, insertedVertexIndices);
  }
  return [];
}

/**
 * Builds a vertex selection for every inserted loop vertex.
 *
 * @param targetId Domain target id.
 * @param insertedVertexIndices New vertices in loop order.
 * @returns Vertex selection entries.
 */
function buildLoopCutVertexSelection(
  targetId: string,
  insertedVertexIndices: readonly number[],
): ComponentSelectionEntry[] {
  const entries: ComponentSelectionEntry[] = [];
  for (const vertexIndex of insertedVertexIndices) {
    entries.push(createVertexSelectionEntry(targetId, vertexIndex));
  }
  return entries;
}

/**
 * Builds one vertex selection entry.
 *
 * @param targetId Domain target id.
 * @param vertexIndex Inserted vertex index.
 * @returns Vertex entry.
 */
function createVertexSelectionEntry(targetId: string, vertexIndex: number): ComponentSelectionEntry {
  return { targetId, kind: 'vertex', componentKey: String(vertexIndex) };
}

/**
 * Builds the closed ring of edges that join consecutive inserted vertices.
 *
 * @param targetId Domain target id.
 * @param insertedVertexIndices New vertices in loop order.
 * @returns Edge selection entries.
 */
function buildLoopCutEdgeSelection(
  targetId: string,
  insertedVertexIndices: readonly number[],
): ComponentSelectionEntry[] {
  const entries: ComponentSelectionEntry[] = [];
  const count = insertedVertexIndices.length;
  for (let index = 0; index < count; index += 1) {
    appendLoopCutEdgeEntry(entries, targetId, insertedVertexIndices, index, count);
  }
  return entries;
}

/**
 * Appends the ring edge that starts at one inserted vertex.
 *
 * @param entries Output entries.
 * @param targetId Domain target id.
 * @param insertedVertexIndices New vertices in loop order.
 * @param index Start index in the loop.
 * @param count Loop length.
 */
function appendLoopCutEdgeEntry(
  entries: ComponentSelectionEntry[],
  targetId: string,
  insertedVertexIndices: readonly number[],
  index: number,
  count: number,
): void {
  const start = insertedVertexIndices[index];
  const end = insertedVertexIndices[(index + 1) % count];
  if (start === undefined || end === undefined) {
    return;
  }
  entries.push(createEdgeSelectionEntry(targetId, start, end));
}

/**
 * Builds one undirected edge selection entry.
 *
 * @param targetId Domain target id.
 * @param vertexA First endpoint.
 * @param vertexB Second endpoint.
 * @returns Edge entry.
 */
function createEdgeSelectionEntry(targetId: string, vertexA: number, vertexB: number): ComponentSelectionEntry {
  return { targetId, kind: 'edge', componentKey: buildComponentEdgeKey(vertexA, vertexB) };
}
