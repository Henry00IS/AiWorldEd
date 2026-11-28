import { solidScriptMergePoints } from '@/solid_script/language/solid_script_merge_points.js';
import { solidScriptListingOf } from './solid_script_command_listing.js';
import { solidScriptConditionHolds } from '@/solid_script/language/solid_script_condition.js';
import { solidScriptEachUses } from '@/solid_script/language/solid_script_each_uses.js';
import { solidScriptParameterEach } from './solid_script_command_each.js';
import { solidScriptMeshEdgesKey } from './solid_script_commands_mesh_edges.js';
import * as THREE from 'three';
import { solidScriptMeshMerge } from '@/solid_script/language/solid_script_mesh_merge.js';
import { solidScriptKindNamed } from '@/solid_script/language/solid_script_kinds.js';
import { SolidScriptCommand } from './solid_script_command.js';
import { solidScriptListingOptions } from './solid_script_command_listing.js';
import { SOLID_SCRIPT_ANCHOR_SOLID } from '@/solid_script/language/solid_script_anchor.js';
import { solidScriptIcosphere } from '@/solid_script/language/solid_script_icosphere.js';
import {
  solidScriptParameter,
  solidScriptParameterAnchor,
  solidScriptParameterOf,
  solidScriptParameterOptional,
  solidScriptParameterWords,
} from './solid_script_command_parameters.js';
import { solidScriptParameterOfWhere } from './solid_script_command_of_where.js';
import { solidScriptMeshModeSet, solidScriptParameterMeshMode } from './solid_script_command_mesh_mode.js';
import { solidScriptOfWhere } from '@/solid_script/language/solid_script_of_where.js';
import { solidScriptShapeGone } from '@/solid_script/language/solid_script_shape_gone.js';
import type { SolidScriptBlockRun } from '@/solid_script/language/solid_script_machine_types.js';
import {
  SOLID_SCRIPT_MESH_NEEDS_WRAP,
  solidScriptMeshJoin,
  solidScriptMeshSmooth,
  solidScriptMeshSubdivide,
  solidScriptMeshSubdivideSharp,
  type SolidScriptShapeMesh,
  type SolidScriptUv,
} from '@/solid_script/language/solid_script_mesh.js';
import { solidScriptMeshFromBrushes } from '@/solid_script/language/solid_script_mesh_from_brushes.js';
import { solidScriptMeshDisplace } from '@/solid_script/language/solid_script_mesh_displace.js';
import {
  SOLID_SCRIPT_GRID_MESH_COUNT_MAX,
  SOLID_SCRIPT_GRID_MESH_COUNT_MIN,
  solidScriptGridMesh,
} from '@/solid_script/language/solid_script_grid_mesh.js';
import type { SolidScriptShape } from '@/solid_script/language/solid_script_shape.js';
import { solidScriptOfEmpty } from '@/solid_script/language/solid_script_select.js';
import {
  SolidScriptElement,
  solidScriptValueNumber,
  solidScriptValueNumbers,
  type SolidScriptValue,
} from '@/solid_script/language/solid_script_value.js';

/** What stops every mesh block without its End. */
const SOLID_SCRIPT_MESH_STOPS_END = 'A missing End line.';

/** What stops every mesh tool given a flat path. */
const SOLID_SCRIPT_MESH_STOPS_FLAT = 'A flat path such as Square between this line and its End. Extrude it first.';

/** Most rounds of Subdivide. */
const SOLID_SCRIPT_SUBDIVIDE_LEVELS_MAX = 4;

/** Most rounds of Smooth Mesh. */
const SOLID_SCRIPT_SMOOTH_ROUNDS_MAX = 100;

/**
 * Runs the lines inside a mesh tool and turns them into one mesh: meshes stay
 * as they are, and brushes are baked through the editor CSG compiler.
 *
 * @param run Running line.
 * @param label Mesh label.
 * @returns Mesh in the block's own frame, or null when nothing was built.
 */
function solidScriptMeshInside(run: SolidScriptBlockRun, label: string): SolidScriptShapeMesh | null {
  if (run.planar) throw new Error(`${label} cannot be inside a Linear Extrude; put it around the extrusion`);
  const shapes = run.local(false);
  const flat = shapes.find((shape) => shape.kind === 'polygon');
  if (flat) throw new Error(`${label} needs solids or meshes; a flat path becomes a solid inside Linear Extrude first`);
  return solidScriptMeshFromBrushes(shapes, label);
}

/**
 * Runs a mesh tool: the lines inside become one mesh, the tool changes it, and
 * the result is placed like any shape.
 *
 * @param run Running line.
 * @param label Tool label.
 * @param change What the tool does.
 * @returns The result.
 */
