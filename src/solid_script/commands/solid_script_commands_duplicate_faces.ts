import { SolidScriptCommand } from './solid_script_command.js';
import { solidScriptParameterEach } from './solid_script_command_each.js';
import { solidScriptListingOf } from './solid_script_command_listing.js';
import { solidScriptParameterOfWhere } from './solid_script_command_of_where.js';
import {
  solidScriptParameter,
  solidScriptParameterInto,
  solidScriptParameterOf,
} from './solid_script_command_parameters.js';
import { solidScriptFaceEachNumber } from './solid_script_face_each.js';
import { solidScriptFaceTargets, solidScriptFaceWrite } from './solid_script_face_of.js';
import type { SolidScriptFaceFacts } from '@/solid_script/language/solid_script_geometry.js';
import { SOLID_SCRIPT_LIMITS, solidScriptLimitCount } from '@/solid_script/language/solid_script_limits.js';
import type { SolidScriptBlockRun } from '@/solid_script/language/solid_script_machine_types.js';
import { SOLID_SCRIPT_MESH_NEEDS_WRAP, type SolidScriptShapeMesh } from '@/solid_script/language/solid_script_mesh.js';
import type { SolidScriptShape } from '@/solid_script/language/solid_script_shape.js';

/** Told when Count is not a whole number of 0 or more. */
const SOLID_SCRIPT_DUPLICATE_FACES_COUNT_NEEDS = 'Count needs a whole number of copies of 0 or more, such as 3';

/**
 * Makes a mesh of one face of a mesh, with only that face's corner points and
 * its UVs, and the mesh's name, texture and mode.
 *
 * @param mesh Mesh.
 * @param face Number of the face.
 * @returns One-face mesh.
 */
function solidScriptDuplicateFaceAlone(mesh: SolidScriptShapeMesh, face: number): SolidScriptShapeMesh {
  const loop = mesh.faces[face] ?? [];
  return {
    ...mesh,
    points: loop.map((point) => mesh.points[point]!.clone()),
    faces: [loop.map((_, corner) => corner)],
    uvs: [mesh.uvs[face] ? [...mesh.uvs[face]] : null],
  };
}

/**
 * Reads Count for every face and checks the copies stay within the solid cap.
 *
 * @param run Running line.
 * @param faces Faces to copy.
 * @returns Copies per face.
 */
function solidScriptDuplicateFacesCounts(run: SolidScriptBlockRun, faces: readonly SolidScriptFaceFacts[]): number[] {
  const countOf = solidScriptFaceEachNumber(run, 'count', faces, SOLID_SCRIPT_DUPLICATE_FACES_COUNT_NEEDS, 1);
  const counts = faces.map((face) => countOf(face));
  if (!counts.every((count) => Number.isInteger(count) && count >= 0))
    throw new Error(SOLID_SCRIPT_DUPLICATE_FACES_COUNT_NEEDS);
  if (counts.reduce((sum, count) => sum + count, 0) > SOLID_SCRIPT_LIMITS.brushes)
    throw new Error(
      `this line would make more than ${solidScriptLimitCount(SOLID_SCRIPT_LIMITS.brushes)} meshes. Change the Count, or copy fewer faces.`,
    );
  return counts;
}

/**
 * Copies every picked mesh face Count times, each copy a mesh of its own on top
 * of the face with its copy number from 0 under .Data.Copy; the meshes copied
 * from stay as they are.
 *
 * @param run Running line.
 * @returns The copies placed in the result.
 */
function solidScriptDuplicateFaces(run: SolidScriptBlockRun): SolidScriptShape[] {
  const selected = run.selectedGet('faces').length > 0 ? 'faces' : 'objects';
  const faces = solidScriptFaceTargets(run, 'Duplicate Faces', selected);
  if (faces.some((face) => face.leaf.kind !== 'mesh')) throw new Error(SOLID_SCRIPT_MESH_NEEDS_WRAP);
  const counts = solidScriptDuplicateFacesCounts(run, faces);
  const copies = faces.flatMap((face, index) =>
    Array.from({ length: counts[index] ?? 0 }, (_, copy) => ({
      mesh: solidScriptDuplicateFaceAlone(face.leaf as SolidScriptShapeMesh, face.index),
      copy,
    })),
  );
  const adopted = run.adopted(copies.map(({ mesh }) => mesh));
  const kept = copies.filter(({ mesh }) => adopted.includes(mesh));
  for (const { mesh, copy } of kept)
    run.elements.dataWrite(run.elements.data(run.elements.brush(mesh)), 'copy', 'Copy', copy);
  solidScriptFaceWrite(
    run,
    'into',
    kept.map(({ mesh }) => run.elements.brush(mesh)),
  );
  return adopted;
}

/** Duplicate Faces: loose copies of mesh faces, numbered per copy. */
export const SOLID_SCRIPT_COMMANDS_DUPLICATE_FACES: readonly SolidScriptCommand[] = [
  new SolidScriptCommand({
    id: 'duplicate_faces',
    edits: true,
    label: 'Duplicate Faces',
    category: 'Faces',
    description: 'Copy mesh faces into loose meshes of their own',
    manual:
      'Copies every picked mesh face Count times. Each copy is a mesh of that one face, on top of it, with its corner points, UVs, Name, texture and mode, and the meshes copied from stay as they are. The 🔁 Count may change per face, such as [=[$Index] + 1], and 0 copies none. The copy number of each copy is under [Object.Data.Copy], from 0, so later lines can move each copy by it, such as Move By [=Vector(0, [$Item.Data.Copy] * 0.2, 0)]. Of gives faces, or meshes for every face; empty uses [$Selected.Faces], or all faces of [$Selected.Objects] when no faces are picked. Where is a 🔁 condition a face must pass. Without Into the copies join the result; with Into they are only in that variable, until Output. A solid stops the line: wrap it in Mesh From Solids first. Example: Mesh From Solids around a Cube, then Duplicate Faces Count 3 Where [=[$NY] > 0.9] Into [Tiles] makes three loose copies of the top.',
    stops: [
      'A solid. Wrap it in Mesh From Solids first.',
      'No faces to work on.',
      'A Count that is not a whole number of 0 or more.',
    ],
    parameters: [
      solidScriptParameterEach(
        solidScriptParameter('count', 'Count', 'number', '1', 'Copies of every face, such as 3. Use 0 to copy none.'),
        'Face',
      ),
      solidScriptParameterOfWhere('Face', '[=[$NY] > 0.9]'),
      solidScriptParameterOf('faces or meshes', '$Selected.Faces', ['Face', 'Object']),
      solidScriptParameterInto('the copies, an Object list', 'Object List', 'what is made', 'label'),
    ],
    listing: (read) => [
      'Duplicate Faces',
      ...(read.text('count') === '' ? [] : [' Count ', read.value('count')]),
      ...solidScriptListingOf(read),
      ...(read.text('into') === '' ? [] : [' Into ', read.value('into')]),
    ],
    execute: solidScriptDuplicateFaces,
  }),
];
