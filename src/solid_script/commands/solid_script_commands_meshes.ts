import * as THREE from 'three';
import { SolidScriptCommand, type SolidScriptCommandStarter } from './solid_script_command.js';
import { solidScriptListingOptions } from './solid_script_command_listing.js';
import { solidScriptParameter, solidScriptParameterOptional } from './solid_script_command_parameters.js';
import type { SolidScriptBlockRun } from '@/solid_script/language/solid_script_machine.js';
import {
  solidScriptMeshDisplace,
  solidScriptMeshExtrudeFaces,
  solidScriptMeshFromSolid,
  solidScriptMeshJoin,
  solidScriptMeshLoopNormal,
  solidScriptMeshMerge,
  solidScriptMeshSmooth,
  solidScriptMeshSubdivide,
  type SolidScriptShapeMesh,
  type SolidScriptUv,
} from '@/solid_script/language/solid_script_mesh.js';
import type { SolidScriptShape } from '@/solid_script/language/solid_script_shape.js';
import {
  solidScriptValueNumber,
  solidScriptValueNumbers,
  solidScriptValueTruthy,
} from '@/solid_script/language/solid_script_value.js';

/** What stops every mesh block without its End. */
const SOLID_SCRIPT_MESH_STOPS_END = 'A missing End line.';

/** What stops every mesh tool with nothing inside. */
const SOLID_SCRIPT_MESH_STOPS_EMPTY = 'Nothing between this line and its End.';

/** What stops every mesh tool given a flat outline. */
const SOLID_SCRIPT_MESH_STOPS_FLAT = 'A flat outline such as Square between this line and its End. Extrude it first.';

/** Most rounds of Subdivide. */
const SOLID_SCRIPT_SUBDIVIDE_LEVELS_MAX = 4;

/** Most rounds of Smooth Mesh. */
const SOLID_SCRIPT_SMOOTH_ROUNDS_MAX = 100;

/**
 * Starter lines of a new Mesh: a small four-sided pyramid.
 *
 * @returns Lines.
 */
function solidScriptMeshStarter(): SolidScriptCommandStarter[] {
  const vertices = ['-1, -1, 0', '1, -1, 0', '1, 1, 0', '-1, 1, 0', '0, 0, 1.5'];
  const faces = ['0, 3, 2, 1', '0, 1, 4', '1, 2, 4', '2, 3, 4', '3, 0, 4'];
  return [
    ...vertices.map((position) => ({ command: 'vertex', values: { position } })),
    ...faces.map((corners) => ({ command: 'face', values: { corners } })),
  ];
}

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
  if (shape.kind === 'solid') return [solidScriptMeshFromSolid(shape.points, shape.label)];
  if (shape.kind === 'polygon')
    throw new Error(`${label} needs solids or meshes; a flat outline becomes a solid inside Linear Extrude first`);
  if (shape.operation !== 'union')
    throw new Error(
      `${label} cannot turn a ${shape.operation === 'difference' ? 'Difference' : 'Intersection'} into a mesh yet; only shapes and Unions can be`,
    );
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
  return mesh ? run.mesh(change(mesh)) : [];
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
 * Box-projected texture coordinates: each face is mapped from the side it faces
 * most, so textures do not stretch.
 *
 * @param mesh Mesh.
 * @param size Metres per texture repeat.
 * @returns Mesh with coordinates on every face.
 */
function solidScriptMeshBoxUvs(mesh: SolidScriptShapeMesh, size: number): SolidScriptShapeMesh {
  return {
    ...mesh,
    uvs: mesh.faces.map((face) => {
      const normal = solidScriptMeshLoopNormal(mesh.points, face);
      const [ax, ay, az] = [Math.abs(normal.x), Math.abs(normal.y), Math.abs(normal.z)];
      return face.map((index): SolidScriptUv => {
        const point = mesh.points[index]!;
        if (az >= ax && az >= ay) return [point.x / size, point.y / size];
        if (ax >= ay) return [point.y / size, point.z / size];
        return [point.x / size, point.z / size];
      });
    }),
  };
}

