import { triangulateSimplePolygon3d } from '@/mesh/convert/mesh_polygon_triangulate.js';
import { SolidScriptCommand } from './solid_script_command.js';
import { solidScriptListingOf } from './solid_script_command_listing.js';
import { solidScriptParameterOfWhere } from './solid_script_command_of_where.js';
import { solidScriptParameterInto, solidScriptParameterOf } from './solid_script_command_parameters.js';
import { solidScriptFaceGroups, solidScriptFaceTargets, solidScriptFaceWrite } from './solid_script_face_of.js';
import { solidScriptGeometryFacesDelete } from '@/solid_script/language/solid_script_geometry.js';
import type { SolidScriptShape } from '@/solid_script/language/solid_script_shape.js';
import type { SolidScriptValue } from '@/solid_script/language/solid_script_value.js';
import type { SolidScriptBlockRun } from '@/solid_script/language/solid_script_machine_types.js';
import { SOLID_SCRIPT_MESH_NEEDS_WRAP, type SolidScriptShapeMesh } from '@/solid_script/language/solid_script_mesh.js';
import {
  solidScriptMeshFacesSplit,
  type SolidScriptMeshFacePiece,
} from '@/solid_script/language/solid_script_mesh_face_split.js';

/** A change to the picked faces of one mesh. */
type SolidScriptMeshFacesEdit = (mesh: SolidScriptShapeMesh, faces: ReadonlySet<number>) => SolidScriptShapeMesh;

/**
 * Changes the faces of Of that pass Where, grouped by their mesh. An empty Of
 * uses selected faces, or every face of the selected objects if none are
 * picked.
 *
 * @param run Running line.
 * @param label Line name, for messages.
 * @param edit Change to picked faces.
 */
function solidScriptMeshFacesApply(run: SolidScriptBlockRun, label: string, edit: SolidScriptMeshFacesEdit): void {
  const selected = run.selectedGet('faces').length > 0 ? 'faces' : 'objects';
  const faces = solidScriptFaceTargets(run, label, selected);
  for (const [leaf, held] of solidScriptFaceGroups(faces, (face) => face.leaf)) {
    if (leaf.kind !== 'mesh') throw new Error(SOLID_SCRIPT_MESH_NEEDS_WRAP);
    run.leafReplace(leaf, edit(leaf, new Set(held.map((face) => face.index))));
  }
}

/**
 * Turns picked faces to face the other way, keeping their corner UVs in order.
 *
 * @param mesh Mesh.
 * @param faces Picked faces.
 * @returns Changed mesh.
 */
function solidScriptMeshFacesFlip(mesh: SolidScriptShapeMesh, faces: ReadonlySet<number>): SolidScriptShapeMesh {
  const pieces = new Map<number, SolidScriptMeshFacePiece[]>();
  for (const face of faces) pieces.set(face, [(mesh.faces[face] ?? []).map((_, index) => index).reverse()]);
  return solidScriptMeshFacesSplit(mesh, pieces);
}

/**
 * Splits picked polygons into triangles with the editor's triangulator, which
 * keeps the winding and supports concave faces.
 *
 * @param mesh Mesh.
 * @param faces Picked faces.
 * @returns Mesh with the picked faces triangulated.
 */
function solidScriptMeshFacesTriangulate(mesh: SolidScriptShapeMesh, faces: ReadonlySet<number>): SolidScriptShapeMesh {
  const pieces = new Map<number, SolidScriptMeshFacePiece[]>();
  for (const face of faces) {
    const loop = mesh.faces[face] ?? [];
    const flat = triangulateSimplePolygon3d(loop.flatMap((index) => mesh.points[index] ?? []));
    pieces.set(
      face,
      Array.from({ length: flat.length / 3 }, (_, index) => flat.slice(index * 3, index * 3 + 3)),
    );
  }
  return solidScriptMeshFacesSplit(mesh, pieces);
}

/**
 * Cuts the picked faces of one mesh off: the old mesh keeps the rest, unless
 * every face is picked, which leaves it whole.
 *
 * @param run Running line.
 * @param leaf Mesh.
 * @param picked Numbers of the picked faces.
 * @returns The cut-off piece and the mesh left, or null when it stays whole.
 */
function solidScriptMeshSeparateOne(
  run: SolidScriptBlockRun,
  leaf: SolidScriptShapeMesh,
  picked: ReadonlySet<number>,
): { piece: SolidScriptShapeMesh; rest: SolidScriptShapeMesh } | null {
  if (picked.size === leaf.faces.length) return null;
  const others = new Set(leaf.faces.map((_, index) => index).filter((index) => !picked.has(index)));
  const rest = solidScriptGeometryFacesDelete(leaf, picked);
  run.leafReplace(leaf, rest);
  return { piece: solidScriptGeometryFacesDelete(leaf, others), rest };
}

/**
 * Cuts the picked faces of each mesh off into a new mesh with the same Name,
 * texture and mode; the faces left stay in the old one.
 *
 * @param run Running line.
 * @returns New meshes.
 */
