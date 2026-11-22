import { SolidScriptCommand } from './solid_script_command.js';
import { solidScriptListingOf } from './solid_script_command_listing.js';
import { solidScriptParameterOfWhere } from './solid_script_command_of_where.js';
import {
  solidScriptParameter,
  solidScriptParameterOf,
  solidScriptParameterOptional,
} from './solid_script_command_parameters.js';
import * as THREE from 'three';
import { solidScriptGeometryFaces } from '@/solid_script/language/solid_script_geometry.js';
import { solidScriptMeshExtrudeEdges } from '@/solid_script/language/solid_script_mesh_extrude.js';
import {
  solidScriptValueNumber,
  solidScriptValueNumbers,
  type SolidScriptValue,
} from '@/solid_script/language/solid_script_value.js';
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
export function solidScriptMeshEdgesPicked(run: SolidScriptBlockRun, label: string): SolidScriptEdgeFacts[] {
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
export function solidScriptMeshEdgesKey(mesh: SolidScriptShapeMesh, edge: SolidScriptEdgeFacts): string | null {
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

/**
 * Puts an edge's two corners in the order of the face that holds it.
 *
 * @param mesh Mesh.
 * @param edge Edge.
 * @param key Its point pair key.
 * @returns Corners in face order.
 */
function solidScriptMeshEdgesOrdered(
  mesh: SolidScriptShapeMesh,
  edge: SolidScriptEdgeFacts,
  key: string,
): [number, number] {
  const [a = 0, b = 0] = key.split(':').map(Number);
  const loop = mesh.faces[edge.faces[0].index] ?? [];
  const at = loop.indexOf(a);
  return loop[(at + 1) % loop.length] === b ? [a, b] : [b, a];
}

/**
 * Pulls the picked edges of every mesh they belong to out into new faces and
 * picks those faces.
 *
 * @param run Running line.
 */
function solidScriptMeshEdgesExtrudeRun(run: SolidScriptBlockRun): void {
  const distance = solidScriptValueNumber(run.value('distance'));
  if (distance === undefined) throw new Error('Extrude Edges needs a number of metres in Distance, such as 1');
  const way = run.source('direction').trim() === '' ? null : solidScriptValueNumbers(run.value('direction'));
  const direction = way ? new THREE.Vector3(way[0] ?? 0, way[1] ?? 0, way[2] ?? 0).normalize() : null;
  const made: SolidScriptValue[] = [];
  for (const [leaf, held] of solidScriptFaceGroups(
    solidScriptMeshEdgesPicked(run, 'Extrude Edges'),
    (edge) => edge.faces[0].leaf,
  )) {
    if (leaf.kind !== 'mesh') throw new Error(SOLID_SCRIPT_MESH_NEEDS_WRAP);
    const keyed = new Map(
      held.flatMap((edge) => [solidScriptMeshEdgesKey(leaf, edge) ?? []].flat().map((key) => [key, edge] as const)),
    );
    const pairs = [...keyed].map(([key, edge]) => solidScriptMeshEdgesOrdered(leaf, edge, key));
    const result = solidScriptMeshExtrudeEdges(leaf, pairs, distance, direction);
    run.leafReplace(leaf, result.mesh);
    const read = solidScriptGeometryFaces([run.leafLatest(leaf)]);
    made.push(...result.sides.flatMap((number) => (read[number] ? [run.elements.face(read[number])] : [])));
  }
  run.selectedSet('faces', made);
}

/** Split Edges and Extrude Edges. */
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
  new SolidScriptCommand({
    id: 'extrude_edges',
    edits: true,
    label: 'Extrude Edges',
    category: 'Meshes',
    description: 'Pull mesh edges out into new faces',
    manual:
      'Pulls edges of a mesh out into new four-sided faces, from each edge to a moved copy of it, and picks those faces in [$Selected.Faces]. Edges that share a corner share its moved copy, so a chain of edges becomes one strip, such as a rim or a fence along a border. Distance is how far, in metres; a negative one goes the other way. Direction is the way to move; left off, each corner moves the way the faces around it face. Of gives edges, or the edges of faces or meshes; empty uses [$Selected.Edges], else the edges of [$Selected.Faces], else every edge of [$Selected.Objects]. Where is a 🔁 condition an edge must pass. A solid stops the line: wrap it in Mesh From Solids first. Example: Grid Mesh, then Extrude Edges Where [$Edge.IsBoundary] Distance 0.5 Direction 0, 1, 0 raises a low wall round it.',
    stops: ['No edges.', 'A solid. Wrap it in Mesh From Solids first.', 'A Distance that is not a number.'],
    parameters: [
      solidScriptParameter('distance', 'Distance', 'number', '1', 'Metres to pull the edges out, such as 0.5.'),
      solidScriptParameterOptional(
        'direction',
        'Direction',
        'vector3',
        'Way to move, such as 0, 1, 0. Left off, each corner moves the way the faces around it face.',
      ),
      solidScriptParameterOfWhere('Edge', '[=[$Edge.Angle] > 30]'),
      solidScriptParameterOf('edges, faces or meshes', '$Selected.Edges', ['Edge', 'Face', 'Object']),
    ],
    listing: (read) => [
      'Extrude Edges',
      ' Distance ',
      read.value('distance'),
      ...(read.text('direction') === '' ? [] : [' Direction ', read.value('direction')]),
      ...solidScriptListingOf(read),
    ],
    execute: (run) => {
      solidScriptMeshEdgesExtrudeRun(run);
      return [];
    },
  }),
];
