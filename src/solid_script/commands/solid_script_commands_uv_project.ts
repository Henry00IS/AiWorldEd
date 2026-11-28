import * as THREE from 'three';
import { SolidScriptCommand, type SolidScriptCommandParameter } from './solid_script_command.js';
import { solidScriptListingOf } from './solid_script_command_listing.js';
import { solidScriptParameterOfWhere } from './solid_script_command_of_where.js';
import {
  solidScriptParameter,
  solidScriptParameterOf,
  solidScriptParameterOptional,
  solidScriptParameterWords,
} from './solid_script_command_parameters.js';
import { solidScriptFaceGroups, solidScriptFaceTargets } from './solid_script_face_of.js';
import {
  solidScriptUvsSize,
  solidScriptUvsWriteCorners,
  solidScriptUvsWriteLeaf,
} from './solid_script_commands_uvs.js';
import { solidScriptUvsVector } from './solid_script_uvs_read.js';
import type { SolidScriptBlockRun } from '@/solid_script/language/solid_script_machine_types.js';
import type { SolidScriptFaceFacts, SolidScriptGeometryLeaf } from '@/solid_script/language/solid_script_geometry.js';
import { solidScriptValueText } from '@/solid_script/language/solid_script_value.js';
import { solidScriptLeafCenter } from '@/solid_script/language/solid_script_uvs.js';
import {
  TEXTURE_UV_PROJECT_FRONT,
  TEXTURE_UV_PROJECT_OVERHEAD,
  TEXTURE_UV_PROJECT_SIDE,
  textureUvProjectAxis,
  textureUvProjectView,
} from '@/texture/uv_project/texture_uv_project_view.js';
import { textureUvProjectPlanar } from '@/texture/uv_project/texture_uv_project_planar.js';
import {
  textureUvProjectCylinderPoint,
  textureUvProjectFitFace,
  textureUvProjectSpherePoint,
} from '@/texture/uv_project/texture_uv_project_radial.js';
import type { SurfaceUvMatrix } from '@/texture/uv_matrix/surface_uv_matrix.js';
import {
  solidScriptUvWrapMatrix,
  solidScriptUvWrapSpace,
  solidScriptUvWrapSurfaces,
  solidScriptUvWrapWhole,
  type SolidScriptUvWrapSpace,
} from './solid_script_uv_wrap.js';

/** The shape a Project UVs block projects from. */
type SolidScriptUvProjection = 'Box' | 'Planar' | 'Cylinder' | 'Sphere';

/** What one Project UVs block differs in. */
interface SolidScriptUvProjectSpec {
  readonly id: string;
  readonly label: string;
  readonly projection: SolidScriptUvProjection;
  readonly description: string;
  readonly manual: string;
  readonly stops: readonly string[];
  readonly fields: readonly SolidScriptCommandParameter[];
}

/** Size, which every projection takes. */
export const SOLID_SCRIPT_UV_PROJECT_SIZE = solidScriptParameter(
  'size',
  'Size',
  'number',
  '1',
  'Metres covered by one texture repeat, such as 1.',
);

/** Space, for the Box and Planar projections. */
const SOLID_SCRIPT_UV_PROJECT_SPACE = solidScriptParameterWords(
  'space',
  'Space',
  'text',
  'Local',
  'Local follows the shape; World stays fixed to the script. Type Local or World, such as Local on a swinging door and World on wallpaper that stays put.',
  [
    { word: 'Local', detail: 'Follows the shape, from its center' },
    { word: 'World', detail: 'Stays fixed to the script origin' },
  ],
);

/** From, the plane of a Planar projection. */
const SOLID_SCRIPT_UV_PROJECT_FROM = solidScriptParameterWords(
  'from',
  'From',
  'text',
  'Face',
  'The plane to project from. Type one word, such as Overhead, or a face such as [Front].',
  [
    { word: 'Face', detail: "Each face's own plane" },
    { word: 'Overhead', detail: 'From above, along X and Z, such as looking down on a floor' },
    { word: 'Front', detail: 'From the front, along X and Y, such as looking at a wall' },
    { word: 'Side', detail: 'From the side, along Z and Y, such as looking from the right' },
  ],
);

