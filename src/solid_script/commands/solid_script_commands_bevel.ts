import { solidScriptListingOf } from './solid_script_command_listing.js';
import { SolidScriptCommand } from './solid_script_command.js';
import { solidScriptParameterEach } from './solid_script_command_each.js';
import {
  solidScriptParameter,
  solidScriptParameterInto,
  solidScriptParameterOf,
} from './solid_script_command_parameters.js';
import { solidScriptParameterOfWhere } from './solid_script_command_of_where.js';
import { SOLID_SCRIPT_FACE_DISTANCE_NEEDS } from './solid_script_commands_faces.js';
import { solidScriptFaceGroups, solidScriptFaceWrite } from './solid_script_face_of.js';
import { solidScriptConditionHolds } from '@/solid_script/language/solid_script_condition.js';
import { solidScriptEachRead } from '@/solid_script/language/solid_script_each_read.js';
import {
  solidScriptGeometryBevel,
  solidScriptGeometryFaces,
  type SolidScriptEdgeFacts,
  type SolidScriptGeometryLeaf,
  type SolidScriptVertexFacts,
} from '@/solid_script/language/solid_script_geometry.js';
import { solidScriptKindNamed } from '@/solid_script/language/solid_script_kinds.js';
import type { SolidScriptBlockRun } from '@/solid_script/language/solid_script_machine_types.js';
import {
  SOLID_SCRIPT_MESH_NEEDS_WRAP,
  solidScriptMeshLoopCenter,
  solidScriptMeshLoopNormal,
} from '@/solid_script/language/solid_script_mesh.js';
import {
  solidScriptMeshBevel,
  type SolidScriptMeshBevelPick,
} from '@/solid_script/language/solid_script_mesh_bevel.js';
import { solidScriptOfEmpty } from '@/solid_script/language/solid_script_select.js';
import type { SolidScriptFaceTag } from '@/solid_script/language/solid_script_shape.js';
import {
  SolidScriptElement,
  solidScriptValueNumber,
  type SolidScriptValue,
} from '@/solid_script/language/solid_script_value.js';

/**
 * The tag a bevel gives the faces it cuts, so Bevel Edges never cuts them
 * again.
 */
const SOLID_SCRIPT_BEVEL_TAG = 'Bevel';

/** A face a bevel made, as a tag pinned to where it is. */
type SolidScriptBevelMade = SolidScriptFaceTag;

/**
 * Reads the geometry values a bevel line works on: its Of, else the selection
 * of its kind, else [$Selected.Faces].
 *
 * @param run Running line.
 * @param kind Selection an empty Of uses.
 * @param label Command, for messages.
 * @returns Solids, meshes, faces, edges or corners.
 */
function solidScriptBevelItems(
  run: SolidScriptBlockRun,
  kind: 'edges' | 'vertices',
  label: string,
): SolidScriptElement[] {
  const given = run.ofValues();
  const picked = run.selectedGet(kind);
  const values = given ?? (picked.length > 0 ? picked : run.selectedGet('faces'));
  if (values.length === 0)
    throw new Error(
      given ? `${label} has nothing in Of; check that Of holds ${kind}` : solidScriptOfEmpty(label, kind),
    );
  return values.map((value) => {
    if (!(value instanceof SolidScriptElement) || value.kind === 'point' || value.kind === 'data')
      throw new Error(`${label} takes ${kind}, faces or objects, not ${solidScriptKindNamed(value)}`);
    return value;
  });
}

/**
 * Reads the edges Bevel Edges works on, each once, that pass its Where.
 *
 * @param run Running line.
 * @returns Edges read from the latest geometry, with what Where read for them.
 */
function solidScriptBevelEdges(run: SolidScriptBlockRun): SolidScriptEdgeFacts[] {
  const edges: SolidScriptEdgeFacts[] = [];
  for (const item of solidScriptBevelItems(run, 'edges', 'Bevel Edges'))
    for (const edge of run.elements.edges(item))
      if (!edges.some((known) => known.faces[0].leaf === edge.faces[0].leaf && known.index === edge.index))
        edges.push(edge);
  return edges.filter((edge, index) =>
    solidScriptConditionHolds(run, 'where', { $Edge: run.elements.edge(edge), $Index: index, $Count: edges.length }),
  );
}

