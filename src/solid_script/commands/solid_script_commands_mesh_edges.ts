import { SolidScriptCommand } from './solid_script_command.js';
import { solidScriptListingOf } from './solid_script_command_listing.js';
import { solidScriptParameterOfWhere } from './solid_script_command_of_where.js';
import { solidScriptParameterOf } from './solid_script_command_parameters.js';
import { solidScriptElementOf } from './solid_script_element_of.js';
import { solidScriptFaceGroups } from './solid_script_face_of.js';
import { solidScriptConditionHolds } from '@/solid_script/language/solid_script_condition.js';
import type { SolidScriptEdgeFacts } from '@/solid_script/language/solid_script_geometry.js';
import type { SolidScriptBlockRun } from '@/solid_script/language/solid_script_machine_types.js';
import { SOLID_SCRIPT_MESH_NEEDS_WRAP, type SolidScriptShapeMesh } from '@/solid_script/language/solid_script_mesh.js';
import {
  solidScriptMeshEdgeKey,
  solidScriptMeshEdgesSplit,
} from '@/solid_script/language/solid_script_mesh_edge_split.js';

/** Corners closer than this, in metres, are the same corner. */
const SOLID_SCRIPT_MESH_EDGES_SAME = 1e-6;

/**
 * Reads the edges of Of that pass Where. An empty Of uses selected edges, else
 * those of selected faces, else every edge of the selected objects.
 *
 * @param run Running line.
 * @param label Line name, for messages.
 * @returns Edges.
 */
function solidScriptMeshEdgesPicked(run: SolidScriptBlockRun, label: string): SolidScriptEdgeFacts[] {
  const nothingPicked = run.selectedGet('edges').length === 0 && run.selectedGet('faces').length === 0;
  const kind = run.ofValues() === null && nothingPicked ? 'objects' : 'edges';
  const edges = solidScriptElementOf(run, kind, label).flatMap((item) => run.elements.edges(item));
  return edges.filter((edge, index) =>
    solidScriptConditionHolds(run, 'where', { $Edge: run.elements.edge(edge), $Index: index, $Count: edges.length }),
  );
}

/**
 * Finds the point numbers of an edge in the first face that holds it.
 *
 * @param mesh Mesh.
 * @param edge Edge.
 * @returns Edge key, or null when the face no longer has it.
 */
function solidScriptMeshEdgesKey(mesh: SolidScriptShapeMesh, edge: SolidScriptEdgeFacts): string | null {
  const loop = mesh.faces[edge.faces[0].index] ?? [];
  const at = (corner: number, where: SolidScriptEdgeFacts['start']): boolean =>
    (mesh.points[corner]?.distanceTo(where) ?? Infinity) < SOLID_SCRIPT_MESH_EDGES_SAME;
  for (let slot = 0; slot < loop.length; slot++) {
    const a = loop[slot] ?? 0;
    const b = loop[(slot + 1) % loop.length] ?? 0;
    if ((at(a, edge.start) && at(b, edge.end)) || (at(a, edge.end) && at(b, edge.start)))
      return solidScriptMeshEdgeKey(a, b);
  }
  return null;
}

/**
 * Splits the picked edges of every mesh they belong to.
 *
 * @param run Running line.
 */
function solidScriptMeshEdgesSplitRun(run: SolidScriptBlockRun): void {
  const edges = solidScriptMeshEdgesPicked(run, 'Split Edges');
  for (const [leaf, held] of solidScriptFaceGroups(edges, (edge) => edge.faces[0].leaf)) {
    if (leaf.kind !== 'mesh') throw new Error(SOLID_SCRIPT_MESH_NEEDS_WRAP);
    const keys = new Set(held.flatMap((edge) => solidScriptMeshEdgesKey(leaf, edge) ?? []));
    run.leafReplace(leaf, solidScriptMeshEdgesSplit(leaf, keys));
  }
}

/** Split Edges. */
export const SOLID_SCRIPT_COMMANDS_MESH_EDGES: readonly SolidScriptCommand[] = [
  new SolidScriptCommand({
    id: 'split_edges',
    edits: true,
    label: 'Split Edges',
    category: 'Meshes',
    description: 'Cut mesh faces apart along edges',
    manual:
      'Cuts a mesh apart along edges, so the faces on either side no longer share corners there. Nothing moves, but later lines can pull the sides apart, and the editor shades a split edge hard. Corners are copied only where faces around them are cut off from each other. Of gives edges, or the edges of faces or meshes; empty uses [$Selected.Edges], else the edges of [$Selected.Faces], else every edge of [$Selected.Objects]. Where is a 🔁 condition an edge must pass. A solid stops the line: wrap it in Mesh From Solids first. Example: Mesh From Solids around a Sphere, then Split Edges Where [=[$Edge.Angle] > 30], keeps sharp creases apart.',
    stops: ['No edges.', 'A solid. Wrap it in Mesh From Solids first.'],
    parameters: [
      solidScriptParameterOfWhere('Edge', '[=[$Edge.Angle] > 30]'),
      solidScriptParameterOf('edges, faces or meshes', '$Selected.Edges', ['Edge', 'Face', 'Object']),
    ],
    listing: (read) => ['Split Edges', ...solidScriptListingOf(read)],
    execute: (run) => {
      solidScriptMeshEdgesSplitRun(run);
      return [];
    },
  }),
];
