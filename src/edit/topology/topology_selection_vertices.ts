import type { ComponentSelectionEntry } from '@/edit/component/component_selection_entry.js';

/**
 * Collects selected vertex indices for one target.
 *
 * @param selected Component selection.
 * @param targetId Target id.
 * @returns Vertex indices in selection order.
 */
export function collectSelectedVertexIndices(selected: readonly ComponentSelectionEntry[], targetId: string): number[] {
  const indices: number[] = [];
  for (const entry of selected) {
    if (entry.targetId !== targetId || entry.kind !== 'vertex') {
      continue;
    }
    const vertexIndex = Number(entry.componentKey);
    if (Number.isFinite(vertexIndex)) {
      indices.push(vertexIndex);
    }
  }
  return indices;
}

/**
 * Collects selected undirected edges for one target.
 *
 * @param selected Component selection.
 * @param targetId Target id.
 * @returns Endpoint pairs.
 */
export function collectSelectedEdgeEndpoints(
  selected: readonly ComponentSelectionEntry[],
  targetId: string,
): Array<{ vertexA: number; vertexB: number }> {
  const edges: Array<{ vertexA: number; vertexB: number }> = [];
  for (const entry of selected) {
    if (entry.targetId !== targetId || entry.kind !== 'edge') {
      continue;
    }
    const parsed = parseEdgeComponentKey(entry.componentKey);
    if (parsed) {
      edges.push(parsed);
    }
  }
  return edges;
}

/**
 * Parses an undirected edge key into endpoints.
 *
 * @param componentKey Edge key `min:max`.
 * @returns Endpoints, or null.
 */
export function parseEdgeComponentKey(componentKey: string): { vertexA: number; vertexB: number } | null {
  const parts = componentKey.split(':');
  const vertexA = Number(parts[0]);
  const vertexB = Number(parts[1]);
  if (!Number.isFinite(vertexA) || !Number.isFinite(vertexB)) {
    return null;
  }
  return { vertexA, vertexB };
}

/**
 * Collects selected face indices for one target.
 *
 * @param selected Component selection.
 * @param targetId Target id.
 * @returns Face indices.
 */
export function collectSelectedFaceIndices(selected: readonly ComponentSelectionEntry[], targetId: string): number[] {
  const indices: number[] = [];
  for (const entry of selected) {
    if (entry.targetId !== targetId || entry.kind !== 'face') {
      continue;
    }
    const faceIndex = Number(entry.componentKey);
    if (Number.isFinite(faceIndex)) {
      indices.push(faceIndex);
    }
  }
  return indices;
}

/**
 * Collects unique target ids from a selection.
 *
 * @param selected Component selection.
 * @returns Target ids.
 */
export function collectSelectionTargetIds(selected: readonly ComponentSelectionEntry[]): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const entry of selected) {
    if (seen.has(entry.targetId)) {
      continue;
    }
    seen.add(entry.targetId);
    ids.push(entry.targetId);
  }
  return ids;
}
