import type { ComponentSelectionEntry } from '@/edit/component/component_selection_entry.js';
import type { ComponentTopologyTarget } from '@/edit/component/component_selection_topology.js';

/**
 * Keeps the selected components that still exist in the domain topology, for
 * example after a room undo rebuilt a mesh or brush with fewer components.
 *
 * @param entries Selected components.
 * @param topologies Current domain topologies.
 * @returns Entries whose target and component still exist.
 */
export function pruneComponentSelection(
  entries: readonly ComponentSelectionEntry[],
  topologies: readonly ComponentTopologyTarget[],
): ComponentSelectionEntry[] {
  const byTarget = new Map(topologies.map((topology) => [topology.targetId, topologyKeys(topology)]));
  return entries.filter((entry) => byTarget.get(entry.targetId)?.[entry.kind].has(entry.componentKey) === true);
}

/**
 * Collects the component keys of one topology by kind.
 *
 * @param topology Domain topology.
 * @returns Vertex, edge and face keys.
 */
function topologyKeys(topology: ComponentTopologyTarget): Record<ComponentSelectionEntry['kind'], Set<string>> {
  const vertex = new Set<string>();
  topology.edges.forEach((edge) => {
    vertex.add(String(edge.vertexA));
    vertex.add(String(edge.vertexB));
  });
  topology.faces.forEach((face) => face.vertexIndices.forEach((index) => vertex.add(String(index))));
  const edge = new Set(topology.edges.map((item) => item.edgeKey));
  const face = new Set(topology.faces.map((item) => String(item.faceIndex)));
  return { vertex, edge, face };
}
