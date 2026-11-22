import { solidScriptListingOf } from './solid_script_command_listing.js';
import { solidScriptParameterOfWhere } from './solid_script_command_of_where.js';
import * as THREE from 'three';
import { SolidScriptCommand } from './solid_script_command.js';
import { solidScriptListingOptions } from './solid_script_command_listing.js';
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
  solidScriptLeafCenter,
  solidScriptFaceUvsWorldLock,
  solidScriptMeshFaceUvsWrite,
  solidScriptMeshUvsWorldLock,
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
import { solidScriptUvUnfold } from '@/solid_script/language/solid_script_uv_unfold.js';
import { solidScriptUvsSeamLinks } from './solid_script_uvs_seams.js';
import { solidScriptParameterEach } from './solid_script_command_each.js';
import { solidScriptUvIslandsPack } from '@/solid_script/language/solid_script_uv_islands.js';
import {
  textureUvTransformMatrix,
  textureUvTransformPoint,
  type TextureUvTransform,
} from '@/texture/uv_project/texture_uv_transform.js';
import type { SurfaceUvMatrix } from '@/texture/uv_matrix/surface_uv_matrix.js';
import {
  solidScriptUvPolicyApply,
  solidScriptUvPolicyOf,
  solidScriptUvPolicyTextures,
} from '@/solid_script/language/solid_script_uv_policy.js';