function solidScriptMeshSeparate(run: SolidScriptBlockRun): SolidScriptShape[] {
  const selected = run.selectedGet('faces').length > 0 ? 'faces' : 'objects';
  const pieces: SolidScriptShapeMesh[] = [];
  const kept: SolidScriptValue[] = [];
  for (const [leaf, held] of solidScriptFaceGroups(
    solidScriptFaceTargets(run, 'Separate Mesh', selected),
    (face) => face.leaf,
  )) {
    if (leaf.kind !== 'mesh') throw new Error(SOLID_SCRIPT_MESH_NEEDS_WRAP);
    const split = solidScriptMeshSeparateOne(run, leaf, new Set(held.map((face) => face.index)));
    if (!split) continue;
    pieces.push(split.piece);
    kept.push(run.elements.brush(split.rest));
  }
  const adopted = run.adopted(pieces);
  const made = pieces.filter((piece) => adopted.includes(piece)).map((piece) => run.elements.brush(piece));
  solidScriptFaceWrite(run, 'into', made);
  solidScriptFaceWrite(run, 'rest', kept);
  return adopted;
}

/** Flip Faces and Triangulate work on face selections, not object masks. */
export const SOLID_SCRIPT_COMMANDS_MESH_FACES: readonly SolidScriptCommand[] = [
  new SolidScriptCommand({
    id: 'flip_faces',
    edits: true,
    label: 'Flip Faces',
    category: 'Meshes',
    description: 'Turn mesh faces to show the other side',
    manual:
      'Turns mesh faces around, so they show the other side. Of gives faces, or meshes for every face; empty uses [$Selected.Faces], or all faces of [$Selected.Objects] when no faces are picked. Where is a 🔁 condition a face must pass. UVs stay on the same corners. A solid stops the line: wrap it in Mesh From Solids first. Example: Mesh From Solids around a Cube, then Flip Faces Where [=[$NY] > 0.9] turns only the top inward.',
    stops: ['A solid. Wrap it in Mesh From Solids first.', 'No faces to work on.'],
    parameters: [
      solidScriptParameterOfWhere('Face', '[=[$NY] > 0.9]'),
      solidScriptParameterOf('faces or meshes', '$Selected.Faces', ['Face', 'Object']),
    ],
    listing: (read) => ['Flip Faces', ...solidScriptListingOf(read)],
    execute: (run) => {
      solidScriptMeshFacesApply(run, 'Flip Faces', solidScriptMeshFacesFlip);
      return [];
    },
  }),
  new SolidScriptCommand({
    id: 'triangulate',
    edits: true,
    label: 'Triangulate',
    category: 'Meshes',
    description: 'Split mesh faces into triangles',
    manual:
      'Splits polygons into triangles without moving any corners. Concave faces keep their notches. Of gives faces, or meshes for every face; empty uses [$Selected.Faces], or all faces of [$Selected.Objects] when no faces are picked. Where is a 🔁 condition a face must pass. Each triangle keeps the UVs and tags of its face. A solid stops the line: wrap it in Mesh From Solids first. Example: Mesh From Solids around a Cube, then Triangulate Where [=[$NY] > 0.9] splits only the top into two triangles.',
    stops: ['A solid. Wrap it in Mesh From Solids first.', 'No faces to work on.'],
    parameters: [
      solidScriptParameterOfWhere('Face', '[=[$NY] > 0.9]'),
      solidScriptParameterOf('faces or meshes', '$Selected.Faces', ['Face', 'Object']),
    ],
    listing: (read) => ['Triangulate', ...solidScriptListingOf(read)],
    execute: (run) => {
      solidScriptMeshFacesApply(run, 'Triangulate', solidScriptMeshFacesTriangulate);
      return [];
    },
  }),
  new SolidScriptCommand({
    id: 'separate_mesh',
    edits: true,
    label: 'Separate Mesh',
    category: 'Meshes',
    description: 'Split mesh faces off into a mesh of their own',
    manual:
      'Cuts the picked faces of each mesh off into a new mesh, with the same Name, texture and mode, and leaves the other faces in the old one. Of gives faces, or meshes for every face; empty uses [$Selected.Faces], or all faces of [$Selected.Objects] when no faces are picked. Where is a 🔁 condition a face must pass to go. A mesh whose faces all go stays whole. Into gets the new meshes and Rest the meshes left behind. A solid stops the line: wrap it in Mesh From Solids first. Example: Mesh From Solids around a Cube, then Separate Mesh Where [=[$NY] > 0.9] Into [Lid] Rest [Box], and Move By 0, 1, 0 Of [Lid] lifts the lid off.',
    stops: ['A solid. Wrap it in Mesh From Solids first.', 'No faces to work on.'],
    parameters: [
      solidScriptParameterOfWhere('Face', '[=[$NY] > 0.9]'),
      solidScriptParameterOf('faces or meshes', '$Selected.Faces', ['Face', 'Object']),
      solidScriptParameterInto('the new meshes, an Object list', 'Object List', 'what is made', 'label'),
      {
        ...solidScriptParameterInto('the meshes left behind, an Object list', 'Object List', 'what is left', 'label'),
        key: 'rest',
        label: 'Rest',
        hint: 'Optional: variable to write the meshes the faces were cut from, an Object list, such as Box; left off writes none.',
      },
    ],
    listing: (read) => [
      'Separate Mesh',
      ...solidScriptListingOf(read),
      ...(read.text('into') === '' ? [] : [' Into ', read.value('into')]),
      ...(read.text('rest') === '' ? [] : [' Rest ', read.value('rest')]),
    ],
    execute: solidScriptMeshSeparate,
  }),
];
