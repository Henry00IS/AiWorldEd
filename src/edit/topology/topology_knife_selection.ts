import { EditorComponentMode } from '@/types/editor_component_mode.js';
import { buildComponentEdgeKey, type ComponentSelectionEntry } from '@/edit/component/component_selection_entry.js';

/**
 * Builds the selection that follows a knife cut: the new vertex in Vertex mode,
 * the two halves of the cut edge in Edge mode, and nothing in Face mode.
 *
 * @param targetId Target that was cut.
 * @param mode Current component mode.
 * @param cutVertexIndices Edge start, new vertex and edge end, in that order.
 * @returns Selection entries.
 */
export function buildKnifeCutComponentSelection(
  targetId: string,
  mode: EditorComponentMode,
  cutVertexIndices: readonly number[],
): ComponentSelectionEntry[] {
  const [edgeStart, created, edgeEnd] = cutVertexIndices;
  if (edgeStart === undefined || created === undefined || edgeEnd === undefined) {
    return [];
  }
  if (mode === EditorComponentMode.VERTEX) {
    return [{ targetId, kind: 'vertex', componentKey: String(created) }];
  }
  if (mode === EditorComponentMode.EDGE) {
    return [knifeCutEdgeEntry(targetId, edgeStart, created), knifeCutEdgeEntry(targetId, created, edgeEnd)];
  }
  return [];
}

/**
 * Builds one edge selection entry.
 *
 * @param targetId Target id.
 * @param vertexA First endpoint.
 * @param vertexB Second endpoint.
 * @returns Edge entry.
 */
function knifeCutEdgeEntry(targetId: string, vertexA: number, vertexB: number): ComponentSelectionEntry {
  return { targetId, kind: 'edge', componentKey: buildComponentEdgeKey(vertexA, vertexB) };
}
