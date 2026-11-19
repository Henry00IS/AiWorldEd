import * as THREE from 'three';
import { solidScriptKindNamed } from '@/solid_script/language/solid_script_kinds.js';
import { SolidScriptCommand } from './solid_script_command.js';
import { solidScriptListingOptions } from './solid_script_command_listing.js';
import { SOLID_SCRIPT_ANCHOR_SOLID } from '@/solid_script/language/solid_script_anchor.js';
import {
  solidScriptParameter,
  solidScriptParameterAnchor,
  solidScriptParameterOf,
  solidScriptParameterOptional,
} from './solid_script_command_parameters.js';
import type { SolidScriptBlockRun } from '@/solid_script/language/solid_script_machine_types.js';
import {
  SOLID_SCRIPT_MESH_NEEDS_WRAP,
  solidScriptMeshDisplace,
  solidScriptMeshFromSolid,
  solidScriptMeshJoin,
  solidScriptMeshMerge,
  solidScriptMeshSmooth,
  solidScriptMeshSubdivide,
  type SolidScriptShapeMesh,
  type SolidScriptUv,
} from '@/solid_script/language/solid_script_mesh.js';
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

/** What stops every mesh tool given a flat outline. */
const SOLID_SCRIPT_MESH_STOPS_FLAT = 'A flat outline such as Square between this line and its End. Extrude it first.';

/** Most rounds of Subdivide. */
const SOLID_SCRIPT_SUBDIVIDE_LEVELS_MAX = 4;

/** Most rounds of Smooth Mesh. */
const SOLID_SCRIPT_SMOOTH_ROUNDS_MAX = 100;

/**
 * Runs the lines inside a mesh tool and turns them into one mesh: meshes stay
 * as they are and solids such as Cube become meshes of their faces.
 *
 * @param run Running line.
 * @param label Mesh label.
 * @returns Mesh in the block's own frame, or null when nothing was built.
 */
function solidScriptMeshInside(run: SolidScriptBlockRun, label: string): SolidScriptShapeMesh | null {
  if (run.planar) throw new Error(`${label} cannot be inside a Linear Extrude; put it around the extrusion`);
  const meshes = run.local(false).flatMap((shape) => solidScriptMeshesOf(shape, label));
  return meshes.length === 0 ? null : solidScriptMeshJoin(meshes, label);
}

/**
 * Turns one shape tree into meshes.
 *
 * @param shape Shape tree.
 * @param label Tool label, for messages.
 * @returns Meshes.
 */