/** Axis and Center, for the Cylinder and Sphere projections. */
const SOLID_SCRIPT_UV_PROJECT_RADIAL: readonly SolidScriptCommandParameter[] = [
  solidScriptParameter('axis', 'Axis', 'vector3', '0, 1, 0', 'The axis, such as 0, 1, 0 for upright.'),
  solidScriptParameterOptional(
    'center',
    'Center',
    'vector3',
    "A point on the axis, or the sphere center, such as 0, 0, 0; left off uses the shape's center.",
  ),
];

/** Farthest apart two solids' centers may lie across the axis to wrap as one. */
const SOLID_SCRIPT_UVS_SAME_LINE = 1e-4;

/** The stops every projection shares. */
const SOLID_SCRIPT_UV_PROJECT_STOPS = ['No faces.', 'A Size of 0 or less.'];

/** Text the manuals share about Of and what stays what. */
export const SOLID_SCRIPT_UV_PROJECT_OF =
  'Of gives the faces, or solids for all their faces; empty uses [$Selected.Faces]. Solids stay solids; meshes stay meshes.';

/** Text the Box and Planar manuals share about Space. */
const SOLID_SCRIPT_UV_PROJECT_SPACE_TEXT =
  "Space is Local (from the shape's center, so a move keeps the mapping) or World (from the script origin, along the world axes).";

/** Text the Cylinder and Sphere manuals share about Axis and Center. */
const SOLID_SCRIPT_UV_PROJECT_RADIAL_TEXT =
  'The texture goes around in whole repeats, so the seam closes, with square tiles at the widest ring. Center is a point on Axis; empty wraps each shape around the middle of its corners, and solids stacked on one axis wrap as one. A mesh face gets exact corner coordinates.';

/**
 * Builds one Project UVs block: Size, its own fields, then Where and Of.
 *
 * @param spec What the block differs in.
 * @returns Command.
 */
function solidScriptUvProjectCommand(spec: SolidScriptUvProjectSpec): SolidScriptCommand {
  return new SolidScriptCommand({
    id: spec.id,
    edits: true,
    label: spec.label,
    category: 'UVs',
    description: spec.description,
    synonyms: ['project uvs', 'uv projection', 'texture mapping'],
    manual: spec.manual,
    stops: [...SOLID_SCRIPT_UV_PROJECT_STOPS, ...spec.stops],
    parameters: [
      SOLID_SCRIPT_UV_PROJECT_SIZE,
      ...spec.fields,
      solidScriptParameterOfWhere('Face', '[=[$Face.Normal.Y] > 0.9]'),
      solidScriptParameterOf('faces or objects', '$Selected.Faces'),
    ],
    listing: (read) => [spec.label, ' Size ', read.value('size'), ...solidScriptListingOf(read)],
    execute: (run) => {
      solidScriptUvsProject(run, solidScriptFaceTargets(run, spec.label), spec.projection, spec.label);
      return [];
    },
  });
}

/**
 * Commands that project texture coordinates from a box, plane, cylinder or
 * sphere.
 */