/**
 * Reads the Distance of a bevel line per item, stopping on one that is not a
 * number above 0.
 *
 * @param run Running line.
 * @param count How many items there are.
 * @param fills What the field reads for an item.
 * @returns Distance by item number.
 */
function solidScriptBevelDistances(
  run: SolidScriptBlockRun,
  count: number,
  fills: (index: number) => Readonly<Record<string, SolidScriptValue>>,
): (index: number) => number {
  const read = solidScriptEachRead(run, 'distance', count, fills);
  return (index) => {
    const distance = solidScriptValueNumber(read(index));
    if (distance === undefined) throw new Error(SOLID_SCRIPT_FACE_DISTANCE_NEEDS);
    if (distance <= 0) throw new Error('Bevel needs a Distance above 0');
    return distance;
  };
}

/**
 * Stores a bevelled object and gives the faces it made, tagged Bevel.
 *
 * @param run Running line.
 * @param leaf Object before.
 * @param bevelled Object after, without the new tags.
 * @param made Where the new faces are.
 * @returns The new faces.
 */
function solidScriptBevelStore(
  run: SolidScriptBlockRun,
  leaf: SolidScriptGeometryLeaf,
  bevelled: SolidScriptGeometryLeaf,
  made: readonly SolidScriptBevelMade[],
): SolidScriptValue[] {
  run.leafReplace(leaf, { ...bevelled, faceTags: [...(leaf.faceTags ?? []), ...made] } as SolidScriptGeometryLeaf);
  return solidScriptGeometryFaces([run.leafLatest(leaf)])
    .filter(
      (face) =>
        face.tags.includes(SOLID_SCRIPT_BEVEL_TAG) &&
        made.some((cut) => cut.point.distanceTo(face.center) < 1e-6 && cut.normal.dot(face.normal) > 0.9999),
    )
    .map((face) => run.elements.face(face));
}

/**
 * Bevels edges of one solid with planes.
 *
 * @param run Running line.
 * @param leaf Solid.
 * @param edges Its edges.
 * @param distanceOf Distance per edge.
 * @returns The new faces.
 */
function solidScriptBevelSolid(
  run: SolidScriptBlockRun,
  leaf: SolidScriptGeometryLeaf & { kind: 'solid' },
  edges: readonly SolidScriptEdgeFacts[],
  distanceOf: (edge: SolidScriptEdgeFacts) => number,
): SolidScriptValue[] {
  const { body, cuts } = solidScriptGeometryBevel(leaf, edges, distanceOf);
  const bevelled = { ...leaf, ...body };
  const made = solidScriptGeometryFaces([bevelled])
    .filter((face) =>
      cuts.some(
        (cut) =>
          cut.normal.dot(face.normal) > 0.9999 && Math.abs(face.center.clone().sub(cut.point).dot(cut.normal)) < 1e-5,
      ),
    )
    .map((face) => ({ point: face.center.clone(), normal: face.normal.clone(), tag: SOLID_SCRIPT_BEVEL_TAG }));
  return solidScriptBevelStore(run, leaf, bevelled, made);
}

/**
 * Bevels edges or corners of one mesh.
 *
 * @param run Running line.
 * @param leaf Mesh.
 * @param picks Edges or corners with their distances.
 * @returns The new faces.
 */
function solidScriptBevelMesh(
  run: SolidScriptBlockRun,
  leaf: SolidScriptGeometryLeaf & { kind: 'mesh' },
  picks: readonly SolidScriptMeshBevelPick[],
): SolidScriptValue[] {
  const { mesh, made } = solidScriptMeshBevel(leaf, picks);
  const tags = made.map((face) => {
    const loop = mesh.faces[face] ?? [];
    return {
      point: solidScriptMeshLoopCenter(mesh.points, loop),
      normal: solidScriptMeshLoopNormal(mesh.points, loop),
      tag: SOLID_SCRIPT_BEVEL_TAG,
    };
  });
  return solidScriptBevelStore(run, leaf, mesh, tags);
}