function solidScriptMeshTool(
  run: SolidScriptBlockRun,
  label: string,
  change: (mesh: SolidScriptShapeMesh) => SolidScriptShapeMesh,
): SolidScriptShape[] {
  const mesh = solidScriptMeshInside(run, label);
  if (!mesh) return [];
  const changed = change(mesh);
  return run.mesh(mesh.texture === undefined ? changed : { ...changed, texture: mesh.texture });
}

/**
 * Reads a number from a value a field gave.
 *
 * @param value Value.
 * @param what Field name, for the message.
 * @returns Number.
 */
function solidScriptMeshNumber(value: unknown, what: string): number {
  const number = solidScriptValueNumber(value as never);
  if (number === undefined || !Number.isFinite(number)) throw new Error(`${what} must give a number`);
  return number;
}

/**
 * Reads a whole number in a range.
 *
 * @param run Running line.
 * @param key Field key.
 * @param label Field label.
 * @param range Allowed range.
 * @returns Number.
 */
function solidScriptMeshCount(run: SolidScriptBlockRun, key: string, label: string, range: [number, number]): number {
  const value = Math.round(solidScriptMeshNumber(run.value(key), label));
  if (value < range[0] || value > range[1])
    throw new Error(`${label} must be ${range[0]} to ${range[1]}, not ${value}`);
  return value;
}

/**
 * Reads the mesh a value stands for, and stops when it is still a brush.
 *
 * @param run Running line.
 * @param value Brush or mesh element.
 * @param label Command, for messages.
 * @returns Mesh.
 */
function solidScriptMeshLeaf(run: SolidScriptBlockRun, value: SolidScriptValue, label: string): SolidScriptShapeMesh {
  if (!(value instanceof SolidScriptElement) || value.kind !== 'brush')
    throw new Error(`${label} takes a mesh, not ${solidScriptKindNamed(value)}`);
  const leaf = run.elements.leaf(value);
  if (leaf.kind !== 'mesh') throw new Error(SOLID_SCRIPT_MESH_NEEDS_WRAP);
  return leaf;
}

/**
 * Reads the meshes a line works on: those its Of gives, else
 * [$Selected.Objects].
 *
 * @param run Running line.
 * @param label Command, for messages.
 * @returns Meshes, each once.
 */
function solidScriptMeshTargets(run: SolidScriptBlockRun, label: string): SolidScriptShapeMesh[] {
  const given = run.ofValues();
  const values = given ?? run.selectedGet('objects');
  if (values.length === 0)
    throw new Error(
      given ? `${label} has no mesh in Of; check that Of holds a mesh` : solidScriptOfEmpty(label, 'objects'),
    );
  const leaves: SolidScriptShapeMesh[] = [];
  for (const value of solidScriptOfWhere(run, values)) {
    const leaf = solidScriptMeshLeaf(run, value, label);
    if (!leaves.includes(leaf)) leaves.push(leaf);
  }
  return leaves;
}

/**
 * What a joined mesh keeps of the first mesh besides its faces: its texture and
 * the pose its UVs were written in.
 *
 * @param first First mesh of the join.
 * @returns Fields to keep.
 */
function solidScriptMeshKept(first: SolidScriptShapeMesh): Partial<SolidScriptShapeMesh> {
  return {
    ...(first.texture === undefined ? {} : { texture: first.texture }),
    ...(first.uvCarry ? { uvCarry: first.uvCarry } : {}),
  };
}

/**
 * The edges of a mesh that pass Crease, with [$Edge] the edge, by point pair.
 *
 * @param run Running line.
 * @param mesh Mesh.
 * @returns Creased edges.
 */
function solidScriptMeshCreased(run: SolidScriptBlockRun, mesh: SolidScriptShapeMesh): Set<string> {
  if (run.source('crease').trim() === '') return new Set();
  const edges = run.elements.edges(run.elements.brush(mesh));
  return new Set(
    edges.flatMap((edge, index) =>
      solidScriptConditionHolds(run, 'crease', () => ({
        $Edge: run.elements.edge(edge),
        $Index: index,
        $Count: edges.length,
      }))
        ? (solidScriptMeshEdgesKey(mesh, edge) ?? [])
        : [],
    ),
  );
}

/**
 * Replaces each mesh a line works on with a changed copy.
 *
 * @param run Running line.
 * @param label Command, for messages.
 * @param change What the tool does.
 * @returns Nothing; the meshes are replaced in place.
 */
export function solidScriptMeshApply(
  run: SolidScriptBlockRun,
  label: string,
  change: (mesh: SolidScriptShapeMesh) => SolidScriptShapeMesh,
): SolidScriptShape[] {
  for (const leaf of solidScriptMeshTargets(run, label)) run.leafReplace(leaf, change(leaf));
  return [];
}