function solidScriptMeshesOf(shape: SolidScriptShape, label: string): SolidScriptShapeMesh[] {
  if (shape.kind === 'mesh') return [shape];
  if (shape.kind === 'solid') return [solidScriptMeshFromSolid(shape.points, shape.label, shape.texture)];
  if (shape.kind === 'polygon')
    throw new Error(`${label} needs solids or meshes; a flat outline becomes a solid inside Linear Extrude first`);
  if (shape.kind === 'boolean' && shape.operation !== 'union')
    throw new Error(`${label} cannot turn a joined cut into a mesh yet; only brushes can be`);
  return shape.children.flatMap((child) => solidScriptMeshesOf(child, label));
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
 * [$Selected.Brushes].
 *
 * @param run Running line.
 * @param label Command, for messages.
 * @returns Meshes, each once.
 */
function solidScriptMeshTargets(run: SolidScriptBlockRun, label: string): SolidScriptShapeMesh[] {
  const given = run.ofValues();
  const values = given ?? run.selectedGet('brushes');
  if (values.length === 0)
    throw new Error(
      given ? `${label} has no mesh in Of; check that Of holds a mesh` : solidScriptOfEmpty(label, 'brushes'),
    );
  const leaves: SolidScriptShapeMesh[] = [];
  for (const value of values) {
    const leaf = solidScriptMeshLeaf(run, value, label);
    if (!leaves.includes(leaf)) leaves.push(leaf);
  }
  return leaves;
}

/**
 * Replaces each mesh a line works on with a changed copy.
 *
 * @param run Running line.
 * @param label Command, for messages.
 * @param change What the tool does.
 * @returns Nothing; the meshes are replaced in place.
 */
function solidScriptMeshApply(
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
  return solidScriptMeshDisplace(mesh, (point, normal, index) => {
    if (picked && !picked.has(index)) return 0;
    return solidScriptMeshNumber(
      run.valueWith('distance', {
        $X: point.x,
        $Y: point.y,
        $Z: point.z,
        $NX: normal.x,
        $NY: normal.y,
        $NZ: normal.z,
        $Index: index,
      }),
      'Distance',
    );
  });
}

/**
 * Turns the selected faces of a mesh around, or every face when none are
 * picked.
 *
 * @param run Running line.
 * @param mesh Mesh.
 * @returns Flipped mesh.
 */
function solidScriptMeshFlipRun(run: SolidScriptBlockRun, mesh: SolidScriptShapeMesh): SolidScriptShapeMesh {
  const picked = solidScriptMeshPicked(run, mesh, 'faces');
  const keep = (index: number): boolean => Boolean(picked && !picked.has(index));
  return {
    ...mesh,
    faces: mesh.faces.map((face, index) => (keep(index) ? face : [...face].reverse())),
    uvs: mesh.uvs.map((uv, index) => (!uv || keep(index) ? uv : [...uv].reverse())),
  };
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
      'A Size with a negative length, or that is not one number or three numbers separated by commas.',
      'A Size that is not flat: set Width, Height or Depth to 0, such as 2, 0, 2.',
      `Columns or Rows outside ${SOLID_SCRIPT_GRID_MESH_COUNT_MIN} to ${SOLID_SCRIPT_GRID_MESH_COUNT_MAX}, or a count with decimals.`,
    ],
    parameters: [
      solidScriptParameter(
        'size',
        'Size',
        'vector3',
        '2, 0, 2',
        'Width (X), height (Y) and depth (Z) in metres. Set one length to 0 so the grid is flat.',
      ),
      solidScriptParameter(
        'columns',
        'Columns',
        'count',
        '4',
        `Faces across, ${SOLID_SCRIPT_GRID_MESH_COUNT_MIN} to ${SOLID_SCRIPT_GRID_MESH_COUNT_MAX}.`,
      ),
      solidScriptParameter(
        'rows',
        'Rows',
        'count',
        '4',
        `Faces the other way, ${SOLID_SCRIPT_GRID_MESH_COUNT_MIN} to ${SOLID_SCRIPT_GRID_MESH_COUNT_MAX}.`,
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
    id: 'mesh',
    named: true,
    label: 'Mesh',
    category: 'Meshes',
    description: 'Build a mesh from Vertex and Face lines',
    manual:
      'Builds a mesh, a regular model made of faces instead of brushes, from the Vertex and Face lines between this line and its End. Each Vertex adds a corner point. They are numbered from 0 in order. Each Face joins corner numbers, listed counter-clockwise as seen from outside. Unlike brushes, a mesh may be open, dented or any brush at all, but it does not cut or get cut. The lines inside may use Repeat, For Each, If, Set and moves, so a grid or a terrain can come from loops. Example: Vertex lines at -1, -1, 0 and 1, -1, 0 and 0, 1, 0, then Face 0, 1, 2 give one triangle.',
    stops: [
      'A Face with fewer than three corners, or a corner number with no Vertex.',
      'No Face lines.',
      'A Point or a solid between this line and its End.',
      SOLID_SCRIPT_MESH_STOPS_END,
    ],
    nesting: 'open',
    parameters: [],
    listing: () => ['Mesh'],
    execute: (run) => {
      const { points, uvs, faces } = run.gathered('mesh');
      const corners = faces.map((face) => {
        const uv = face.map((index) => uvs[index] ?? null);
        return uv.every((entry) => entry !== null) ? (uv as SolidScriptUv[]) : null;
      });
      return run.mesh({ kind: 'mesh', label: 'mesh', points, faces, uvs: corners });
    },
  }),
  new SolidScriptCommand({
    id: 'vertex',
    label: 'Vertex',
    category: 'Meshes',
    description: 'Add a corner point to a Mesh',
    manual:
      'Adds one corner point at X, Y and Z in metres to the Mesh around this line, moved by any Translate, Rotate or other move between them. Vertex lines are numbered from 0 in the order they run, and Face lines join them by number. UV, when given, is the texture coordinate of the point. Leave it empty for coordinates made automatically. Example: inside Repeat [I] From 0 To 7, Vertex [=Cos([I] * 45) * 2], 0, [=Sin([I] * 45) * 2] adds the eight points of a ring on the ground.',
    stops: ['Being placed outside a Mesh.', 'A position that is not x, y, z.'],
    parameters: [
      solidScriptParameter('position', 'Position', 'vector3', '0, 0, 0', 'X, Y and Z of the point in metres.'),
      solidScriptParameterOptional(
        'uv',
        'UV',
        'vector2',
        'Optional texture coordinate u, v. 1 is one texture repeat. Leave empty for automatic coordinates.',
      ),
    ],
    listing: (read) => [
      'Vertex',
      read.value('position'),
      ...solidScriptListingOptions([read.changed('uv') && ['UV ', read.value('uv')]]),
    ],
    execute: (run) => {
      const xyz = run.fields().vector('position', [0, 0, 0]);
      const uv = run.text('uv').trim() === '' ? null : (run.fields().vector('uv', [0, 0]) as SolidScriptUv);
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
          'Vertex numbers from 0, in order around the face, separated by commas, or a list variable.',
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
    id: 'mesh_brushes',
    named: true,
    label: 'Mesh From Brushes',
    category: 'Meshes',
    description: 'Turn brushes into one mesh',
    manual:
      'Turns the brushes between this line and its End into one mesh: every Cube, Sphere, Cylinder, Polyhedron, Hull or extrusion inside becomes faces of a regular mesh object. Use it when a brush should be a model rather than level geometry, or to change it with the other mesh tools. Brushes inside are joined, not cut. Example: a Sphere inside Mesh From Brushes becomes a round mesh ball.',
    stops: [
      'A cut or overlap that is not a brush. Mesh From Brushes works on brushes.',
      SOLID_SCRIPT_MESH_STOPS_FLAT,
      SOLID_SCRIPT_MESH_STOPS_END,
    ],
    nesting: 'open',
    parameters: [],
    listing: () => ['Mesh From Brushes'],
    execute: (run) => solidScriptMeshTool(run, 'Mesh From Brushes', (mesh) => mesh),
  }),
  new SolidScriptCommand({
    id: 'merge_by_distance',
    edits: true,
    label: 'Merge By Distance',
    category: 'Meshes',
    description: 'Weld corners that nearly touch',
    manual:
      'Welds corners of a mesh that are closer than Distance into one, so pieces that touch share their corners and smooth as one surface. Faces that fold away are dropped. Of is the mesh to weld; empty uses [$Selected.Brushes]. A brush stops the line: wrap it in Mesh From Brushes first, which also joins several brushes into one mesh. Example: Mesh From Brushes around two Cubes side by side, then Merge By Distance 0.001, gives one mesh whose touching corners are shared.',
    stops: ['A Distance below 0.', 'A brush. Wrap it in Mesh From Brushes first.', 'No mesh to work on.'],
    parameters: [
      solidScriptParameter(
        'distance',
        'Distance',
        'number',
        '0.001',
        'Largest gap between corners that are welded, in metres.',
      ),
      solidScriptParameterOf('meshes', '$Selected.Brushes', ['Brush']),
    ],
    listing: (read) => [
      'Merge By Distance',
      read.value('distance'),
      ...(read.text('of') === '' ? [] : [' Of ', read.value('of')]),
    ],
    execute: (run) => {
      const distance = solidScriptMeshNumber(run.value('distance'), 'Distance');
      if (distance < 0) throw new Error(`Distance must be 0 or more, not ${distance}`);
      return solidScriptMeshApply(run, 'Merge By Distance', (mesh) => solidScriptMeshMerge(mesh, distance));
    },
  }),
  new SolidScriptCommand({
    id: 'subdivide',
    edits: true,
    label: 'Subdivide',
    category: 'Meshes',
    description: 'Split mesh faces into smaller ones',
    manual:
      'Splits every face of a mesh into four-sided faces, Levels times. Each level makes about four times as many faces. With Smooth on, the corners are rounded off as well, so a Cube becomes a soft rounded ball after a few levels. Of is the mesh; empty uses [$Selected.Brushes]. A brush stops the line: wrap it in Mesh From Brushes first. Example: Mesh From Brushes around a Cube, then Subdivide 2 times, gives a smooth blob. With Smooth off it stays a cube with a finer grid for Displace.',
    stops: [
      `Levels below 1 or above ${SOLID_SCRIPT_SUBDIVIDE_LEVELS_MAX}.`,
      'A brush. Wrap it in Mesh From Brushes first.',
      'No mesh to work on.',
    ],
    parameters: [
      solidScriptParameter(
        'levels',
        'Levels',
        'count',
        '1',
        `How many times to split, 1 to ${SOLID_SCRIPT_SUBDIVIDE_LEVELS_MAX}.`,
      ),
      solidScriptParameter(
        'smooth',
        'Smooth',
        'boolean',
        'Yes',
        'Yes: round the shape off. No: keep its shape exactly, only with more faces.',
      ),
      solidScriptParameterOf('meshes', '$Selected.Brushes', ['Brush']),
    ],
    listing: (read) => [
      'Subdivide',
      read.value('levels'),
      ' Times',
      ...solidScriptListingOptions([!read.on('smooth') && ['Not Smooth']]),
      ...(read.text('of') === '' ? [] : [' Of ', read.value('of')]),
    ],
    execute: (run) => {
      const levels = solidScriptMeshCount(run, 'levels', 'Levels', [1, SOLID_SCRIPT_SUBDIVIDE_LEVELS_MAX]);
      const smooth = run.fields().flag('smooth');
      return solidScriptMeshApply(run, 'Subdivide', (mesh) => {
        let result = mesh;
        for (let level = 0; level < levels; level++) result = solidScriptMeshSubdivide(result, smooth);
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
      'Moves every point of a mesh part of the way towards its neighbours, Rounds times, which softens bumps and sharp corners. The outline of an open mesh stays where it is. Strength is how far each round moves, from 0 (not at all) to 1 (all the way). Of is the mesh; empty uses [$Selected.Brushes]. A brush stops the line: wrap it in Mesh From Brushes first. Example: Mesh From Brushes, Subdivide, then Smooth Mesh 10 rounds at 0.5 takes the harsh edges off a rocky surface.',
    stops: [
      `Rounds below 1 or above ${SOLID_SCRIPT_SMOOTH_ROUNDS_MAX}.`,
      'A Strength below 0 or above 1.',
      'A brush. Wrap it in Mesh From Brushes first.',
      'No mesh to work on.',
    ],
    parameters: [
      solidScriptParameter(
        'rounds',
        'Rounds',
        'count',
        '5',
        `How many times to relax, 1 to ${SOLID_SCRIPT_SMOOTH_ROUNDS_MAX}.`,
      ),
      solidScriptParameter('strength', 'Strength', 'number', '0.5', 'How far each round moves the points, 0 to 1.'),
      solidScriptParameterOf('meshes', '$Selected.Brushes', ['Brush']),
    ],
    listing: (read) => [
      'Smooth Mesh',
      read.value('rounds'),
      ' Times, Strength ',
      read.value('strength'),
      ...(read.text('of') === '' ? [] : [' Of ', read.value('of')]),
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
      'Moves points of a mesh outwards along the surface by Distance in metres. A negative distance pulls them in. It moves the vertices Select Vertices picked, or every point when none are picked. Distance is worked out for each point, and may use [$X], [$Y] and [$Z] (short forms of [$Vertex.Position] on each axis), [$NX], [$NY] and [$NZ] (short forms of [$Vertex.Normal]) and [$Index] (the point number), so waves, noise and bulges come from one formula. Of is the mesh; empty uses [$Selected.Brushes]. A brush stops the line: wrap it in Mesh From Brushes first. Subdivide first for a smooth result. Example: Mesh From Brushes around a subdivided Cube, then Distance [=0.1 * Sin([$X] * 180)], gives a wavy surface.',
    stops: [
      'A Distance that does not give a number.',
      'A brush. Wrap it in Mesh From Brushes first.',
      'No mesh to work on.',
    ],
    fills: ['$X', '$Y', '$Z', '$NX', '$NY', '$NZ', '$Index'],
    parameters: [
      {
        ...solidScriptParameter(
          'distance',
          'Distance',
          'number',
          '[=0.1 * Sin([$X] * 360)]',
          'Metres to move each point outwards. May use [$X], [$Y], [$Z], [$NX], [$NY], [$NZ] and [$Index].',
        ),
        each: 'Vertex',
      },
      solidScriptParameterOf('meshes', '$Selected.Brushes', ['Brush']),
    ],
    listing: (read) => [
      'Displace',
      'By ',
      read.value('distance'),
      ...(read.text('of') === '' ? [] : [' Of ', read.value('of')]),
    ],
    execute: (run) => solidScriptMeshApply(run, 'Displace', (mesh) => solidScriptMeshDisplaceRun(run, mesh)),
  }),
  new SolidScriptCommand({
    id: 'flip_faces',
    edits: true,
    label: 'Flip Faces',
    category: 'Meshes',
    description: 'Turn mesh faces to show the other side',
    manual:
      'Turns faces of a mesh around, so they show the other side. It flips the faces Select Faces picked, or every face when none are picked. Use it when a mesh looks inside out, or to see a box from the inside, such as a sky box or a cave. Of is the mesh; empty uses [$Selected.Brushes]. A brush stops the line: wrap it in Mesh From Brushes first. Example: Mesh From Brushes around a large Cube, then Flip Faces, is a room seen from within.',
    stops: ['A brush. Wrap it in Mesh From Brushes first.', 'No mesh to work on.'],
    parameters: [solidScriptParameterOf('meshes', '$Selected.Brushes', ['Brush'])],
    listing: (read) => ['Flip Faces', ...(read.text('of') === '' ? [] : [' Of ', read.value('of')])],
    execute: (run) => solidScriptMeshApply(run, 'Flip Faces', (mesh) => solidScriptMeshFlipRun(run, mesh)),
  }),
];
