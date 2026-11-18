import * as THREE from 'three';
import { SolidScriptCommand } from './solid_script_command.js';
import {
  solidScriptParameter,
  solidScriptParameterOf,
  solidScriptParameterOptional,
  solidScriptParameterWhen,
  solidScriptParameterWords,
} from './solid_script_command_parameters.js';
import { solidScriptFaceGroups, solidScriptFaceTargets } from './solid_script_face_of.js';
import type { SolidScriptBlockRun } from '@/solid_script/language/solid_script_machine_types.js';
import type { SolidScriptFaceFacts } from '@/solid_script/language/solid_script_geometry.js';
import type { SolidScriptGeometryLeaf } from '@/solid_script/language/solid_script_geometry.js';
import {
  solidScriptValueNumber,
  solidScriptValueNumbers,
  solidScriptValueText,
} from '@/solid_script/language/solid_script_value.js';
import {
  solidScriptFaceCornerUvs,
  solidScriptFaceUvMatrix,
  solidScriptFaceUvRecord,
  solidScriptFaceUvsFit,
  solidScriptLeafCentre,
  solidScriptMeshFaceUvsWrite,
  solidScriptSolidFaceUvsWrite,
} from '@/solid_script/language/solid_script_uvs.js';
import {
  TEXTURE_UV_PROJECT_FRONT,
  TEXTURE_UV_PROJECT_OVERHEAD,
  TEXTURE_UV_PROJECT_SIDE,
  textureUvProjectAxis,
  textureUvProjectPoint,
  textureUvProjectView,
} from '@/texture/uv_project/texture_uv_project_view.js';
import { textureUvProjectPlanar } from '@/texture/uv_project/texture_uv_project_planar.js';
import {
  textureUvProjectCylinderPoint,
  textureUvProjectFitFace,
  textureUvProjectSpherePoint,
} from '@/texture/uv_project/texture_uv_project_radial.js';
import { textureUvUnwrapFace } from '@/texture/uv_project/texture_uv_unwrap.js';
import { textureUvPackIslands } from '@/texture/uv_project/texture_uv_pack.js';
import {
  textureUvTransformMatrix,
  textureUvTransformPoint,
  type TextureUvTransform,
} from '@/texture/uv_project/texture_uv_transform.js';
import type { SurfaceUvMatrix } from '@/texture/uv_matrix/surface_uv_matrix.js';