/** Commands that project, unwrap, pack and transform texture coordinates. */
export const SOLID_SCRIPT_COMMANDS_UVS: readonly SolidScriptCommand[] = [
  new SolidScriptCommand({
    id: 'project_uvs',
    edits: true,
    label: 'Project UVs',
    category: 'UVs',
    description: 'Give faces texture coordinates from a box, plane, cylinder or sphere',
    manual:
      "Gives faces texture coordinates projected from a Mode: Box (the Overhead, Front or Side view each face faces most), Planar (one plane, From Face, Overhead, Front or Side), Cylinder or Sphere. Size is metres of one texture repeat. Space is Local (from the shape's center, so a move keeps the mapping) or World (from the script origin, along the world axes). Cylinder and Sphere take Axis and an optional Center (empty uses the shape's center); a solid face gets a fitted planar map, a mesh face gets exact corner coordinates. Of gives the faces, or solids for all their faces; empty uses [$Selected.Faces]. Solids stay solids; meshes stay meshes. Example: Cube, Select Faces, Project UVs Mode Box Size 1 wraps each side from the way it faces.",
    stops: [
      'No faces.',
      'A Size of 0 or less.',
      'A Mode other than Box, Planar, Cylinder or Sphere.',
      'A Space other than Local or World.',
      'A From other than Face, Overhead, Front or Side.',
    ],
    parameters: [
      solidScriptParameterWords(
        'mode',
        'Mode',
        'text',
        'Box',
        'How the coordinates are projected. Type one word, such as Box.',
        [
          { word: 'Box', detail: 'Each face uses the Overhead, Front or Side view it faces most' },
          { word: 'Planar', detail: 'Every face uses one plane' },
          { word: 'Cylinder', detail: 'Around an axis, height along it' },
          { word: 'Sphere', detail: 'Around a center, from the +axis pole' },
        ],
      ),
      solidScriptParameter('size', 'Size', 'number', '1', 'Metres covered by one texture repeat, such as 1.'),
      solidScriptParameterWhen(
        solidScriptParameterWords(
          'space',
          'Space',
          'text',
          'Local',
          'Local follows the shape; World stays fixed to the script. Type Local or World, such as Local on a swinging door and World on wallpaper that stays put.',
          [
            { word: 'Local', detail: 'Follows the shape, from its center' },
            { word: 'World', detail: 'Stays fixed to the script origin' },
          ],
        ),
        'mode',
        ['Box', 'Planar'],
      ),
      solidScriptParameterWhen(
        solidScriptParameterWords(
          'from',
          'From',
          'text',
          'Face',
          'The plane Planar projects from. Type one word, such as Overhead, or a face such as [Front].',
          [
            { word: 'Face', detail: "Each face's own plane" },
            { word: 'Overhead', detail: 'From above, along X and Z, such as looking down on a floor' },
            { word: 'Front', detail: 'From the front, along X and Y, such as looking at a wall' },
            { word: 'Side', detail: 'From the side, along Z and Y, such as looking from the right' },
          ],
        ),
        'mode',
        ['Planar'],
      ),
      solidScriptParameterWhen(
        solidScriptParameter(
          'axis',
          'Axis',
          'vector3',
          '0, 1, 0',
          'The cylinder or sphere axis, such as 0, 1, 0 for upright.',
        ),
        'mode',
        ['Cylinder', 'Sphere'],
      ),
      solidScriptParameterWhen(
        solidScriptParameterOptional(
          'center',
          'Center',
          'vector3',
          "A point on the axis, or the sphere center, such as 0, 0, 0; left off uses the shape's center.",
        ),
        'mode',
        ['Cylinder', 'Sphere'],
      ),
      solidScriptParameterOfWhere('Face', '[=[$Face.Normal.Y] > 0.9]'),
      solidScriptParameterOf('faces or objects', '$Selected.Faces'),
    ],
    listing: (read) => [
      'Project UVs',
      ' ',
      read.value('mode'),
      ' Size ',
      read.value('size'),
      ...solidScriptListingOf(read),
    ],
    execute: (run) => {
      solidScriptUvsProject(run, solidScriptFaceTargets(run, 'Project UVs'));
      return [];
    },
  }),
  new SolidScriptCommand({
    id: 'unwrap',
    edits: true,
    label: 'Unwrap',
    category: 'UVs',
    description: 'Lay each face flat in UV space',
    manual:
      "Gives each face its own UV island, projected onto the face's plane with the editor's planar basis, shifted so the lowest U and V are 0. With Seams, only edges that pass Seams are cut open: faces joined by other edges stay together, each folded open from its neighbour so lengths and angles stay true, which suits a strip of wall or a box's sides. Pack Yes (the default) then packs the islands into the 0 to 1 square as Pack Islands does, Margin apart. Pack No leaves them where they fold, Size metres to one texture repeat, so a texture keeps its true size across faces. Of gives the faces, or solids for all their faces; empty uses [$Selected.Faces]. Solids stay solids; meshes stay meshes. Example: Cube, Select Faces, Unwrap Seams [=[$Edge.Angle] > 45].",
    stops: ['No faces.', 'A Size of 0 or less.', 'A Pack that is not Yes or No.', 'A Margin below 0 or above 1.'],
    parameters: [
      solidScriptParameter(
        'pack',
        'Pack',
        'boolean',
        'Yes',
        'Yes: pack the islands into 0 to 1. No: keep them at Size. Type Yes or No, such as Yes.',
      ),
      solidScriptParameter(
        'size',
        'Size',
        'number',
        '1',
        'Metres covered by one texture repeat when Pack is No, such as 1.',
      ),
      solidScriptParameterOptional(
        'margin',
        'Margin',
        'number',
        'Gap between islands as a share of the square when Pack is Yes, such as 0.001. Left off is 0.001.',
      ),
      solidScriptParameterEach(
        solidScriptParameterOptional(
          'seams',
          'Seams',
          'value',
          'A condition an edge must pass to be cut open, such as [=[$Edge.Angle] > 45]; faces joined by other edges stay together in one island. Left off lays each face alone.',
        ),
        'Edge',
      ),
      solidScriptParameterOfWhere('Face', '[=[$Face.Normal.Y] > 0.9]'),
      solidScriptParameterOf('faces or objects', '$Selected.Faces'),
    ],
    listing: (read) => [
      'Unwrap',
      ' Pack ',
      read.value('pack'),
      ' Size ',
      read.value('size'),
      ...(read.text('margin') === '' ? [] : [' Margin ', read.value('margin')]),
      ...(read.text('seams') === '' ? [] : [' Seams ', read.value('seams')]),
      ...solidScriptListingOf(read),
    ],
    execute: (run) => {
      const faces = solidScriptFaceTargets(run, 'Unwrap');
      if (run.source('seams').trim() === '') solidScriptUvsUnwrap(run, faces);
      else solidScriptUvsUnwrapSeams(run, faces);
      if (solidScriptUvsPacks(run)) solidScriptUvsPack(run, solidScriptFaceTargets(run, 'Unwrap'), 'Unwrap');
      return [];
    },
  }),
  new SolidScriptCommand({
    id: 'pack_islands',
    edits: true,
    label: 'Pack Islands',
    category: 'UVs',
    description: 'Fit UV islands into 0 to 1',
    manual:
      "Packs the UV islands of the faces into the 0 to 1 square, keeping each island's shape and scaling all of them alike. Faces that share a corner with the same UV, such as faces Unwrap kept joined, move together as one island. Margin is the gap between islands as a share of the square. Of gives the faces, or solids for all their faces; empty uses [$Selected.Faces]. Solids stay solids; meshes stay meshes. Example: Unwrap, then Pack Islands.",
    stops: ['No faces.', 'A Margin below 0 or above 1.'],
    parameters: [
      solidScriptParameter(
        'margin',
        'Margin',
        'number',
        '0.001',
        'Gap between islands as a share of the square, such as 0.001.',
      ),
      solidScriptParameterOfWhere('Face', '[=[$Face.Normal.Y] > 0.9]'),
      solidScriptParameterOf('faces or objects', '$Selected.Faces'),
    ],
    listing: (read) => [
      'Pack Islands',
      ...(read.text('margin') === '' ? [] : [' Margin ', read.value('margin')]),
      ...solidScriptListingOf(read),
    ],
    execute: (run) => {
      solidScriptUvsPack(run, solidScriptFaceTargets(run, 'Pack Islands'), 'Pack Islands');
      return [];
    },
  }),
  new SolidScriptCommand({
    id: 'transform_uvs',
    edits: true,
    label: 'Transform UVs',
    category: 'UVs',
    description: 'Move, scale or rotate texture coordinates',
    manual:
      "Offsets, scales and rotates the UV mapping of the faces in UV space. Offset is tiles added to U and V (Z is ignored); on solids from Input Objects it shifts the texture of that copy. It is added after Scale and Rotate. Pivot is Center (the middle of the faces' UVs), Tile (the middle of the texture tile under that center, such as 0.5, 0.5), Origin (0, 0) or Each Face (the middle of each face's own UVs, so every face turns and scales in place). Readable Text Yes keeps lettering readable when a later Mirror or a mirrored copy would otherwise reverse it, No lets the reflection reverse it, and left off the solid keeps the Readable Text it already has. Textures is Move With Shape, so textures stay on their faces, or World Aligned, so they stay where they are in the world; left off, the solid keeps the Textures it already has. Of gives the faces, or solids for all their faces; empty uses [$Selected.Faces]. Solids stay solids; meshes stay meshes. Example: Project UVs, then Transform UVs Offset 0.5, 0 Rotate 90.",
    stops: [
      'No faces.',
      'A Pivot other than Center, Tile, Origin or Each Face.',
      'Textures other than Move With Shape or World Aligned.',
    ],
    parameters: [
      solidScriptParameter(
        'offset',
        'Offset',
        'vector3',
        '0, 0, 0',
        'Tiles added to U and V, such as 0.5, 0; Z is ignored.',
      ),
      solidScriptParameter(
        'scale',
        'Scale',
        'vector3',
        '1, 1, 1',
        'Multiplier of U and V, such as 2, 2; Z is ignored.',
      ),
      solidScriptParameter('rotate', 'Rotate', 'number', '0', 'Rotation around the pivot, in degrees, such as 90.'),
      solidScriptParameterWords(
        'pivot',
        'Pivot',
        'text',
        'Center',
        'The point Scale and Rotate turn about. Type one word, such as Center.',
        [
          { word: 'Center', detail: "The middle of the faces' UVs" },
          { word: 'Tile', detail: 'The middle of the texture tile under the UV center, such as 0.5, 0.5' },
          { word: 'Origin', detail: 'U 0, V 0' },
          { word: 'Each Face', detail: "The middle of each face's own UVs, so every face turns in place" },
        ],
      ),
      solidScriptParameterOptional(
        'readable',
        'Readable Text',
        'boolean',
        'Yes: keeps lettering readable on a mirrored copy. No: leaves it as the reflection made it. Type Yes or No, such as Yes. Left off, the solid keeps the Readable Text it already has.',
      ),
      {
        ...solidScriptParameterWords(
          'textures',
          'Textures',
          'message',
          '',
          'Move With Shape keeps textures on their faces; World Aligned keeps them where they are in the world. Type one of those, such as Move With Shape. Left off, the solid keeps the Textures it already has.',
          [
            { word: 'Move With Shape', detail: 'Textures stay on their faces' },
            { word: 'World Aligned', detail: 'Textures stay where they are in the world' },
          ],
        ),
        optional: true,
      },
      solidScriptParameterOfWhere('Face', '[=[$Face.Normal.Y] > 0.9]'),
      solidScriptParameterOf('faces or objects', '$Selected.Faces'),
    ],
    listing: (read) => [
      'Transform UVs',
      ...(read.changed('offset') ? [' Offset ', read.value('offset')] : []),
      ...(read.changed('scale') ? [' Scale ', read.value('scale')] : []),
      ...(read.changed('rotate') ? [' Rotate ', read.value('rotate')] : []),
      ...solidScriptListingOptions([
        read.text('readable') !== '' && [read.on('readable') ? 'Readable Text' : 'Readable Text No'],
        read.changed('textures') && ['Textures ', read.value('textures')],
        read.text('where') !== '' && ['Where ', read.value('where')],
        read.text('of') !== '' && ['Of ', read.value('of')],
      ]),
    ],
    execute: (run) => {
      const faces = solidScriptFaceTargets(run, 'Transform UVs');
      const bake = solidScriptUvsTransformBakesReceived(run, faces);
      solidScriptUvsTransformPolicy(run, faces, bake);
      solidScriptUvsTransform(run, faces, bake);
      return [];
    },
  }),
];