export const SOLID_SCRIPT_COMMANDS_UV_PROJECT: readonly SolidScriptCommand[] = [
  solidScriptUvProjectCommand({
    id: 'project_box_uvs',
    label: 'Project Box UVs',
    projection: 'Box',
    description: 'Give each face texture coordinates from the side of a box it faces most',
    manual: `Gives each face texture coordinates projected from the Overhead, Front or Side view it faces most. Size is metres of one texture repeat. ${SOLID_SCRIPT_UV_PROJECT_SPACE_TEXT} ${SOLID_SCRIPT_UV_PROJECT_OF} Example: Cube, Select Faces, Project Box UVs Size 1 wraps each side from the way it faces.`,
    stops: ['A Space other than Local or World.'],
    fields: [SOLID_SCRIPT_UV_PROJECT_SPACE],
  }),
  solidScriptUvProjectCommand({
    id: 'project_planar_uvs',
    label: 'Project Planar UVs',
    projection: 'Planar',
    description: 'Give faces texture coordinates from one plane',
    manual: `Gives faces texture coordinates projected from one plane: From is Face (each face's own plane), Overhead, Front or Side. Size is metres of one texture repeat. ${SOLID_SCRIPT_UV_PROJECT_SPACE_TEXT} ${SOLID_SCRIPT_UV_PROJECT_OF} Example: Cube, Select Faces, Project Planar UVs Size 2 From Overhead maps a floor tile from above.`,
    stops: ['A Space other than Local or World.', 'A From other than Face, Overhead, Front or Side.'],
    fields: [SOLID_SCRIPT_UV_PROJECT_SPACE, SOLID_SCRIPT_UV_PROJECT_FROM],
  }),
  solidScriptUvProjectCommand({
    id: 'project_cylinder_uvs',
    label: 'Project Cylinder UVs',
    projection: 'Cylinder',
    description: 'Wrap a texture around an axis and up the surface',
    manual: `Gives faces texture coordinates wrapped around Axis and up the surface from the bottom, the way the built-in round generators wrap theirs; flat ends get a mapping centred on the axis. Size is about the metres of one texture repeat. ${SOLID_SCRIPT_UV_PROJECT_RADIAL_TEXT} ${SOLID_SCRIPT_UV_PROJECT_OF} Example: Cylinder, Select Faces, Project Cylinder UVs Size 1 wraps bark around a trunk.`,
    stops: ['An Axis of 0, 0, 0.'],
    fields: SOLID_SCRIPT_UV_PROJECT_RADIAL,
  }),
  solidScriptUvProjectCommand({
    id: 'project_sphere_uvs',
    label: 'Project Sphere UVs',
    projection: 'Sphere',
    description: 'Give faces texture coordinates around a center, from the +axis pole',
    manual: `Gives faces texture coordinates around a center, from the pole at the + end of Axis. Size is about the metres of one texture repeat. ${SOLID_SCRIPT_UV_PROJECT_RADIAL_TEXT} ${SOLID_SCRIPT_UV_PROJECT_OF} Example: Sphere, Select Faces, Project Sphere UVs Size 1 maps a globe.`,
    stops: ['An Axis of 0, 0, 0.'],
    fields: SOLID_SCRIPT_UV_PROJECT_RADIAL,
  }),
];

/**
 * Projects the given faces and writes the mapping onto each leaf.
 *
 * @param run Running line.
 * @param faces Faces to project.
 * @param projection Shape to project from.
 * @param label Command, for messages.
 */
function solidScriptUvsProject(
  run: SolidScriptBlockRun,
  faces: readonly SolidScriptFaceFacts[],
  projection: SolidScriptUvProjection,
  label: string,
): void {
  const size = solidScriptUvsSize(run, label);
  if (projection === 'Cylinder' || projection === 'Sphere') {
    solidScriptUvsRadial(run, faces, projection, size);
    return;
  }
  for (const [leaf, group] of solidScriptFaceGroups(faces, (face) => face.leaf)) {
    const origin = solidScriptUvsOrigin(run, leaf);
    solidScriptUvsWriteLeaf(run, leaf, group, (face) => solidScriptUvsProjectFace(run, face, projection, size, origin));
  }
}

/**
 * Wraps faces around Axis, each run of solids stacked on one axis as one round
 * shape, in whole repeats so the seam closes.
 *
 * @param run Running line.
 * @param faces Faces to project.
 * @param projection Cylinder or Sphere.
 * @param size Metres per repeat.
 */