/** Commands that project, unwrap, pack and transform texture coordinates. */
export const SOLID_SCRIPT_COMMANDS_UVS: readonly SolidScriptCommand[] = [
  new SolidScriptCommand({
    id: 'project_uvs',
    label: 'Project UVs',
    category: 'Faces',
    description: 'Give faces texture coordinates from a box, plane, cylinder or sphere',
    manual:
      "Gives faces texture coordinates projected from a Mode: Box (the same Axis views as Bevel: Overhead, Front or Side, picked from the way the face looks), Planar (one plane, From Face, Overhead, Front or Side), Cylinder or Sphere. Size is metres of one texture repeat. Space is Local (from the shape's centre, so a move keeps the mapping) or World (from the script origin, the same World axes as Bevel). Cylinder and Sphere take Axis and an optional Center (empty uses the shape's centre); a brush face gets a fitted planar map, a mesh face gets exact corner coordinates. Of gives the faces, or brushes for all their faces; empty uses [$Selected.Faces]. Brushes stay brushes; meshes stay meshes. Example: Cube, Select Faces, Project UVs Mode Box Size 1 wraps each side from the way it faces.",
    stops: [
      'No faces.',
      'A Size of 0 or less.',
      'A Mode other than Box, Planar, Cylinder or Sphere.',
      'A Space other than Local or World.',
      'A From other than Face, Overhead, Front or Side.',
    ],
    parameters: [
      solidScriptParameterWords('mode', 'Mode', 'text', 'Box', 'How the coordinates are projected.', [
        { word: 'Box', detail: "Each face uses the closest of Bevel's Overhead, Front and Side views" },
        { word: 'Planar', detail: 'Every face uses one plane' },
        { word: 'Cylinder', detail: 'Around an axis, height along it' },
        { word: 'Sphere', detail: 'Around a centre, from the +axis pole' },
      ]),
      solidScriptParameter('size', 'Size', 'number', '1', 'Metres covered by one texture repeat.'),
      solidScriptParameterWhen(
        solidScriptParameterWords(
          'space',
          'Space',
          'text',
          'Local',
          'Local follows the shape; World stays fixed to the script, as in Bevel.',
          [
            { word: 'Local', detail: 'Follows the shape, from its centre' },
            { word: 'World', detail: 'Stays fixed to the script origin' },
          ],
        ),
        'mode',
        ['Box', 'Planar'],
      ),
      solidScriptParameterWhen(
        solidScriptParameterWords('from', 'From', 'text', 'Face', 'The plane Planar projects from.', [
          { word: 'Face', detail: "Each face's own plane" },
          { word: 'Overhead', detail: 'From above, X and Z, as in Bevel' },
          { word: 'Front', detail: 'From the front, X and Y, as in Bevel' },
          { word: 'Side', detail: 'From the side, Z and Y, as in Bevel' },
        ]),
        'mode',
        ['Planar'],
      ),
      solidScriptParameterWhen(
        solidScriptParameter('axis', 'Axis', 'vector3', '0, 1, 0', 'The cylinder or sphere axis.'),
        'mode',
        ['Cylinder', 'Sphere'],
      ),
      solidScriptParameterWhen(
        solidScriptParameterOptional(
          'center',
          'Center',
          'vector3',
          "A point on the axis, or the sphere centre; empty uses the shape's centre.",
        ),
        'mode',
        ['Cylinder', 'Sphere'],
      ),
      solidScriptParameterOf('faces or brushes', '$Selected.Faces'),
    ],
    listing: (read) => [
      'Project UVs',
      ' ',
      read.value('mode'),
      ' size ',
      read.value('size'),
      ...(read.text('of') === '' ? [] : [' Of ', read.value('of')]),
    ],
    execute: (run) => {
      solidScriptUvsProject(run, solidScriptFaceTargets(run, 'Project UVs'));
      return [];
    },
  }),
  new SolidScriptCommand({
    id: 'unwrap',
    label: 'Unwrap',
    category: 'Faces',
    description: 'Lay each face flat in UV space',
    manual:
      "Gives each face its own UV island, projected onto the face's plane with the editor's planar basis, shifted so the lowest U and V are 0. Size is metres of one texture repeat. Of gives the faces, or brushes for all their faces; empty uses [$Selected.Faces]. Brushes stay brushes; meshes stay meshes. Use Pack Islands afterwards to fit the islands into 0 to 1. Example: Cube, Select Faces, Unwrap, Pack Islands.",
    stops: ['No faces.', 'A Size of 0 or less.'],
    parameters: [
      solidScriptParameter('size', 'Size', 'number', '1', 'Metres covered by one texture repeat.'),
      solidScriptParameterOf('faces or brushes', '$Selected.Faces'),
    ],
    listing: (read) => [
      'Unwrap',
      ' size ',
      read.value('size'),
      ...(read.text('of') === '' ? [] : [' Of ', read.value('of')]),
    ],
    execute: (run) => {
      solidScriptUvsUnwrap(run, solidScriptFaceTargets(run, 'Unwrap'));
      return [];
    },
  }),
  new SolidScriptCommand({
    id: 'pack_islands',
    label: 'Pack Islands',
    category: 'Faces',
    description: 'Fit UV islands into 0 to 1',
    manual:
      "Packs the UV islands of the faces into the 0 to 1 square, keeping each island's shape, with a small gap between them. Of gives the faces, or brushes for all their faces; empty uses [$Selected.Faces]. Brushes stay brushes; meshes stay meshes. Example: Unwrap, then Pack Islands.",
    stops: ['No faces.'],
    parameters: [solidScriptParameterOf('faces or brushes', '$Selected.Faces')],
    listing: (read) => ['Pack Islands', ...(read.text('of') === '' ? [] : [' Of ', read.value('of')])],
    execute: (run) => {
      solidScriptUvsPack(run, solidScriptFaceTargets(run, 'Pack Islands'));
      return [];
    },
  }),
  new SolidScriptCommand({
    id: 'transform_uvs',
    label: 'Transform UVs',
    category: 'Faces',
    description: 'Move, scale or rotate texture coordinates',
    manual:
      "Offsets, scales and rotates the UV mapping of the faces in UV space. Offset is added after Scale and Rotate. Pivot is Center (the middle of the faces' UVs), Tile (the middle of the texture tile under that centre, as in Bevel) or Origin (0, 0). Of gives the faces, or brushes for all their faces; empty uses [$Selected.Faces]. Brushes stay brushes; meshes stay meshes. Example: Project UVs, then Transform UVs Offset 0.5, 0 Rotate 90.",
    stops: ['No faces.', 'A Pivot other than Center, Tile or Origin.'],
    parameters: [
      solidScriptParameter('offset', 'Offset', 'vector3', '0, 0, 0', 'Added to U and V; Z is ignored.'),
      solidScriptParameter('scale', 'Scale', 'vector3', '1, 1, 1', 'Multiplier of U and V; Z is ignored.'),
      solidScriptParameter('rotate', 'Rotate', 'number', '0', 'Rotation around the pivot, in degrees.'),
      solidScriptParameterWords('pivot', 'Pivot', 'text', 'Center', 'The point Scale and Rotate turn about.', [
        { word: 'Center', detail: "The middle of the faces' UVs" },
        { word: 'Tile', detail: 'The middle of the texture tile, as in Bevel' },
        { word: 'Origin', detail: 'U 0, V 0' },
      ]),
      solidScriptParameterOf('faces or brushes', '$Selected.Faces'),
    ],
    listing: (read) => [
      'Transform UVs',
      ' offset ',
      read.value('offset'),
      ' scale ',
      read.value('scale'),
      ' rotate ',
      read.value('rotate'),
      ...(read.text('of') === '' ? [] : [' Of ', read.value('of')]),
    ],
    execute: (run) => {
      solidScriptUvsTransform(run, solidScriptFaceTargets(run, 'Transform UVs'));
      return [];
    },
  }),
];