/**
 * Stores Readable Text, Textures and Offset tiles on the solids of the faces,
 * so a later Mirror or an Input Objects copy uses the same policy.
 *
 * @param run Running line.
 * @param faces Faces Transform UVs just edited.
 */
function solidScriptUvsTransformPolicy(
  run: SolidScriptBlockRun,
  faces: readonly SolidScriptFaceFacts[],
  bake: boolean,
): void {
  const offset = solidScriptUvsVector(run, 'offset', [0, 0, 0], 'Offset');
  const readable = solidScriptUvsReadable(run);
  const textures = solidScriptUvPolicyTextures(run, false);
  const unchanged = readable === undefined && textures === undefined && offset.x === 0 && offset.y === 0;
  if (unchanged) return;
  const seen = new Set<SolidScriptGeometryLeaf>();
  for (const face of faces) {
    if (seen.has(face.leaf)) continue;
    seen.add(face.leaf);
    solidScriptUvsTransformPolicyLeaf(run, face.leaf, { offset, readable, textures, bake });
  }
}

/**
 * Stores the policy on one solid, or world-locks a mesh from its current
 * position when Textures is World Aligned.
 *
 * @param run Running line.
 * @param leaf Target solid or mesh, as first seen.
 * @param policy Fields read from the line.
 */
