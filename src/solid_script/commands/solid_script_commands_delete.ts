import { solidScriptListingOf } from './solid_script_command_listing.js';
import { SolidScriptCommand } from './solid_script_command.js';
import { solidScriptParameterOf } from './solid_script_command_parameters.js';
import { solidScriptParameterOfWhere } from './solid_script_command_of_where.js';
import { solidScriptElementOf } from './solid_script_element_of.js';
import { solidScriptFaceGroups, solidScriptFaceTargets } from './solid_script_face_of.js';
import { solidScriptConditionHolds } from '@/solid_script/language/solid_script_condition.js';
import {
  solidScriptGeometryFaces,
  solidScriptGeometryFacesDelete,
  type SolidScriptFaceFacts,
  type SolidScriptGeometryLeaf,
} from '@/solid_script/language/solid_script_geometry.js';
import { solidScriptKindNamed } from '@/solid_script/language/solid_script_kinds.js';
import type { SolidScriptBlockRun } from '@/solid_script/language/solid_script_machine_types.js';
import { SOLID_SCRIPT_MESH_NEEDS_WRAP } from '@/solid_script/language/solid_script_mesh.js';
import { solidScriptOfWhere } from '@/solid_script/language/solid_script_of_where.js';
import { solidScriptShapeGone } from '@/solid_script/language/solid_script_shape_gone.js';
import { SolidScriptElement, type SolidScriptValue } from '@/solid_script/language/solid_script_value.js';

/** Corners closer than this, in metres, are the same corner. */
const SOLID_SCRIPT_DELETE_SAME = 1e-6;

/**
 * Takes faces out of the meshes they belong to; a solid stops the line.
 *
 * @param run Running line.
 * @param faces Faces to take out.
 */
function solidScriptDeleteFaces(run: SolidScriptBlockRun, faces: readonly SolidScriptFaceFacts[]): void {
  for (const [leaf, held] of solidScriptFaceGroups(faces, (face) => face.leaf)) {
    if (leaf.kind !== 'mesh') throw new Error(SOLID_SCRIPT_MESH_NEEDS_WRAP);
    run.leafReplace(leaf, solidScriptGeometryFacesDelete(leaf, new Set(held.map((face) => face.index))));
  }
}

/**
 * Takes whole solids and meshes out, and out of [$Selected.Objects].
 *
 * @param run Running line.
 */
function solidScriptDeleteObjects(run: SolidScriptBlockRun): void {
  const items = solidScriptOfWhere(run, solidScriptElementOf(run, 'objects', 'Delete Objects'));
  const gone = new Set<SolidScriptValue>();
  for (const item of items) {
    if (!(item instanceof SolidScriptElement) || item.kind !== 'brush')
      throw new Error(`Delete Objects takes objects, not ${solidScriptKindNamed(item)}`);
    const leaf = run.elements.leaf(item);
    run.leafReplace(leaf, solidScriptShapeGone(leaf.label));
    gone.add(item);
  }
  run.selectedSet(
    'objects',
    run.selectedGet('objects').filter((value) => !gone.has(value)),
  );
}

/**
 * Takes out the faces that use the edges of Of that pass Where.
 *
 * @param run Running line.
 */
function solidScriptDeleteEdges(run: SolidScriptBlockRun): void {
  const edges = solidScriptElementOf(run, 'edges', 'Delete Edges').flatMap((item) => run.elements.edges(item));
  const faces = edges
    .filter((edge, index) =>
      solidScriptConditionHolds(run, 'where', { $Edge: run.elements.edge(edge), $Index: index, $Count: edges.length }),
    )
    .flatMap((edge) => edge.faces.filter((face): face is SolidScriptFaceFacts => face !== null));
  solidScriptDeleteFaces(run, faces);
}

/**
 * Takes out the faces that use the corners of Of that pass Where.
 *
 * @param run Running line.
 */
function solidScriptDeleteVertices(run: SolidScriptBlockRun): void {
  const corners = solidScriptElementOf(run, 'vertices', 'Delete Vertices').flatMap((item) => {
    const leaf = run.elements.leaf(item);
    return run.elements.vertices(item).map((vertex) => ({ leaf, vertex }));
  });
  const kept = corners.filter(({ leaf, vertex }, index) =>
    solidScriptConditionHolds(run, 'where', {
      $Vertex: run.elements.vertex(leaf, vertex),
      $Index: index,
      $Count: corners.length,
    }),
  );
  const leaves = [...new Set<SolidScriptGeometryLeaf>(kept.map(({ leaf }) => leaf))];
  const faces = solidScriptGeometryFaces(leaves).filter((face) =>
    kept.some(
      ({ leaf, vertex }) =>
        leaf === face.leaf &&
        face.corners.some((corner) => corner.distanceTo(vertex.position) < SOLID_SCRIPT_DELETE_SAME),
    ),
  );
  solidScriptDeleteFaces(run, faces);
}