function solidScriptUvsRadial(
  run: SolidScriptBlockRun,
  faces: readonly SolidScriptFaceFacts[],
  projection: SolidScriptUvProjection,
  size: number,
): void {
  const axis = solidScriptUvsVector(run, 'axis', [0, 1, 0], 'Axis');
  if (axis.lengthSq() <= 1e-16) throw new Error('Axis must not be a zero vector');
  axis.normalize();
  const given = solidScriptValueText(run.value('center')).trim();
  const center = given === '' ? null : solidScriptUvsVector(run, 'center', [0, 0, 0], 'Center');
  for (const stack of solidScriptUvsStacks(faces, axis, center)) {
    const space = solidScriptUvWrapSpace([...stack.groups.keys()], solidScriptUvWrapMatrix(axis, stack.center, size));
    for (const [leaf, group] of stack.groups)
      solidScriptUvsRadialLeaf(run, leaf, group, { projection, axis, center: stack.center, size, space });
  }
}

/** One round shape: its faces by solid and the point its axis runs through. */
interface SolidScriptUvsStack {
  center: THREE.Vector3;
  groups: Map<SolidScriptGeometryLeaf, SolidScriptFaceFacts[]>;
}

/**
 * Sorts faces into round shapes: all of them around Center when it is given,
 * else the solids whose centers lie on one line along Axis.
 *
 * @param faces Faces to project.
 * @param axis Unit axis.
 * @param center Center as given, or null.
 * @returns Round shapes.
 */
function solidScriptUvsStacks(
  faces: readonly SolidScriptFaceFacts[],
  axis: THREE.Vector3,
  center: THREE.Vector3 | null,
): SolidScriptUvsStack[] {
  const stacks: SolidScriptUvsStack[] = [];
  for (const [leaf, group] of solidScriptFaceGroups(faces, (face) => face.leaf)) {
    const own = center ?? solidScriptUvsMiddle(leaf);
    const found = stacks.find((stack) => solidScriptUvsSameLine(stack.center, own, axis));
    if (found) found.groups.set(leaf, group);
    else stacks.push({ center: own, groups: new Map([[leaf, group]]) });
  }
  return stacks;
}

/**
 * Average of a shape's corners, which lies on the axis of a ring of evenly
 * spread corners even when the ring has an odd number of them.
 *
 * @param leaf Solid or mesh.
 * @returns Middle in script space.
 */
function solidScriptUvsMiddle(leaf: SolidScriptGeometryLeaf): THREE.Vector3 {
  const sum = leaf.points.reduce((total, point) => total.add(point), new THREE.Vector3());
  return sum.divideScalar(Math.max(1, leaf.points.length));
}

/**
 * Tells whether two points lie on one line along an axis.
 *
 * @param left First point.
 * @param right Second point.
 * @param axis Unit axis.
 * @returns True when they do.
 */
function solidScriptUvsSameLine(left: THREE.Vector3, right: THREE.Vector3, axis: THREE.Vector3): boolean {
  const offset = right.clone().sub(left);
  return offset.addScaledVector(axis, -offset.dot(axis)).length() <= SOLID_SCRIPT_UVS_SAME_LINE;
}

/** What wrapping one solid or mesh around an axis needs. */
interface SolidScriptUvsRadialSpec {
  projection: SolidScriptUvProjection;
  axis: THREE.Vector3;
  center: THREE.Vector3;
  size: number;
  space: SolidScriptUvWrapSpace;
}

/**
 * Projects every corner of some faces.
 *
 * @param faces Faces.
 * @param project UV of one corner.
 * @returns Faces with their corner UVs.
 */
function solidScriptUvsCornersOf(
  faces: readonly SolidScriptFaceFacts[],
  project: (corner: THREE.Vector3) => [number, number],
): { face: SolidScriptFaceFacts; uvs: [number, number][] }[] {
  return faces.map((face) => ({ face, uvs: face.corners.map(project) }));
}