/**
 * Reads Size and stops when it is not a number greater than 0.
 *
 * @param run Running line.
 * @param label Command, for messages.
 * @returns Size in metres.
 */
function solidScriptUvsSize(run: SolidScriptBlockRun, label: string): number {
  const size = solidScriptValueNumber(run.value('size'));
  if (size === undefined) throw new Error(`${label} needs a Size in metres, such as 1`);
  if (!(size > 0)) throw new Error(`Size must be greater than 0, not ${size}`);
  return size;
}

/**
 * Reads a vector field as numbers, or the fallback when the field is empty.
 *
 * @param run Running line.
 * @param key Field key.
 * @param fallback Used when the field is empty.
 * @param label Field caption, for messages.
 * @returns Three numbers.
 */
function solidScriptUvsVector(
  run: SolidScriptBlockRun,
  key: string,
  fallback: [number, number, number],
  label: string,
): THREE.Vector3 {
  const text = solidScriptValueText(run.value(key)).trim();
  if (text === '') return new THREE.Vector3(...fallback);
  const numbers = solidScriptValueNumbers(run.value(key));
  const x = numbers?.[0];
  const y = numbers?.[1];
  const z = numbers?.[2];
  if (x === undefined || y === undefined || z === undefined || numbers?.length !== 3)
    throw new Error(`${label} needs three numbers, such as 0, 1, 0`);
  return new THREE.Vector3(x, y, z);
}

/**
 * Projects the given faces and writes the mapping onto each leaf.
 *
 * @param run Running line.
 * @param faces Faces to project.
 */
function solidScriptUvsProject(run: SolidScriptBlockRun, faces: readonly SolidScriptFaceFacts[]): void {
  const size = solidScriptUvsSize(run, 'Project UVs');
  const mode = solidScriptValueText(run.value('mode')).trim() || 'Box';
  const folded = mode.toLowerCase();
  for (const [leaf, group] of solidScriptFaceGroups(faces, (face) => face.leaf)) {
    const origin = solidScriptUvsOrigin(run, mode, leaf);
    if ((folded === 'cylinder' || folded === 'sphere') && leaf.kind === 'mesh') {
      const project = solidScriptUvsRadialProject(run, folded, size, origin);
      solidScriptUvsWriteCorners(
        run,
        leaf,
        group.map((face) => ({ face, uvs: face.corners.map(project) })),
      );
      continue;
    }
    solidScriptUvsWriteLeaf(run, leaf, group, (face) => solidScriptUvsProjectFace(run, face, mode, size, origin));
  }
}

/**
 * Chooses the origin of a Local mapping, or the script origin for World.
 *
 * @param run Running line.
 * @param mode Mode word.
 * @param leaf Solid or mesh.
 * @returns Origin in script space.
 */