/** Delete Objects, Delete Faces, Delete Edges and Delete Vertices. */
export const SOLID_SCRIPT_COMMANDS_DELETE: readonly SolidScriptCommand[] = [
  new SolidScriptCommand({
    id: 'delete_objects',
    label: 'Delete Objects',
    category: 'Faces',
    description: 'Take whole objects out',
    manual:
      'Takes solids and meshes out of the result, and out of [$Selected.Objects]. Of gives the objects; empty uses [$Selected.Objects]. Where, when given, is a 🔁 condition an object must pass to be taken out. A list that still holds a deleted object reads it with no faces. Example: Select Objects, then Delete Objects Where [=[$Object.Center.Y] < 0] takes out everything below the floor.',
    stops: ['No objects: an empty Of with nothing in [$Selected.Objects].'],
    parameters: [
      solidScriptParameterOfWhere('Object', '[=[$Object.Center.Y] < 0]'),
      solidScriptParameterOf('objects', '$Selected.Objects', ['Object']),
    ],
    listing: (read) => ['Delete Objects', ...solidScriptListingOf(read)],
    execute: (run) => {
      solidScriptDeleteObjects(run);
      return [];
    },
  }),
  new SolidScriptCommand({
    id: 'delete_faces',
    edits: true,
    label: 'Delete Faces',
    category: 'Faces',
    description: 'Take faces out',
    manual:
      'Takes faces out of a mesh, leaving an opening. Of gives the faces, or a mesh for all its faces; empty uses [$Selected.Faces]. Where, when given, is a 🔁 condition a face must pass to be taken out. A solid stops the line: wrap it in Mesh From Solids first. The faces leave every list that held them, and a mesh with no faces left is taken out. Example: Mesh From Solids around a Cube, Select Faces Facing Up, Delete Faces leaves an open box.',
    stops: ['No faces.', 'A solid. Wrap it in Mesh From Solids first.'],
    parameters: [
      solidScriptParameterOfWhere('Face', '[=[$NY] > 0.5]'),
      solidScriptParameterOf('faces or meshes', '$Selected.Faces'),
    ],
    listing: (read) => ['Delete Faces', ...solidScriptListingOf(read)],
    execute: (run) => {
      solidScriptDeleteFaces(run, solidScriptFaceTargets(run, 'Delete Faces'));
      return [];
    },
  }),
  new SolidScriptCommand({
    id: 'delete_edges',
    edits: true,
    label: 'Delete Edges',
    category: 'Faces',
    description: 'Take out the faces along edges',
    manual:
      'Takes out of a mesh every face that uses an edge in Of, leaving an opening along it. Of gives edges, or the edges of faces or meshes; empty uses [$Selected.Edges], or the edges of [$Selected.Faces] when no edges are picked. Where, when given, is a 🔁 condition an edge must pass. A solid stops the line: wrap it in Mesh From Solids first. Example: Mesh From Solids around a Cube, Select Edges Where [=[$Edge.Center.Y] > 0.4], then Delete Edges takes out the top and the four side faces that meet it.',
    stops: ['No edges.', 'A solid. Wrap it in Mesh From Solids first.'],
    parameters: [
      solidScriptParameterOfWhere('Edge', '[=[$Edge.Angle] > 30]'),
      solidScriptParameterOf('edges, faces or meshes', '$Selected.Edges', ['Edge', 'Face', 'Object']),
    ],
    listing: (read) => ['Delete Edges', ...solidScriptListingOf(read)],
    execute: (run) => {
      solidScriptDeleteEdges(run);
      return [];
    },
  }),
  new SolidScriptCommand({
    id: 'delete_vertices',
    edits: true,
    label: 'Delete Vertices',
    category: 'Faces',
    description: 'Take out the faces around corners',
    manual:
      'Takes out of a mesh every face that uses a corner in Of, leaving a hole around it. Of gives vertices, or the corners of faces, edges or meshes; empty uses [$Selected.Vertices], or the corners of [$Selected.Faces] when no vertices are picked. Where, when given, is a 🔁 condition a corner must pass. A solid stops the line: wrap it in Mesh From Solids first. Example: Mesh From Solids around a Cube, then Delete Vertices Of [$Selected.Objects] Where [=[$Y] > 0] and [=[$X] > 0] takes out the three faces around one top corner.',
    stops: ['No corners.', 'A solid. Wrap it in Mesh From Solids first.'],
    parameters: [
      solidScriptParameterOfWhere('Vertex', '[=[$Y] > 0]'),
      solidScriptParameterOf('vertices, faces, edges or meshes', '$Selected.Vertices', [
        'Vertex',
        'Face',
        'Edge',
        'Object',
      ]),
    ],
    listing: (read) => ['Delete Vertices', ...solidScriptListingOf(read)],
    execute: (run) => {
      solidScriptDeleteVertices(run);
      return [];
    },
  }),
];