/**
 * Wraps the faces of one solid or mesh: a solid around a cylinder follows the
 * built-in round generators face for face; every other face gets each corner
 * placed on its own, in whole repeats.
 *
 * @param run Running line.
 * @param leaf Solid or mesh.
 * @param group Its faces.
 * @param spec Axis, center, size and wrap space.
 */
function solidScriptUvsRadialLeaf(
  run: SolidScriptBlockRun,
  leaf: SolidScriptGeometryLeaf,
  group: readonly SolidScriptFaceFacts[],
  spec: SolidScriptUvsRadialSpec,
): void {
  const whole = solidScriptUvWrapWhole(spec.space, spec.size);
  const project = solidScriptUvsRadialPoint(spec, whole.size, whole.radius);
  if (leaf.kind === 'mesh') {
    solidScriptUvsWriteCorners(run, leaf, solidScriptUvsCornersOf(group, project));
    return;
  }
  const wrapped = spec.projection === 'Cylinder' ? solidScriptUvWrapSurfaces(leaf, spec.space) : () => null;
  solidScriptUvsWriteLeaf(run, leaf, group, (face) => {
    const fitted = wrapped(face) ?? textureUvProjectFitFace(face.corners, project);
    if (!fitted) throw new Error(`${spec.projection} UVs need a face with at least three corners`);
    return fitted;
  });
}

/**
 * Places one point around the axis, as a cylinder or a sphere.
 *
 * @param spec Axis, center and projection.
 * @param size Metres of one whole repeat.
 * @param radius Radius the repeats are measured at.
 * @returns Projector.
 */
function solidScriptUvsRadialPoint(
  spec: SolidScriptUvsRadialSpec,
  size: number,
  radius: number,
): (point: THREE.Vector3) => [number, number] {
  return spec.projection === 'Sphere'
    ? (point: THREE.Vector3) => textureUvProjectSpherePoint(point, spec.axis, spec.center, size, radius)
    : (point: THREE.Vector3) => textureUvProjectCylinderPoint(point, spec.axis, spec.center, size, radius);
}

/**
 * Chooses the origin of a Box or Planar mapping: the shape's center for Local
 * or the script origin for World.
 *
 * @param run Running line.
 * @param leaf Solid or mesh.
 * @returns Origin in script space.
 */
function solidScriptUvsOrigin(run: SolidScriptBlockRun, leaf: SolidScriptGeometryLeaf): THREE.Vector3 {
  const space = solidScriptValueText(run.value('space')).trim();
  if (space.toLowerCase() === 'world') return new THREE.Vector3();
  if (space.toLowerCase() !== 'local') throw new Error(`Space must be Local or World, not ${space}`);
  return solidScriptLeafCenter(leaf);
}

/**
 * Builds the UV matrix of one face.
 *
 * @param run Running line.
 * @param face Face facts.
 * @param projection Shape to project from.
 * @param size Metres per repeat.
 * @param origin Projection origin.
 * @returns Matrix.
 */
function solidScriptUvsProjectFace(
  run: SolidScriptBlockRun,
  face: SolidScriptFaceFacts,
  projection: SolidScriptUvProjection,
  size: number,
  origin: THREE.Vector3,
): SurfaceUvMatrix {
  if (projection === 'Box') return textureUvProjectAxis(face.normal, size, origin);
  return solidScriptUvsPlanar(run, face, size, origin);
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
  const from = solidScriptValueText(run.value('from')).trim();
  const folded = from.toLowerCase();
  if (folded === 'face') return textureUvProjectPlanar(face.normal, size, origin);
  if (folded === 'overhead') return textureUvProjectView(TEXTURE_UV_PROJECT_OVERHEAD, size, origin);
  if (folded === 'front') return textureUvProjectView(TEXTURE_UV_PROJECT_FRONT, size, origin);
  if (folded === 'side') return textureUvProjectView(TEXTURE_UV_PROJECT_SIDE, size, origin);
  throw new Error(`From must be Face, Overhead, Front or Side, not ${from}`);
}