function solidScriptUvsOrigin(run: SolidScriptBlockRun, mode: string, leaf: SolidScriptGeometryLeaf): THREE.Vector3 {
  const folded = mode.toLowerCase();
  if (folded === 'cylinder' || folded === 'sphere') {
    const text = solidScriptValueText(run.value('center')).trim();
    return text === '' ? solidScriptLeafCentre(leaf) : solidScriptUvsVector(run, 'center', [0, 0, 0], 'Center');
  }
  const space = solidScriptValueText(run.value('space')).trim() || 'Local';
  if (space.toLowerCase() === 'world') return new THREE.Vector3();
  if (space.toLowerCase() !== 'local') throw new Error(`Space must be Local or World, not ${space}`);
  return solidScriptLeafCentre(leaf);
}

/**
 * Builds the UV matrix of one face for Project UVs.
 *
 * @param run Running line.
 * @param face Face facts.
 * @param mode Mode word.
 * @param size Metres per repeat.
 * @param origin Projection origin.
 * @returns Matrix for a brush face, or null to write corner UVs on a mesh only.
 */
function solidScriptUvsProjectFace(
  run: SolidScriptBlockRun,
  face: SolidScriptFaceFacts,
  mode: string,
  size: number,
  origin: THREE.Vector3,
): SurfaceUvMatrix {
  const folded = mode.toLowerCase();
  if (folded === 'box') return textureUvProjectAxis(face.normal, size, origin);
  if (folded === 'planar') return solidScriptUvsPlanar(run, face, size, origin);
  if (folded === 'cylinder' || folded === 'sphere') return solidScriptUvsRadial(run, face, folded, size, origin);
  throw new Error(`Mode must be Box, Planar, Cylinder or Sphere, not ${mode}`);
}

/**
 * Builds a Planar mapping from From and the face.
 *
 * @param run Running line.
 * @param face Face facts.
 * @param size Metres per repeat.
 * @param origin Projection origin.
 * @returns Matrix.
 */
function solidScriptUvsPlanar(
  run: SolidScriptBlockRun,
  face: SolidScriptFaceFacts,
  size: number,
  origin: THREE.Vector3,
): SurfaceUvMatrix {
  const from = solidScriptValueText(run.value('from')).trim() || 'Face';
  const folded = from.toLowerCase();
  if (folded === 'face') return textureUvProjectPlanar(face.normal, size, origin);
  if (folded === 'overhead') return textureUvProjectView(TEXTURE_UV_PROJECT_OVERHEAD, size, origin);
  if (folded === 'front') return textureUvProjectView(TEXTURE_UV_PROJECT_FRONT, size, origin);
  if (folded === 'side') return textureUvProjectView(TEXTURE_UV_PROJECT_SIDE, size, origin);
  throw new Error(`From must be Face, Overhead, Front or Side, not ${from}`);
}

/**
 * Projects one point for Cylinder or Sphere mode.
 *
 * @param run Running line.
 * @param mode Cylinder or sphere, folded.
 * @param size Metres per repeat.
 * @param origin Center.
 * @returns Projector.
 */
function solidScriptUvsRadialProject(
  run: SolidScriptBlockRun,
  mode: string,
  size: number,
  origin: THREE.Vector3,
): (point: THREE.Vector3) => [number, number] {
  const axis = solidScriptUvsVector(run, 'axis', [0, 1, 0], 'Axis');
  if (axis.lengthSq() <= 1e-16) throw new Error('Axis must not be a zero vector');
  axis.normalize();
  return mode === 'sphere'
    ? (point: THREE.Vector3) => textureUvProjectSpherePoint(point, axis, origin, size, 1)
    : (point: THREE.Vector3) => textureUvProjectCylinderPoint(point, axis, origin, size, 1);
}

/**
 * Fits a cylinder or sphere mapping to a face's corners.
 *
 * @param run Running line.
 * @param face Face facts.
 * @param mode Cylinder or sphere, folded.
 * @param size Metres per repeat.
 * @param origin Center.
 * @returns Fitted matrix.
 */
function solidScriptUvsRadial(
  run: SolidScriptBlockRun,
  face: SolidScriptFaceFacts,
  mode: string,
  size: number,
  origin: THREE.Vector3,
): SurfaceUvMatrix {
  const fitted = textureUvProjectFitFace(face.corners, solidScriptUvsRadialProject(run, mode, size, origin));
  if (!fitted) throw new Error('Cylinder and Sphere need a face with at least three corners');
  return fitted;
}

/**
 * Writes a projection onto a solid as records, or onto a mesh as corner UVs.
 *
 * @param run Running line.
 * @param leaf Solid or mesh.
 * @param faces Faces of this leaf.
 * @param matrix Of one face.
 */