/**
 * Point or face numbers Select Vertices or Select Faces picked on one mesh, or
 * null when nothing is picked, meaning every one.
 *
 * @param run Running line.
 * @param leaf Mesh.
 * @param kind Vertices or faces.
 * @returns Numbers, or null for all.
 */
function solidScriptMeshPicked(
  run: SolidScriptBlockRun,
  leaf: SolidScriptShapeMesh,
  kind: 'vertices' | 'faces',
): Set<number> | null {
  const values = run.selectedGet(kind);
  if (values.length === 0) return null;
  const indexes = new Set<number>();
  for (const value of values) solidScriptMeshPickedAdd(run, leaf, kind, value, indexes);
  return indexes;
}

/**
 * Adds the point or face numbers of one picked element when it belongs to the
 * mesh. A picked element on a brush stops the line.
 *
 * @param run Running line.
 * @param leaf Mesh.
 * @param kind Vertices or faces.
 * @param value Picked element.
 * @param indexes Numbers already found.
 */
function solidScriptMeshPickedAdd(
  run: SolidScriptBlockRun,
  leaf: SolidScriptShapeMesh,
  kind: 'vertices' | 'faces',
  value: SolidScriptValue,
  indexes: Set<number>,
): void {
  if (!(value instanceof SolidScriptElement)) return;
  const latest = run.elements.leaf(value);
  if (latest.kind !== 'mesh') throw new Error(SOLID_SCRIPT_MESH_NEEDS_WRAP);
  if (latest !== leaf) return;
  if (kind === 'vertices') for (const vertex of run.elements.vertices(value)) indexes.add(vertex.index);
  else for (const face of run.elements.faces(value)) indexes.add(face.index);
}

/**
 * Displaces the selected vertices of a mesh, or every point when none are
 * picked, using the Distance formula and its $ fills.
 *
 * @param run Running line.
 * @param mesh Mesh.
 * @returns Displaced mesh.
 */
function solidScriptMeshDisplaceRun(run: SolidScriptBlockRun, mesh: SolidScriptShapeMesh): SolidScriptShapeMesh {
  const picked = solidScriptMeshPicked(run, mesh, 'vertices');
  const vertexUsed = solidScriptEachUses(run.source('distance')).has('$vertex');
  const count = mesh.points.length;
  return solidScriptMeshDisplace(mesh, (point, normal, index) => {
    if (picked && !picked.has(index)) return 0;
    const vertex = vertexUsed ? { $Vertex: run.elements.vertex(mesh, { index, position: point, normal }) } : {};
    return solidScriptMeshNumber(
      run.valueWith('distance', {
        ...vertex,
        $X: point.x,
        $Y: point.y,
        $Z: point.z,
        $NX: normal.x,
        $NY: normal.y,
        $NZ: normal.z,
        $Index: index,
        $Count: count,
      }),
      'Distance',
    );
  });
}

/**
 * Welds the corners of a mesh for Merge By Distance: Mode All welds any near
 * corners, Connected only the ends of short edges; a corner must pass Weld
 * Where to be welded.
 *
 * @param run Running line.
 * @param mesh Mesh.
 * @param distance Largest gap that is welded.
 * @returns Welded mesh.
 */
function solidScriptMeshMergeRun(
  run: SolidScriptBlockRun,
  mesh: SolidScriptShapeMesh,
  distance: number,
): SolidScriptShapeMesh {
  const mode = run.text('merging').trim().toLowerCase();
  if (mode !== 'all' && mode !== 'connected')
    throw new Error(`Mode needs All or Connected, not ${run.text('merging')}`);
  const count = mesh.points.length;
  const welds = (index: number): boolean => {
    if (run.source('weld').trim() === '') return true;
    const position = mesh.points[index] ?? new THREE.Vector3();
    const $Vertex = run.elements.vertex(mesh, { index, position, normal: new THREE.Vector3() });
    return solidScriptConditionHolds(run, 'weld', { $Vertex, $Index: index, $Count: count });
  };
  return solidScriptMeshMerge(mesh, distance, { connected: mode === 'connected', welds });
}