function solidScriptUvsTransformPolicyLeaf(
  run: SolidScriptBlockRun,
  leaf: SolidScriptGeometryLeaf,
  policy: {
    offset: THREE.Vector3;
    readable: boolean | undefined;
    textures: 'copied' | 'world' | undefined;
    bake: boolean;
  },
): void {
  const latest = run.leafLatest(leaf);
  if (latest.kind === 'mesh') {
    if (policy.textures === 'world') solidScriptMeshUvsWorldLock(latest);
    return;
  }
  if (latest.kind !== 'solid') return;
  if (policy.textures === 'world') solidScriptFaceUvsWorldLock(latest);
  const solid = latest;
  const keepShift = !!solid.received && !policy.bake;
  const textures = policy.textures;
  const writeTextures = textures && (textures !== 'copied' || solidScriptUvPolicyOf(solid).textures !== undefined);
  solidScriptUvPolicyApply(
    solid,
    {
      ...(writeTextures ? { textures } : {}),
      ...(policy.readable !== undefined ? { readable: policy.readable } : {}),
      shiftU: keepShift ? policy.offset.x : 0,
      shiftV: keepShift ? policy.offset.y : 0,
    },
    'add',
  );
}

/**
 * Reads Readable Text, or none when it is left off so the solid keeps its own.
 *
 * @param run Running line.
 * @returns Yes or No, or undefined when empty.
 */