/** Commands that build and change meshes, which become regular mesh objects. */
export const SOLID_SCRIPT_COMMANDS_MESHES: readonly SolidScriptCommand[] = [
  new SolidScriptCommand({
    id: 'mesh',
    label: 'Mesh',
    category: 'Meshes',
    description: 'Build a mesh from Vertex and Face lines',
    manual:
      'Builds a mesh, a regular model made of faces instead of brushes, from the Vertex and Face lines between this line and its End. Each Vertex adds a corner point. They are numbered from 0 in order. Each Face joins corner numbers, listed counter-clockwise as seen from outside. Unlike brushes, a mesh may be open, dented or any shape at all, but it does not cut or get cut. The lines inside may use Repeat, For Each, If, Set and moves, so a grid or a terrain can come from loops. Example: Vertex lines at -1, -1, 0 and 1, -1, 0 and 0, 1, 0, then Face 0, 1, 2 give one triangle.',
    stops: [
      'A Face with fewer than three corners, or a corner number with no Vertex.',
      'No Face lines.',
      'A Point or a solid between this line and its End.',
      SOLID_SCRIPT_MESH_STOPS_END,
    ],
    nesting: 'open',
    parameters: [],
    starter: solidScriptMeshStarter(),
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
      'Adds one corner point at X, Y and Z in metres to the Mesh around this line, moved by any Translate, Rotate or other move between them. Vertex lines are numbered from 0 in the order they run, and Face lines join them by number. UV, when given, is the texture coordinate of the point. Leave it empty for coordinates made automatically. Example: inside Repeat [i] from 0 to 7, Vertex [=cos([i] * 45) * 2], [=sin([i] * 45) * 2], 0 adds the eight points of a ring.',
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
      solidScriptParameter(
        'corners',
        'Corners',
        'value',
        '0, 1, 2',
        'Vertex numbers from 0, in order around the face, separated by commas, or a list variable.',
      ),
    ],
    listing: (read) => ['Face', read.value('corners')],
    execute: (run) => {
      const corners = solidScriptValueNumbers(run.value('corners'));
      if (!corners) throw new Error('Corners must be Vertex numbers separated by commas, such as 0, 1, 2');
      return run.face(corners);
    },
  }),
  new SolidScriptCommand({
    id: 'mesh_shapes',
    label: 'Mesh From Shapes',
    category: 'Meshes',
    description: 'Turn shapes into a mesh instead of brushes',
    manual:
      'Turns the shapes between this line and its End into one mesh instead of brushes: every Cube, Sphere, Cylinder, Polyhedron, Hull or extrusion inside becomes faces of a regular mesh object. Use it when a shape should be a model rather than level geometry, or to change it with the other mesh tools. Shapes inside are joined, not cut. Example: a Sphere inside Mesh From Shapes becomes a round mesh ball.',
    stops: [
      'A Difference or Intersection inside. They only work on brushes.',
      SOLID_SCRIPT_MESH_STOPS_FLAT,
      SOLID_SCRIPT_MESH_STOPS_EMPTY,
      SOLID_SCRIPT_MESH_STOPS_END,
    ],
    nesting: 'open',
    parameters: [],
    starter: [{ command: 'cube', values: {} }],
    listing: () => ['Mesh From Shapes'],
    execute: (run) => solidScriptMeshTool(run, 'Mesh From Shapes', (mesh) => mesh),
  }),
  new SolidScriptCommand({
    id: 'merge_by_distance',
    label: 'Merge By Distance',
    category: 'Meshes',
    description: 'Weld corners that nearly touch',
    manual:
      'Turns the shapes between this line and its End into one mesh and welds corners closer than Distance into one, so pieces that touch share their corners and smooth as one surface. Faces that fold away are dropped. Example: Merge By Distance 0.001 around two Cubes side by side gives one mesh whose touching corners are shared.',
    stops: [
      'A Distance below 0.',
      SOLID_SCRIPT_MESH_STOPS_FLAT,
      SOLID_SCRIPT_MESH_STOPS_EMPTY,
      SOLID_SCRIPT_MESH_STOPS_END,
    ],
    nesting: 'open',
    parameters: [
      solidScriptParameter(
        'distance',
        'Distance',
        'number',
        '0.001',
        'Largest gap between corners that are welded, in metres.',
      ),
    ],
    starter: [{ command: 'cube', values: {} }],
    listing: (read) => ['Merge By Distance', read.value('distance')],
    execute: (run) => {
      const distance = solidScriptMeshNumber(run.value('distance'), 'Distance');
      if (distance < 0) throw new Error(`Distance must be 0 or more, not ${distance}`);
      return solidScriptMeshTool(run, 'Merge By Distance', (mesh) => solidScriptMeshMerge(mesh, distance));
    },
  }),
  new SolidScriptCommand({
    id: 'subdivide',
    label: 'Subdivide',
    category: 'Meshes',
    description: 'Split mesh faces into smaller ones',
    manual:
      'Splits every face of the shapes between this line and its End into four-sided faces, Levels times. Each level makes about four times as many faces. With Smooth on, the corners are rounded off as well, so a Cube turns into a soft rounded ball after a few levels. Shapes inside become a mesh. Example: Subdivide with 2 levels around a Cube gives a smooth blob. With Smooth off it stays a cube with a finer grid for Displace.',
    stops: [
      `Levels below 1 or above ${SOLID_SCRIPT_SUBDIVIDE_LEVELS_MAX}.`,
      SOLID_SCRIPT_MESH_STOPS_FLAT,
      SOLID_SCRIPT_MESH_STOPS_EMPTY,
      SOLID_SCRIPT_MESH_STOPS_END,
    ],
    nesting: 'open',
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
        'true',
        'Yes: round the shape off. No: keep its shape exactly, only with more faces.',
      ),
    ],
    starter: [{ command: 'cube', values: {} }],
    listing: (read) => [
      'Subdivide',
      read.value('levels'),
      ' times',
      ...solidScriptListingOptions([!read.on('smooth') && ['Not Smooth']]),
    ],
    execute: (run) => {
      const levels = solidScriptMeshCount(run, 'levels', 'Levels', [1, SOLID_SCRIPT_SUBDIVIDE_LEVELS_MAX]);
      const smooth = run.fields().flag('smooth');
      return solidScriptMeshTool(run, 'Subdivide', (mesh) => {
        let result = mesh;
        for (let level = 0; level < levels; level++) result = solidScriptMeshSubdivide(result, smooth);
        return result;
      });
    },
  }),
  new SolidScriptCommand({
    id: 'mesh_smooth',
    label: 'Smooth Mesh',
    category: 'Meshes',
    description: 'Relax a mesh so it looks softer',
    manual:
      'Moves every point of the mesh made from the shapes between this line and its End part of the way towards its neighbours, Rounds times, which softens bumps and sharp corners. The outline of an open mesh stays where it is. Strength is how far each round moves, from 0 (not at all) to 1 (all the way). Example: Smooth Mesh 10 rounds at 0.5 around a Displace takes the harsh edges off a rocky surface.',
    stops: [
      `Rounds below 1 or above ${SOLID_SCRIPT_SMOOTH_ROUNDS_MAX}.`,
      'A Strength below 0 or above 1.',
      SOLID_SCRIPT_MESH_STOPS_EMPTY,
      SOLID_SCRIPT_MESH_STOPS_END,
    ],
    nesting: 'open',
    parameters: [
      solidScriptParameter(
        'rounds',
        'Rounds',
        'count',
        '5',
        `How many times to relax, 1 to ${SOLID_SCRIPT_SMOOTH_ROUNDS_MAX}.`,
      ),
      solidScriptParameter('strength', 'Strength', 'number', '0.5', 'How far each round moves the points, 0 to 1.'),
    ],
    starter: [
      { command: 'subdivide', values: { smooth: 'false' } },
      { command: 'cube', values: {} },
      { command: 'end', values: {} },
    ],
    listing: (read) => ['Smooth Mesh', read.value('rounds'), ' times, strength ', read.value('strength')],
    execute: (run) => {
      const rounds = solidScriptMeshCount(run, 'rounds', 'Rounds', [1, SOLID_SCRIPT_SMOOTH_ROUNDS_MAX]);
      const strength = solidScriptMeshNumber(run.value('strength'), 'Strength');
      if (strength < 0 || strength > 1) throw new Error(`Strength must be 0 to 1, not ${strength}`);
      return solidScriptMeshTool(run, 'Smooth Mesh', (mesh) => solidScriptMeshSmooth(mesh, rounds, strength));
    },
  }),
  new SolidScriptCommand({
    id: 'displace',
    label: 'Displace',
    category: 'Meshes',
    description: 'Push mesh points in or out by a formula',
    manual:
      'Moves every point of the mesh made from the shapes between this line and its End outwards along its surface by Distance in metres. A negative distance pulls it in. Distance is worked out for each point, and may use [x], [y] and [z] (where the point is), [nx], [ny] and [nz] (which way the surface faces there) and [index] (the point number), so waves, noise and bulges come from one formula. Subdivide first for a smooth result. Example: Distance [=0.1 * sin([x] * 180)] around a subdivided Cube gives a wavy surface.',
    stops: [
      'A Distance that does not give a number.',
      SOLID_SCRIPT_MESH_STOPS_FLAT,
      SOLID_SCRIPT_MESH_STOPS_EMPTY,
      SOLID_SCRIPT_MESH_STOPS_END,
    ],
    nesting: 'open',
    parameters: [
      solidScriptParameter(
        'distance',
        'Distance',
        'number',
        '[=0.1 * sin([x] * 360)]',
        'Metres to move each point outwards. May use [x], [y], [z], [nx], [ny], [nz] and [index].',
      ),
    ],
    starter: [
      { command: 'subdivide', values: { levels: '3', smooth: 'false' } },
      { command: 'cube', values: {} },
      { command: 'end', values: {} },
    ],
    listing: (read) => ['Displace', 'by ', read.value('distance')],
    execute: (run) =>
      solidScriptMeshTool(run, 'Displace', (mesh) =>
        solidScriptMeshDisplace(mesh, (point, normal, index) =>
          solidScriptMeshNumber(
            run.valueWith('distance', {
              x: point.x,
              y: point.y,
              z: point.z,
              nx: normal.x,
              ny: normal.y,
              nz: normal.z,
              index,
            }),
            'Distance',
          ),
        ),
      ),
  }),
  new SolidScriptCommand({
    id: 'extrude_faces',
    label: 'Extrude Faces',
    category: 'Meshes',
    description: 'Pull chosen mesh faces out',
    manual:
      'Pulls the faces of the mesh made from the shapes between this line and its End out along the way they face, each on its own, with new side faces joining them to the rest. A negative distance pushes them in for a dent. Which Faces is a condition checked for every face, and both fields may use [nx], [ny] and [nz] (which way the face points), [cx], [cy] and [cz] (its middle) and [index] (its number). Example: Which Faces [nz] > 0.5 with Distance 0.5 lifts the top of a Cube half a metre.',
    stops: [
      'A Distance that does not give a number.',
      SOLID_SCRIPT_MESH_STOPS_FLAT,
      SOLID_SCRIPT_MESH_STOPS_EMPTY,
      SOLID_SCRIPT_MESH_STOPS_END,
    ],
    nesting: 'open',
    parameters: [
      solidScriptParameter(
        'distance',
        'Distance',
        'number',
        '0.5',
        'Metres to pull each chosen face out. Below 0 pushes it in.',
      ),
      solidScriptParameter(
        'which',
        'Which Faces',
        'condition',
        '[nz] > 0.5',
        'Condition for the faces to pull, such as [nz] > 0.5 for faces pointing up. True pulls every face.',
      ),
    ],
    starter: [{ command: 'cube', values: {} }],
    listing: (read) => ['Extrude Faces', 'by ', read.value('distance'), ' where ', read.value('which')],
    execute: (run) =>
      solidScriptMeshTool(run, 'Extrude Faces', (mesh) =>
        solidScriptMeshExtrudeFaces(mesh, (centre, normal, index) => {
          const facts = { nx: normal.x, ny: normal.y, nz: normal.z, cx: centre.x, cy: centre.y, cz: centre.z, index };
          if (!solidScriptValueTruthy(run.valueWith('which', facts))) return null;
          return solidScriptMeshNumber(run.valueWith('distance', facts), 'Distance');
        }),
      ),
  }),
  new SolidScriptCommand({
    id: 'box_uvs',
    label: 'Box UVs',
    category: 'Meshes',
    description: 'Give mesh faces even texture coordinates',
    manual:
      'Gives every face of the mesh made from the shapes between this line and its End texture coordinates projected from the side it faces most, like wrapping it in a box of texture, so the texture keeps one size everywhere. Size is how many metres one texture repeat covers. Example: Box UVs with size 2 around a displaced rock shows the texture every two metres.',
    stops: [
      'A Size of 0 or less.',
      SOLID_SCRIPT_MESH_STOPS_FLAT,
      SOLID_SCRIPT_MESH_STOPS_EMPTY,
      SOLID_SCRIPT_MESH_STOPS_END,
    ],
    nesting: 'open',
    parameters: [solidScriptParameter('size', 'Size', 'number', '1', 'Metres covered by one texture repeat.')],
    starter: [{ command: 'cube', values: {} }],
    listing: (read) => ['Box UVs', 'size ', read.value('size')],
    execute: (run) => {
      const size = solidScriptMeshNumber(run.value('size'), 'Size');
      if (!(size > 0)) throw new Error(`Size must be greater than 0, not ${size}`);
      return solidScriptMeshTool(run, 'Box UVs', (mesh) => solidScriptMeshBoxUvs(mesh, size));
    },
  }),
  new SolidScriptCommand({
    id: 'flip_faces',
    label: 'Flip Faces',
    category: 'Meshes',
    description: 'Turn mesh faces to show the other side',
    manual:
      'Turns every face of the mesh made from the shapes between this line and its End around, so it shows its other side. Use it when a mesh looks inside out, or to see a box from the inside, such as a sky box or a cave. Example: a large Cube inside Flip Faces is a room seen from within.',
    stops: [SOLID_SCRIPT_MESH_STOPS_FLAT, SOLID_SCRIPT_MESH_STOPS_EMPTY, SOLID_SCRIPT_MESH_STOPS_END],
    nesting: 'open',
    parameters: [],
    starter: [{ command: 'cube', values: {} }],
    listing: () => ['Flip Faces'],
    execute: (run) =>
      solidScriptMeshTool(run, 'Flip Faces', (mesh) => ({
        ...mesh,
        faces: mesh.faces.map((face) => [...face].reverse()),
        uvs: mesh.uvs.map((uv) => (uv ? [...uv].reverse() : null)),
      })),
  }),
];