function solidScriptUvsWriteLeaf(
  run: SolidScriptBlockRun,
  leaf: SolidScriptGeometryLeaf,
  faces: readonly SolidScriptFaceFacts[],
  matrix: (face: SolidScriptFaceFacts) => SurfaceUvMatrix,
): void {
  const latest = run.leafLatest(leaf);
  if (latest.kind === 'solid') {
    solidScriptUvsWriteSolid(run, latest, faces, matrix);
    return;
  }
  if (latest.kind === 'mesh') solidScriptUvsWriteMesh(run, latest, faces, matrix);
}

/**
 * Writes fitted UV records onto a solid.
 *
 * @param run Running line.
 * @param leaf Solid.
 * @param faces Faces of this solid.
 * @param matrix Of one face.
 */
function solidScriptUvsWriteSolid(
  run: SolidScriptBlockRun,
  leaf: Extract<SolidScriptGeometryLeaf, { kind: 'solid' }>,
  faces: readonly SolidScriptFaceFacts[],
  matrix: (face: SolidScriptFaceFacts) => SurfaceUvMatrix,
): void {
  run.leafReplace(
    leaf,
    solidScriptSolidFaceUvsWrite(
      leaf,
      faces.map((face) => solidScriptFaceUvRecord(face, matrix(face))),
    ),
  );
}

/**
 * Writes corner UVs from a matrix onto a mesh.
 *
 * @param run Running line.
 * @param leaf Mesh.
 * @param faces Faces of this mesh.
 * @param matrix Of one face.
 */
function solidScriptUvsWriteMesh(
  run: SolidScriptBlockRun,
  leaf: Extract<SolidScriptGeometryLeaf, { kind: 'mesh' }>,
  faces: readonly SolidScriptFaceFacts[],
  matrix: (face: SolidScriptFaceFacts) => SurfaceUvMatrix,
): void {
  let mesh = leaf;
  for (const face of faces) {
    const mapping = matrix(face);
    mesh = solidScriptMeshFaceUvsWrite(
      mesh,
      face.index,
      face.corners.map((corner) => textureUvProjectPoint(mapping, corner)),
    );
  }
  run.leafReplace(leaf, mesh);
}

/**
 * Unwraps the given faces.
 *
 * @param run Running line.
 * @param faces Faces to unwrap.
 */
function solidScriptUvsUnwrap(run: SolidScriptBlockRun, faces: readonly SolidScriptFaceFacts[]): void {
  const size = solidScriptUvsSize(run, 'Unwrap');
  for (const [leaf, group] of solidScriptFaceGroups(faces, (face) => face.leaf)) {
    solidScriptUvsWriteLeaf(run, leaf, group, (face) => {
      const mapped = textureUvUnwrapFace(face.corners, face.normal, size);
      if (!mapped) throw new Error('Unwrap needs a face with at least one corner');
      return mapped;
    });
  }
}

/**
 * Packs the UV islands of the given faces into 0 to 1.
 *
 * @param run Running line.
 * @param faces Faces to pack.
 */
function solidScriptUvsPack(run: SolidScriptBlockRun, faces: readonly SolidScriptFaceFacts[]): void {
  const islands = faces.map((face) => solidScriptFaceCornerUvs(face));
  const packed = textureUvPackIslands(islands);
  for (const [leaf, group] of solidScriptFaceGroups(
    faces.map((face, index) => ({ face, index })),
    (item) => item.face.leaf,
  )) {
    solidScriptUvsWriteCorners(
      run,
      leaf,
      group.map((item) => ({ face: item.face, uvs: packed[item.index] ?? solidScriptFaceCornerUvs(item.face) })),
    );
  }
}

/**
 * Writes explicit corner UVs onto a solid (by fitting a matrix) or a mesh.
 *
 * @param run Running line.
 * @param leaf Solid or mesh.
 * @param faces Faces and their corner UVs.
 */
function solidScriptUvsWriteCorners(
  run: SolidScriptBlockRun,
  leaf: SolidScriptGeometryLeaf,
  faces: readonly { face: SolidScriptFaceFacts; uvs: readonly [number, number][] }[],
): void {
  const latest = run.leafLatest(leaf);
  if (latest.kind === 'mesh') {
    let mesh = latest;
    for (const item of faces) mesh = solidScriptMeshFaceUvsWrite(mesh, item.face.index, item.uvs);
    run.leafReplace(latest, mesh);
    return;
  }
  if (latest.kind !== 'solid') return;
  run.leafReplace(
    latest,
    solidScriptSolidFaceUvsWrite(
      latest,
      faces.map((item) => solidScriptUvsFitCorners(item.face, item.uvs)),
    ),
  );
}