function solidScriptUvsReadable(run: SolidScriptBlockRun): boolean | undefined {
  return run.text('readable').trim() === '' ? undefined : run.fields().flag('readable');
}

/**
 * Tells whether Scale and Rotate will bake UVs, which turns a received brush
 * into a built one. Offset on a received brush stays in the texture policy when
 * they are left at 1 and 0.
 *
 * @param run Running line.
 * @param faces Faces, for the pivot when Rotate or Scale is set.
 * @returns True when stored UVs will change.
 */
function solidScriptUvsTransformBakesReceived(
  run: SolidScriptBlockRun,
  faces: readonly SolidScriptFaceFacts[],
): boolean {
  const transform = solidScriptUvsTransformValues(run, faces);
  return transform.scaleU !== 1 || transform.scaleV !== 1 || transform.rotationDeg !== 0;
}

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
 * Reads Margin, 0.001 when left off.
 *
 * @param run Running line.
 * @param label Command, for messages.
 * @returns Gap between islands as a share of the square.
 */
function solidScriptUvsMargin(run: SolidScriptBlockRun, label: string): number {
  if (run.source('margin').trim() === '') return 0.001;
  const margin = solidScriptValueNumber(run.value('margin'));
  if (margin === undefined || !(margin >= 0 && margin <= 1))
    throw new Error(`${label} needs a Margin from 0 to 1, such as 0.001`);
  return margin;
}

/**
 * Reads Unwrap's Pack.
 *
 * @param run Running line.
 * @returns True to pack the islands into 0 to 1.
 */
function solidScriptUvsPacks(run: SolidScriptBlockRun): boolean {
  const pack = run.value('pack');
  if (typeof pack !== 'boolean') throw new Error('Unwrap needs Yes or No in Pack');
  return pack;
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
    return text === '' ? solidScriptLeafCenter(leaf) : solidScriptUvsVector(run, 'center', [0, 0, 0], 'Center');
  }
  const space = solidScriptValueText(run.value('space')).trim() || 'Local';
  if (space.toLowerCase() === 'world') return new THREE.Vector3();
  if (space.toLowerCase() !== 'local') throw new Error(`Space must be Local or World, not ${space}`);
  return solidScriptLeafCenter(leaf);
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
 * Unwraps faces into islands cut open only along Seams, each face folded open
 * from its neighbour.
 *
 * @param run Running line.
 * @param faces Faces to unwrap.
 */
function solidScriptUvsUnwrapSeams(run: SolidScriptBlockRun, faces: readonly SolidScriptFaceFacts[]): void {
  const uvs = solidScriptUvUnfold(faces, solidScriptUvsSeamLinks(run, faces), solidScriptUvsSize(run, 'Unwrap'));
  for (const [leaf, group] of solidScriptFaceGroups(
    faces.map((face, index) => ({ face, uvs: uvs[index] ?? [] })),
    (item) => item.face.leaf,
  ))
    solidScriptUvsWriteCorners(run, leaf, group);
}