/**
 * Picks the faces a bevel made and names them in Into.
 *
 * @param run Running line.
 * @param made New faces.
 * @returns Nothing new in the result.
 */
function solidScriptBevelMade(run: SolidScriptBlockRun, made: SolidScriptValue[]): [] {
  run.selectedSet('faces', made);
  solidScriptFaceWrite(run, 'into', made);
  return [];
}

/**
 * Bevels the edges of Bevel Edges, skipping those of faces a bevel made.
 *
 * @param run Running line.
 * @returns Nothing new in the result.
 */
function solidScriptBevelEdgesRun(run: SolidScriptBlockRun): [] {
  const all = solidScriptBevelEdges(run);
  const order = new Map(all.map((edge, index) => [edge, index]));
  const read = solidScriptBevelDistances(run, all.length, (index) => {
    const edge = all[index];
    return { ...(edge ? { $Edge: run.elements.edge(edge) } : {}), $Index: index, $Count: all.length };
  });
  const distanceOf = (edge: SolidScriptEdgeFacts): number => read(order.get(edge) ?? -1);
  const made: SolidScriptValue[] = [];
  for (const [leaf, held] of solidScriptFaceGroups(all, (edge) => edge.faces[0].leaf)) {
    const edges = held.filter((edge) => !edge.faces.some((face) => face?.tags.includes(SOLID_SCRIPT_BEVEL_TAG)));
    if (edges.length === 0) continue;
    if (leaf.kind === 'solid') made.push(...solidScriptBevelSolid(run, leaf, edges, distanceOf));
    else {
      const picks = edges.map((edge) => ({ at: [edge.start, edge.end], distance: distanceOf(edge) }));
      made.push(...solidScriptBevelMesh(run, leaf, picks));
    }
  }
  return solidScriptBevelMade(run, made);
}

/**
 * Reads the corners Bevel Vertices works on, each once, that pass its Where.
 *
 * @param run Running line.
 * @returns Corners with the object they belong to.
 */
function solidScriptBevelCorners(
  run: SolidScriptBlockRun,
): { leaf: SolidScriptGeometryLeaf; vertex: SolidScriptVertexFacts }[] {
  const corners = solidScriptBevelItems(run, 'vertices', 'Bevel Vertices').flatMap((item) => {
    const leaf = run.elements.leaf(item);
    return run.elements.vertices(item).map((vertex) => ({ leaf, vertex }));
  });
  const once = corners.filter(
    ({ leaf, vertex }, index) =>
      corners.findIndex((other) => other.leaf === leaf && other.vertex.position.distanceTo(vertex.position) < 1e-6) ===
      index,
  );
  return once.filter(({ leaf, vertex }, index) =>
    solidScriptConditionHolds(run, 'where', {
      $Vertex: run.elements.vertex(leaf, vertex),
      $Index: index,
      $Count: once.length,
    }),
  );
}

/**
 * Cuts the corners of Bevel Vertices off.
 *
 * @param run Running line.
 * @returns Nothing new in the result.
 */
function solidScriptBevelVerticesRun(run: SolidScriptBlockRun): [] {
  const corners = solidScriptBevelCorners(run);
  const read = solidScriptBevelDistances(run, corners.length, (index) => {
    const corner = corners[index];
    const fill = corner ? { $Vertex: run.elements.vertex(corner.leaf, corner.vertex) } : {};
    return { ...fill, $Index: index, $Count: corners.length };
  });
  const made: SolidScriptValue[] = [];
  const picks = corners.map((corner, index) => ({ ...corner, distance: read(index) }));
  for (const [leaf, held] of solidScriptFaceGroups(picks, (pick) => pick.leaf)) {
    if (leaf.kind !== 'mesh') throw new Error(SOLID_SCRIPT_MESH_NEEDS_WRAP);
    made.push(
      ...solidScriptBevelMesh(
        run,
        leaf,
        held.map((pick) => ({ at: [pick.vertex.position], distance: pick.distance })),
      ),
    );
  }
  return solidScriptBevelMade(run, made);
}