/**
 * Fits a matrix to given corner UVs of a face, or stops when they are not a
 * planar mapping.
 *
 * @param face Face facts.
 * @param uvs Corner UVs in order.
 * @returns Fitted matrix record.
 */
function solidScriptUvsFitCorners(
  face: SolidScriptFaceFacts,
  uvs: readonly [number, number][],
): ReturnType<typeof solidScriptFaceUvRecord> {
  return solidScriptFaceUvsFit(face, uvs);
}

/**
 * Transforms the UVs of the given faces.
 *
 * @param run Running line.
 * @param faces Faces to transform.
 */
function solidScriptUvsTransform(run: SolidScriptBlockRun, faces: readonly SolidScriptFaceFacts[]): void {
  const transform = solidScriptUvsTransformValues(run, faces);
  for (const [leaf, group] of solidScriptFaceGroups(faces, (face) => face.leaf)) {
    const latest = run.leafLatest(leaf);
    if (latest.kind === 'solid') solidScriptUvsTransformSolid(run, latest, group, transform);
    else
      solidScriptUvsWriteCorners(
        run,
        latest,
        group.map((face) => ({
          face,
          uvs: solidScriptFaceCornerUvs(face).map((uv) => textureUvTransformPoint(uv, transform)),
        })),
      );
  }
}

/**
 * Applies a UV transform to stored records of a solid.
 *
 * @param run Running line.
 * @param leaf Solid.
 * @param faces Faces of this solid.
 * @param transform Transform.
 */
function solidScriptUvsTransformSolid(
  run: SolidScriptBlockRun,
  leaf: Extract<SolidScriptGeometryLeaf, { kind: 'solid' }>,
  faces: readonly SolidScriptFaceFacts[],
  transform: TextureUvTransform,
): void {
  run.leafReplace(
    leaf,
    solidScriptSolidFaceUvsWrite(
      leaf,
      faces.map((face) =>
        solidScriptFaceUvRecord(face, textureUvTransformMatrix(solidScriptFaceUvMatrix(face), transform)),
      ),
    ),
  );
}

/**
 * Reads Offset, Scale, Rotate and Pivot for Transform UVs.
 *
 * @param run Running line.
 * @param faces Faces, for the Center and Tile pivots.
 * @returns Transform.
 */
function solidScriptUvsTransformValues(
  run: SolidScriptBlockRun,
  faces: readonly SolidScriptFaceFacts[],
): TextureUvTransform {
  const offset = solidScriptUvsVector(run, 'offset', [0, 0, 0], 'Offset');
  const scale = solidScriptUvsVector(run, 'scale', [1, 1, 1], 'Scale');
  const rotation = solidScriptValueNumber(run.value('rotate')) ?? 0;
  const [pivotU, pivotV] = solidScriptUvsPivot(run, faces);
  return {
    offsetU: offset.x,
    offsetV: offset.y,
    scaleU: scale.x,
    scaleV: scale.y,
    rotationDeg: rotation,
    pivotU,
    pivotV,
  };
}

/**
 * Reads the UV pivot of Transform UVs.
 *
 * @param run Running line.
 * @param faces Faces, for Center and Tile.
 * @returns Pivot U and V.
 */
function solidScriptUvsPivot(run: SolidScriptBlockRun, faces: readonly SolidScriptFaceFacts[]): [number, number] {
  const pivot = solidScriptValueText(run.value('pivot')).trim() || 'Center';
  const folded = pivot.toLowerCase();
  if (folded === 'origin') return [0, 0];
  const uvs = faces.flatMap((face) => solidScriptFaceCornerUvs(face));
  if (uvs.length === 0) return [0, 0];
  const midU = uvs.reduce((sum, uv) => sum + uv[0], 0) / uvs.length;
  const midV = uvs.reduce((sum, uv) => sum + uv[1], 0) / uvs.length;
  if (folded === 'center') return [midU, midV];
  if (folded === 'tile') return [Math.floor(midU) + 0.5, Math.floor(midV) + 0.5];
  throw new Error(`Pivot must be Center, Tile or Origin, not ${pivot}`);
}