/** Commands that build and change meshes, which become regular mesh objects. */
export const SOLID_SCRIPT_COMMANDS_MESHES: readonly SolidScriptCommand[] = [
  new SolidScriptCommand({
    id: 'grid_mesh',
    label: 'Grid Mesh',
    category: 'Meshes',
    description: 'Build a flat grid of faces',
    manual:
      'Builds a mesh of quads in a plane, for a floor, a wall or a terrain to Displace. Size is width (X), height (Y) and depth (Z) in metres; set one of them to 0 so the grid lies in that plane, such as 2, 0, 2 for a grid on the ground, or 2, 2, 0 for a wall facing the front. Columns is how many faces across, Rows how many the other way. Anchor picks the spot of the box that sits on the origin, the same as on a Cube. Texture coordinates run from 0 to 1 across the grid. Example: Grid Mesh Size 8, 0, 8 Columns 16 Rows 16, then Displace with a Noise formula, gives a hilly floor.',
    stops: [
      'A Size with a negative length, or that is not one, two or three numbers separated by commas.',
      'A Size that is not flat: set Width, Height or Depth to 0, such as 2, 0, 2.',
      `Columns or Rows outside ${SOLID_SCRIPT_GRID_MESH_COUNT_MIN} to ${SOLID_SCRIPT_GRID_MESH_COUNT_MAX}, or a count with decimals.`,
    ],
    parameters: [
      solidScriptParameter(
        'size',
        'Size',
        'vector3',
        '2, 0, 2',
        'Width (X), height (Y) and depth (Z) in metres, such as 4, 0, 4 for a flat floor. Set one length to 0 so the grid is flat.',
      ),
      solidScriptParameter(
        'columns',
        'Columns',
        'count',
        '4',
        `Faces across, ${SOLID_SCRIPT_GRID_MESH_COUNT_MIN} to ${SOLID_SCRIPT_GRID_MESH_COUNT_MAX}, such as 8.`,
      ),
      solidScriptParameter(
        'rows',
        'Rows',
        'count',
        '4',
        `Faces the other way, ${SOLID_SCRIPT_GRID_MESH_COUNT_MIN} to ${SOLID_SCRIPT_GRID_MESH_COUNT_MAX}, such as 8.`,
      ),
      solidScriptParameterAnchor(SOLID_SCRIPT_ANCHOR_SOLID),
    ],
    listing: (read) => [
      'Grid Mesh',
      read.value('size'),
      ...solidScriptListingOptions([
        read.changed('columns') && ['Columns ', read.value('columns')],
        read.changed('rows') && ['Rows ', read.value('rows')],
        read.changed('anchor') && ['Anchor ', read.value('anchor')],
      ]),
    ],
    execute: (run) => run.mesh(solidScriptGridMesh(run.fields())),
  }),
  new SolidScriptCommand({
    id: 'icosphere_mesh',
    label: 'Icosphere Mesh',
    category: 'Meshes',
    description: 'Build a sphere of even triangles',
    manual:
      'Builds a mesh sphere centred on the origin from an icosahedron, with a corner at the top and the bottom. Radius is the distance in metres from the center to every corner. Subdivisions 1 is the icosahedron of 20 triangles; each step more splits every triangle into four, pushing the new corners out to the sphere, so 2 gives 80 and 3 gives 320. Unlike a UV sphere every triangle is about the same size, which suits Displace and Scatter. For a solid ball use the Icosphere generator. Example: Icosphere Mesh Radius 2 Subdivisions 3, then Displace with a Noise formula, gives a rock.',
    stops: ['A Radius of 0 or less.', 'Subdivisions outside 1 to 7, or with decimals.'],
    parameters: [
      solidScriptParameter('radius', 'Radius', 'number', '1', 'Metres from the center to every corner, such as 1.'),
      solidScriptParameter(
        'subdivisions',
        'Subdivisions',
        'count',
        '1',
        'Times the triangles are split, 1 to 7, such as 2.',
      ),
    ],
    listing: (read) => [
      'Icosphere Mesh',
      ...solidScriptListingOptions([
        read.changed('radius') && ['Radius ', read.value('radius')],
        read.changed('subdivisions') && ['Subdivisions ', read.value('subdivisions')],
      ]),
    ],
    execute: (run) => run.mesh(solidScriptIcosphere(run.fields())),
  }),
  new SolidScriptCommand({
    id: 'mesh',
    builtKind: 'Mesh',
    named: true,
    label: 'Mesh',
    category: 'Meshes',
    description: 'Build a mesh from Vertex and Face lines',
    manual:
      'Builds a mesh, a regular model made of faces instead of solids, from the Vertex and Face lines between this line and its End. Each Vertex adds a corner point. They are numbered from 0 in order. Each Face joins corner numbers, listed counter-clockwise as seen from outside. Unlike solids, a mesh may be open, dented or any solid at all. It does not cut solids or get cut by them, but Mode Subtractive cuts a closed mesh out of the meshes before it on its level and Intersecting keeps only their overlap, like solids. The lines inside may use Repeat, For Each, If, Set and moves, so a grid or a terrain can come from loops. Example: Vertex lines at -1, -1, 0 and 1, -1, 0 and 0, 1, 0, then Face 0, 1, 2 give one triangle.',
    stops: [
      'A Face with fewer than three corners, or a corner number with no Vertex.',
      'No Face lines.',
      'A Point or a solid between this line and its End.',
      SOLID_SCRIPT_MESH_STOPS_END,
    ],
    nesting: 'open',
    parameters: [solidScriptParameterMeshMode()],
    listing: (read) => ['Mesh', ...solidScriptListingOptions([read.changed('mode') && ['Mode ', read.value('mode')]])],
    execute: (run) => {
      const { points, uvs, faces } = run.gathered('mesh');
      const corners = faces.map((face) => {
        const uv = face.map((index) => uvs[index] ?? null);
        return uv.every((entry) => entry !== null) ? (uv as SolidScriptUv[]) : null;
      });
      return run.mesh(solidScriptMeshModeSet(run, { kind: 'mesh', label: 'mesh', points, faces, uvs: corners }));
    },
  }),
  new SolidScriptCommand({
    id: 'vertex',
    label: 'Vertex',
    category: 'Meshes',
    description: 'Add a corner point to a Mesh',
    manual:
      'Adds one corner point at X, Y and Z in metres to the Mesh around this line, moved by any Transform, Rotate or other move between them. Vertex lines are numbered from 0 in the order they run, and Face lines join them by number. UV, when given, is the texture coordinate of the point. Leave it empty for coordinates made automatically. Example: inside Repeat [I] From 0 To 8, Vertex [=Cos([I] * 45) * 2], 0, [=Sin([I] * 45) * 2] adds the eight points of a ring on the ground.',
    stops: ['Being placed outside a Mesh.', 'A position that is not x, y, z.'],
    parameters: [
      solidScriptParameter(
        'position',
        'Position',
        'vector3',
        '0, 0, 0',
        'X, Y and Z of the point in metres, such as 0, 2, 0.',
      ),
      solidScriptParameterOptional(
        'uv',
        'UV',
        'vector2',
        'Optional texture coordinate u, v, such as 0, 0. 1 is one texture repeat. Left off, coordinates are automatic.',
      ),
    ],
    listing: (read) => [
      'Vertex',
      read.value('position'),
      ...solidScriptListingOptions([read.changed('uv') && ['UV ', read.value('uv')]]),
    ],
    execute: (run) => {
      const xyz = run.fields().vector('position', [0, 0, 0]);
      const uv = run.text('uv').trim() === '' ? null : run.fields().flat('uv', [0, 0]);
      return run.point(new THREE.Vector3(xyz[0], xyz[1], xyz[2]), uv);
    },
  }),
  new SolidScriptCommand({
    id: 'face',
    label: 'Face',
    category: 'Meshes',
    description: 'Join Vertex points into a face',
    manual:
      'Joins Vertex points of the Mesh around this line into one face, by their numbers from 0, in order around the edge and counter-clockwise as seen from the side the face shows. Three numbers make a triangle, four a quad, more an n-sided face. The numbers may be formulas, so a Repeat can join a whole grid. Example: Face 0, 1, 2, 3 joins the first four Vertex lines into a quad.',
    stops: [
      'Being placed outside a Mesh.',
      'Fewer than three corners, the same corner twice, or a number with no Vertex.',
    ],
    parameters: [
      {
        ...solidScriptParameter(
          'corners',
          'Corners',
          'value',
          '0, 1, 2',
          'Vertex numbers from 0, in order around the face, separated by commas, such as 0, 1, 2, 3, or a list variable.',
        ),
        accepts: ['Vector', 'Number List', 'Text'],
      },
    ],
    listing: (read) => ['Face', read.value('corners')],
    execute: (run) => {
      const corners = solidScriptValueNumbers(run.value('corners'));
      if (!corners) throw new Error('Corners must be Vertex numbers separated by commas, such as 0, 1, 2');
      return run.face(corners);
    },
  }),
  new SolidScriptCommand({
    id: 'mesh_from_solids',
    builtKind: 'Mesh',
    named: true,
    label: 'Mesh From Solids',
    category: 'Meshes',
    description: 'Turn solids into one mesh',
    manual:
      'Turns the solids between this line and its End into one mesh, baking their cut result the same way the editor cuts solids, including Subtractive and Intersecting modes and Group. Only the solids inside this block are baked, not the rest of the world. Use it when a solid should be a model rather than level geometry, or to change it with the other mesh tools. Example: a Cube, then a smaller Cube with Mode Subtractive, inside Mesh From Solids, becomes a mesh with a notch. Mode on this line combines the whole mesh with the meshes before it, the same way.',
    stops: [
      'A Subtractive or Intersecting solid that removes everything, so nothing is left to turn into a mesh.',
      'A solid that is no longer convex.',
      SOLID_SCRIPT_MESH_STOPS_FLAT,
      SOLID_SCRIPT_MESH_STOPS_END,
    ],
    nesting: 'open',
    parameters: [solidScriptParameterMeshMode()],
    listing: (read) => [
      'Mesh From Solids',
      ...solidScriptListingOptions([read.changed('mode') && ['Mode ', read.value('mode')]]),
    ],
    execute: (run) => solidScriptMeshTool(run, 'Mesh From Solids', (mesh) => solidScriptMeshModeSet(run, mesh)),
  }),
  new SolidScriptCommand({
    id: 'join_meshes',
    edits: true,
    label: 'Join Meshes',
    category: 'Meshes',
    description: 'Join meshes into one',
    manual:
      'Joins the meshes in Of into one mesh, keeping every face and corner as they are; the joined mesh takes the place of the first, with its Name and texture, and the others are taken out. Of is the meshes; empty uses [$Selected.Objects]. Where, when given, is a 🔁 condition a mesh must pass to be joined. A solid stops the line: wrap it in Mesh From Solids first. Merge By Distance afterwards welds the corners that touch. Example: two Mesh From Solids blocks, Select Objects, then Join Meshes gives one mesh to Subdivide as a whole.',
    stops: ['A solid. Wrap it in Mesh From Solids first.', 'No mesh to work on.'],
    parameters: [
      solidScriptParameterOfWhere('Object', '[=[$Object.Center.Y] > 0]'),
      solidScriptParameterOf('meshes', '$Selected.Objects', ['Object']),
    ],
    listing: (read) => ['Join Meshes', ...solidScriptListingOf(read)],
    execute: (run) => {
      const [first, ...rest] = solidScriptMeshTargets(run, 'Join Meshes');
      if (!first) return [];
      run.leafReplace(first, { ...solidScriptMeshJoin([first, ...rest], first.label), ...solidScriptMeshKept(first) });
      for (const leaf of rest) run.leafReplace(leaf, solidScriptShapeGone(leaf.label));
      return [];
    },
  }),
  new SolidScriptCommand({
    id: 'merge_points',
    edits: true,
    label: 'Merge Points',
    category: 'Meshes',
    description: 'Weld corners that share a Merge ID',
    manual:
      'Welds mesh corners that share a Merge ID into one at their average position, even if they are far apart. Merge ID is a whole number worked out per corner with [$Vertex], [$Index] and [$Count]; left as [$Index], every corner stays separate. Pick Where, when given, is a condition a corner must pass to merge. Faces that fold away are dropped. Of is the mesh; empty uses [$Selected.Objects]. A solid stops the line: wrap it in Mesh From Solids first. Example: Merge Points Merge ID 0 joins every corner at their middle.',
    stops: [
      'A Merge ID that is not a whole number.',
      'A solid. Wrap it in Mesh From Solids first.',
      'No mesh to work on.',
    ],
    parameters: [
      solidScriptParameterEach(
        solidScriptParameter(
          'merge_id',
          'Merge ID',
          'number',
          '[$Index]',
          'A whole number per corner; corners with the same number merge, such as 0 to join all of them.',
        ),
        'Vertex',
      ),
      solidScriptParameterEach(
        solidScriptParameterOptional(
          'pick',
          'Pick Where',
          'value',
          'A condition each corner must pass to merge, such as [=[$Vertex.Position.Y] > 0]. Left off may merge every corner.',
        ),
        'Vertex',
      ),
      solidScriptParameterOfWhere('Object', '[=[$Object.Center.Y] > 0]'),
      solidScriptParameterOf('meshes', '$Selected.Objects', ['Object']),
    ],
    listing: (read) => [
      'Merge Points',
      ...solidScriptListingOptions([
        read.changed('merge_id') && ['Merge ID ', read.value('merge_id')],
        read.text('pick') !== '' && ['Pick Where ', read.value('pick')],
      ]),
      ...solidScriptListingOf(read),
    ],
    execute: (run) => solidScriptMeshApply(run, 'Merge Points', (mesh) => solidScriptMergePoints(run, mesh)),
  }),
  new SolidScriptCommand({
    id: 'merge_by_distance',
    edits: true,
    label: 'Merge By Distance',
    category: 'Meshes',
    description: 'Weld corners that nearly touch',
    manual:
      'Welds corners of a mesh that are closer than Distance into one, so pieces that touch share their corners and smooth as one surface. Faces that fold away are dropped. Mode Connected welds only the two ends of an edge shorter than Distance, so separate parts that nearly touch stay apart. The 🔁 Weld Where, when given, is a condition a corner must pass to be welded. Of is the mesh to weld; empty uses [$Selected.Objects]. A solid stops the line: wrap it in Mesh From Solids first, which also bakes several solids, including cuts, into one mesh. Example: Mesh From Solids around two Cubes side by side, then Merge By Distance 0.001, gives one mesh whose touching corners are shared.',
    stops: ['A Distance below 0.', 'A solid. Wrap it in Mesh From Solids first.', 'No mesh to work on.'],
    parameters: [
      solidScriptParameter(
        'distance',
        'Distance',
        'number',
        '0.001',
        'Largest gap between corners that are welded, in metres, such as 0.01.',
      ),
      solidScriptParameterWords(
        'merging',
        'Mode',
        'text',
        'All',
        'Which corners weld: All for any corners that near, or Connected for only the two ends of an edge shorter than Distance. Type All or Connected, such as All.',
        [
          { word: 'All', detail: 'Any corners closer than Distance' },
          { word: 'Connected', detail: 'Only the ends of edges shorter than Distance' },
        ],
      ),
      solidScriptParameterEach(
        solidScriptParameterOptional(
          'weld',
          'Weld Where',
          'value',
          'A condition each corner must pass to be welded, such as [=[$Vertex.Position.Y] > 0]. Left off may weld every corner.',
        ),
        'Vertex',
      ),
      solidScriptParameterOfWhere('Object', '[=[$Object.Center.Y] > 0]'),
      solidScriptParameterOf('meshes', '$Selected.Objects', ['Object']),
    ],
    listing: (read) => [
      'Merge By Distance',
      read.value('distance'),
      ...solidScriptListingOptions([read.changed('merging') && ['Mode ', read.value('merging')]]),
      ...solidScriptListingOf(read),
    ],
    execute: (run) => {
      const distance = solidScriptMeshNumber(run.value('distance'), 'Distance');
      if (distance < 0) throw new Error(`Distance must be 0 or more, not ${distance}`);
      return solidScriptMeshApply(run, 'Merge By Distance', (mesh) => solidScriptMeshMergeRun(run, mesh, distance));
    },
  }),
  new SolidScriptCommand({
    id: 'subdivide',
    edits: true,
    label: 'Subdivide',
    category: 'Meshes',
    description: 'Split mesh faces into smaller ones',
    manual:
      'Splits every face of a mesh into four-sided faces, Levels times. Each level makes about four times as many faces. With Smooth on, the corners are rounded off as well, so a Cube becomes a soft rounded ball after a few levels; edges that pass Crease stay sharp, and Keep Corners holds the corners of an open mesh in place. Of is the mesh; empty uses [$Selected.Objects]. A solid stops the line: wrap it in Mesh From Solids first. Example: Mesh From Solids around a Cube, then Subdivide 2 times, gives a smooth blob. With Smooth off it stays a cube with a finer grid for Displace.',
    stops: [
      `Levels below 1 or above ${SOLID_SCRIPT_SUBDIVIDE_LEVELS_MAX}.`,
      'A solid. Wrap it in Mesh From Solids first.',
      'No mesh to work on.',
    ],
    parameters: [
      solidScriptParameter(
        'levels',
        'Levels',
        'count',
        '1',
        `How many times to split, 1 to ${SOLID_SCRIPT_SUBDIVIDE_LEVELS_MAX}, such as 1.`,
      ),
      solidScriptParameter(
        'smooth',
        'Smooth',
        'boolean',
        'Yes',
        'Yes: round the shape off. No: keep its shape exactly, only with more faces. Type Yes or No, such as Yes.',
      ),
      solidScriptParameterEach(
        solidScriptParameterOptional(
          'crease',
          'Crease',
          'value',
          'A condition an edge must pass to stay sharp while Smooth rounds the rest, such as [=[$Edge.Angle] > 60]. Left off creases none.',
        ),
        'Edge',
      ),
      solidScriptParameter(
        'keep_corners',
        'Keep Corners',
        'boolean',
        'No',
        'Yes: the corners of an open mesh, such as a Grid Mesh, stay where they are while Smooth rounds its border. Type Yes or No, such as Yes.',
      ),
      solidScriptParameterOfWhere('Object', '[=[$Object.Center.Y] > 0]'),
      solidScriptParameterOf('meshes', '$Selected.Objects', ['Object']),
    ],
    listing: (read) => [
      'Subdivide',
      read.value('levels'),
      ' Times',
      ...solidScriptListingOptions([
        !read.on('smooth') && ['Not Smooth'],
        read.text('crease') !== '' && ['Crease ', read.value('crease')],
        read.on('keep_corners') && ['Keep Corners'],
      ]),
      ...solidScriptListingOf(read),
    ],
    execute: (run) => {
      const levels = solidScriptMeshCount(run, 'levels', 'Levels', [1, SOLID_SCRIPT_SUBDIVIDE_LEVELS_MAX]);
      const smooth = run.fields().flag('smooth');
      const keepCorners = run.fields().flag('keep_corners');
      return solidScriptMeshApply(run, 'Subdivide', (mesh) => {
        let result = mesh;
        let sharp = solidScriptMeshCreased(run, mesh);
        for (let level = 0; level < levels; level++) {
          const next = solidScriptMeshSubdivide(result, smooth, sharp, keepCorners);
          sharp = solidScriptMeshSubdivideSharp(result, sharp);
          result = next;
        }
        return result;
      });
    },
  }),
  new SolidScriptCommand({
    id: 'mesh_smooth',
    edits: true,
    label: 'Smooth Mesh',
    category: 'Meshes',
    description: 'Relax a mesh so it looks softer',
    manual:
      'Moves every point of a mesh part of the way towards its neighbours, Rounds times, which softens bumps and sharp corners. The path of an open mesh stays where it is. Strength is how far each round moves, from 0 (not at all) to 1 (all the way). Of is the mesh; empty uses [$Selected.Objects]. A solid stops the line: wrap it in Mesh From Solids first. Example: Mesh From Solids, Subdivide, then Smooth Mesh 10 rounds at 0.5 takes the harsh edges off a rocky surface.',
    stops: [
      `Rounds below 1 or above ${SOLID_SCRIPT_SMOOTH_ROUNDS_MAX}.`,
      'A Strength below 0 or above 1.',
      'A solid. Wrap it in Mesh From Solids first.',
      'No mesh to work on.',
    ],
    parameters: [
      solidScriptParameter(
        'rounds',
        'Rounds',
        'count',
        '5',
        `How many times to relax, 1 to ${SOLID_SCRIPT_SMOOTH_ROUNDS_MAX}, such as 4.`,
      ),
      solidScriptParameter(
        'strength',
        'Strength',
        'number',
        '0.5',
        'How far each round moves the points, 0 to 1, such as 0.5.',
      ),
      solidScriptParameterOfWhere('Object', '[=[$Object.Center.Y] > 0]'),
      solidScriptParameterOf('meshes', '$Selected.Objects', ['Object']),
    ],
    listing: (read) => [
      'Smooth Mesh',
      read.value('rounds'),
      ' Times, Strength ',
      read.value('strength'),
      ...solidScriptListingOf(read),
    ],
    execute: (run) => {
      const rounds = solidScriptMeshCount(run, 'rounds', 'Rounds', [1, SOLID_SCRIPT_SMOOTH_ROUNDS_MAX]);
      const strength = solidScriptMeshNumber(run.value('strength'), 'Strength');
      if (strength < 0 || strength > 1) throw new Error(`Strength must be 0 to 1, not ${strength}`);
      return solidScriptMeshApply(run, 'Smooth Mesh', (mesh) => solidScriptMeshSmooth(mesh, rounds, strength));
    },
  }),
  new SolidScriptCommand({
    id: 'displace',
    edits: true,
    label: 'Displace',
    category: 'Meshes',
    description: 'Push mesh points in or out by a formula',
    manual:
      'Moves points of a mesh outwards along the surface by Distance in metres. A negative distance pulls them in. Near sharp edges the points turn smoothly around the edge, so faces never push through each other. It moves the vertices Select Vertices picked, or every point when none are picked. Distance is worked out for each point, and may use [$X], [$Y] and [$Z] (its position), [$NX], [$NY] and [$NZ] (its normal), [$Vertex], [$Index] and [$Count], so waves, noise and bulges come from one formula. Of is the mesh; empty uses [$Selected.Objects]. A solid stops the line: wrap it in Mesh From Solids first. Subdivide first for a smooth result. Example: Mesh From Solids around a subdivided Cube, then Distance [=0.1 * Sin([$X] * 180)], gives a wavy surface.',
    stops: [
      'A Distance that does not give a number.',
      'A solid. Wrap it in Mesh From Solids first.',
      'No mesh to work on.',
    ],
    parameters: [
      solidScriptParameterEach(
        solidScriptParameter(
          'distance',
          'Distance',
          'number',
          '[=0.1 * Sin([$X] * 360)]',
          'Metres to move each point outwards, such as 0.2 or [=[$NX] * 0.1].',
        ),
        'Vertex',
      ),
      solidScriptParameterOfWhere('Object', '[=[$Object.Center.Y] > 0]'),
      solidScriptParameterOf('meshes', '$Selected.Objects', ['Object']),
    ],
    listing: (read) => ['Displace', 'By ', read.value('distance'), ...solidScriptListingOf(read)],
    execute: (run) => solidScriptMeshApply(run, 'Displace', (mesh) => solidScriptMeshDisplaceRun(run, mesh)),
  }),
];