/** Bevel Edges and Bevel Vertices: cut edges and corners off flat. */
export const SOLID_SCRIPT_COMMANDS_BEVEL: readonly SolidScriptCommand[] = [
  new SolidScriptCommand({
    id: 'bevel_edges',
    edits: true,
    label: 'Bevel Edges',
    category: 'Faces',
    description: 'Cut edges off flat',
    manual:
      'Cuts edges off flat. Of gives edges, faces (their edges) or objects (all their edges); empty uses [$Selected.Edges], else the edges of [$Selected.Faces]. The 🔁 Where keeps the edges it holds for, and Distance may change per edge, such as [=[$Edge.Length] * 0.1]. On a solid each edge is cut Distance back along each face. On a mesh each edge becomes a strip whose sides lie Distance along the edges that meet it, and a corner where several bevelled edges meet gets a face of its own; a corner where edges of different Distance meet uses the largest, and corners at the same place are joined first. Edges of faces a bevel made are skipped, so bevelling face by face ends the same as bevelling all at once. Into names a variable for the new faces, and [$Selected.Faces] holds them afterwards. Example: Cube, Select Faces All, Bevel Edges by 0.1.',
    stops: [
      'No edges.',
      'A Distance of 0 or less, or one too long for the edges of a mesh.',
      'An edge of a mesh with a face on one side only.',
    ],
    parameters: [
      solidScriptParameterEach(
        solidScriptParameter(
          'distance',
          'Distance',
          'number',
          '0.1',
          'Metres to cut back along each side, such as 0.1.',
        ),
        'Edge',
      ),
      solidScriptParameterOfWhere('Edge', '[=[$Edge.Length] > 0.5]'),
      solidScriptParameterOf('edges, faces or objects', '$Selected.Edges', ['Object', 'Face', 'Edge']),
      solidScriptParameterInto('the new faces, a Face list', 'Face List', 'what is made', 'label'),
    ],
    listing: (read) => [
      'Bevel Edges',
      'By ',
      read.value('distance'),
      ...solidScriptListingOf(read),
      ...(read.text('into') === '' ? [] : [' Into ', read.value('into')]),
    ],
    execute: (run) => solidScriptBevelEdgesRun(run),
  }),
  new SolidScriptCommand({
    id: 'bevel_vertices',
    edits: true,
    label: 'Bevel Vertices',
    category: 'Faces',
    description: 'Cut corners of a mesh off flat',
    manual:
      'Cuts corners of a mesh off: every edge that meets a corner gets a new corner Distance along it, and a new face joins them. Of gives corners, faces (their corners) or meshes (all their corners); empty uses [$Selected.Vertices], else the corners of [$Selected.Faces]. The 🔁 Where keeps the corners it holds for, and Distance may change per corner. Corners at the same place are joined first. Into names a variable for the new faces, and [$Selected.Faces] holds them afterwards. A solid stops, with a hint to wrap it in Mesh From Solids first. Example: Mesh From Solids around a Cube, then Select Objects and Bevel Vertices by 0.2 cuts its 8 corners off.',
    stops: ['No corners.', 'Corners of a solid.', 'A Distance of 0 or less, or one too long for the edges.'],
    parameters: [
      solidScriptParameterEach(
        solidScriptParameter(
          'distance',
          'Distance',
          'number',
          '0.1',
          'Metres along each edge to cut back, such as 0.2.',
        ),
        'Vertex',
      ),
      solidScriptParameterOfWhere('Vertex', '[=[$Vertex.Position.Y] > 0]'),
      solidScriptParameterOf('vertices, faces or meshes', '$Selected.Vertices', ['Object', 'Face', 'Vertex']),
      solidScriptParameterInto('the new faces, a Face list', 'Face List', 'what is made', 'label'),
    ],
    listing: (read) => [
      'Bevel Vertices',
      'By ',
      read.value('distance'),
      ...solidScriptListingOf(read),
      ...(read.text('into') === '' ? [] : [' Into ', read.value('into')]),
    ],
    execute: (run) => solidScriptBevelVerticesRun(run),
  }),
];