/**
 * Packs the UV islands of the given faces into 0 to 1.
 *
 * @param run Running line.
 * @param faces Faces to pack.
 * @param label Command, for messages.
 */
function solidScriptUvsPack(run: SolidScriptBlockRun, faces: readonly SolidScriptFaceFacts[], label: string): void {
  const uvs = faces.map((face) => solidScriptFaceCornerUvs(face));
  const packed = solidScriptUvIslandsPack(faces, uvs, solidScriptUvsMargin(run, label));
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
function solidScriptUvsTransform(run: SolidScriptBlockRun, faces: readonly SolidScriptFaceFacts[], bake = true): void {
  const transform = solidScriptUvsTransformOf(run, faces);
  for (const [leaf, group] of solidScriptFaceGroups(faces, (face) => face.leaf)) {
    const latest = run.leafLatest(leaf);
    if (latest.kind === 'solid' && latest.received && !bake) continue;
    if (latest.kind === 'solid') solidScriptUvsTransformSolid(run, latest, group, transform);
    else
      solidScriptUvsWriteCorners(
        run,
        latest,
        group.map((face) => ({
          face,
          uvs: solidScriptFaceCornerUvs(face).map((uv) => textureUvTransformPoint(uv, transform(face))),
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
 * @param transform Transform per face.
 */
function solidScriptUvsTransformSolid(
  run: SolidScriptBlockRun,
  leaf: Extract<SolidScriptGeometryLeaf, { kind: 'solid' }>,
  faces: readonly SolidScriptFaceFacts[],
  transform: (face: SolidScriptFaceFacts) => TextureUvTransform,
): void {
  run.leafReplace(
    leaf,
    solidScriptSolidFaceUvsWrite(
      leaf,
      faces.map((face) =>
        solidScriptFaceUvRecord(face, textureUvTransformMatrix(solidScriptFaceUvMatrix(face), transform(face))),
      ),
    ),
  );
}

/**
 * Reads the transform of each face: one for all of them, or with Pivot Each
 * Face one about each face's own middle.
 *
 * @param run Running line.
 * @param faces Faces to transform.
 * @returns Transform per face.
 */
function solidScriptUvsTransformOf(
  run: SolidScriptBlockRun,
  faces: readonly SolidScriptFaceFacts[],
): (face: SolidScriptFaceFacts) => TextureUvTransform {
  if (solidScriptUvsPivotWord(run) !== 'each face') {
    const shared = solidScriptUvsTransformValues(run, faces);
    return () => shared;
  }
  return (face) => solidScriptUvsTransformValues(run, [face]);
}

/**
 * Reads the Pivot word, folded to lower case.
 *
 * @param run Running line.
 * @returns Pivot word.
 */
function solidScriptUvsPivotWord(run: SolidScriptBlockRun): string {
  return (solidScriptValueText(run.value('pivot')).trim() || 'Center').toLowerCase();
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
  const folded = solidScriptUvsPivotWord(run);
  if (folded === 'origin') return [0, 0];
  const uvs = faces.flatMap((face) => solidScriptFaceCornerUvs(face));
  if (uvs.length === 0) return [0, 0];
  const midU = uvs.reduce((sum, uv) => sum + uv[0], 0) / uvs.length;
  const midV = uvs.reduce((sum, uv) => sum + uv[1], 0) / uvs.length;
  if (folded === 'center' || folded === 'each face') return [midU, midV];
  if (folded === 'tile') return [Math.floor(midU) + 0.5, Math.floor(midV) + 0.5];
  throw new Error(
    `Pivot must be Center, Tile, Origin or Each Face, not ${solidScriptValueText(run.value('pivot')).trim()}`,
  );
}
