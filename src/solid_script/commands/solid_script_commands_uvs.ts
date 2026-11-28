import { solidScriptListingOf } from './solid_script_command_listing.js';
import { solidScriptParameterOfWhere } from './solid_script_command_of_where.js';
import * as THREE from 'three';
import { SolidScriptCommand } from './solid_script_command.js';
import { solidScriptListingOptions } from './solid_script_command_listing.js';
import {
  solidScriptParameter,
  solidScriptParameterOf,
  solidScriptParameterOptional,
  solidScriptParameterWords,
} from './solid_script_command_parameters.js';
import { solidScriptFaceGroups, solidScriptFaceTargets } from './solid_script_face_of.js';
import type { SolidScriptBlockRun } from '@/solid_script/language/solid_script_machine_types.js';
import type { SolidScriptFaceFacts } from '@/solid_script/language/solid_script_geometry.js';
import type { SolidScriptGeometryLeaf } from '@/solid_script/language/solid_script_geometry.js';
import { solidScriptValueNumber, solidScriptValueText } from '@/solid_script/language/solid_script_value.js';
import {
  solidScriptFaceCornerUvs,
  solidScriptFaceUvMatrix,
  solidScriptFaceUvRecord,
  solidScriptFaceUvsFit,
  solidScriptFaceUvsWorldLock,
  solidScriptMeshFaceUvsWrite,
  solidScriptMeshUvsWorldLock,
  solidScriptSolidFaceUvsWrite,
} from '@/solid_script/language/solid_script_uvs.js';
import { textureUvProjectPoint } from '@/texture/uv_project/texture_uv_project_view.js';
import { textureUvUnwrapFace } from '@/texture/uv_project/texture_uv_unwrap.js';
import { solidScriptUvUnfold } from '@/solid_script/language/solid_script_uv_unfold.js';
import { solidScriptUvConformal } from '@/solid_script/language/solid_script_uv_conformal.js';
import { solidScriptUvsSeamLinks } from './solid_script_uvs_seams.js';
import { solidScriptParameterEach } from './solid_script_command_each.js';
import {
  solidScriptUvIslandsPack,
  type SolidScriptUvPackSettings,
} from '@/solid_script/language/solid_script_uv_islands.js';
import {
  SOLID_SCRIPT_UVS_PACK_METHODS,
  SOLID_SCRIPT_UVS_UNWRAP_METHODS,
  solidScriptUvsUnwrapMethod,
  solidScriptUvsMargin,
  solidScriptUvsPackSettings,
  solidScriptUvsPacks,
  solidScriptUvsVector,
} from './solid_script_uvs_read.js';
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
    id: 'unwrap',
    edits: true,
    label: 'Unwrap',
    category: 'UVs',
    description: 'Lay each face flat in UV space',
    manual:
      "Gives each face its own UV island, projected onto the face's plane with the editor's planar basis, laid side by side along U a whole number of repeats apart. With Seams, only edges that pass Seams are cut open: faces joined by other edges stay together, each folded open from its neighbour so lengths and angles stay true, which suits a strip of wall or a box's sides. Method Conformal instead keeps every joined corner joined and spreads the stretch over the island so angles stay as true as a curved surface allows, the two corners farthest apart keeping their unfolded places. Pack Yes (the default) then packs the islands into the 0 to 1 square as Pack Islands does, Margin apart. Pack No leaves them where they fold, Size metres to one texture repeat, so a texture keeps its true size across faces. Of gives the faces, or solids for all their faces; empty uses [$Selected.Faces]. Solids stay solids; meshes stay meshes. Example: Cube, Select Faces, Unwrap Seams [=[$Edge.Angle] > 45].",
    stops: [
      'No faces.',
      'A Size of 0 or less.',
      'A Pack that is not Yes or No.',
      'A Margin below 0 or above 1.',
      'A Method other than Unfold or Conformal.',
    ],
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
      solidScriptParameterWords(
        'method',
        'Method',
        'text',
        'Unfold',
        'How islands of several faces are laid flat when Seams is set: Unfold folds each face open from its neighbour, true to size but cracked where the surface curves; Conformal keeps joined corners joined and angles as true as the surface allows. Type one, such as Conformal.',
        SOLID_SCRIPT_UVS_UNWRAP_METHODS,
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
      ...(read.changed('method') ? [' Method ', read.value('method')] : []),
      ...solidScriptListingOf(read),
    ],
    execute: (run) => {
      const method = solidScriptUvsUnwrapMethod(run);
      const faces = solidScriptFaceTargets(run, 'Unwrap');
      if (run.source('seams').trim() === '') solidScriptUvsUnwrap(run, faces);
      else solidScriptUvsUnwrapSeams(run, faces, method);
      if (solidScriptUvsPacks(run))
        solidScriptUvsPack(run, solidScriptFaceTargets(run, 'Unwrap'), {
          margin: solidScriptUvsMargin(run, 'Unwrap'),
          rotate: true,
          method: 'Bounding Box',
          from: [0, 0],
          to: [1, 1],
        });
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
      "Packs the UV islands of the faces into the 0 to 1 square, keeping each island's shape and scaling all of them alike. Faces that share a corner with the same UV, such as faces Unwrap kept joined, move together as one island. Margin is the gap between islands as a share of the square. Rotate Yes turns each island first so its bounding box is as small as it can be; No keeps the way it faces. Method Bounding Box packs the islands' boxes in rows; Convex Hull places each island, largest first, as low as its convex hull fits on those placed before, so slanted sides nest; Exact Shape does so by the faces themselves, so an island can sit in another's notch. With Rotate Yes, Convex Hull and Exact Shape also try quarter and half turns. Bottom Left and Top Right give the area to fill in U and V, the 0 to 1 square when they do not span one; islands keep their shape. Of gives the faces, or solids for all their faces; empty uses [$Selected.Faces]. Solids stay solids; meshes stay meshes. Example: Unwrap, then Pack Islands.",
    stops: [
      'No faces.',
      'A Margin below 0 or above 1.',
      'A Method other than Bounding Box, Convex Hull or Exact Shape.',
    ],
    parameters: [
      solidScriptParameter(
        'margin',
        'Margin',
        'number',
        '0.001',
        'Gap between islands as a share of the square, such as 0.001.',
      ),
      solidScriptParameter(
        'rotate',
        'Rotate',
        'boolean',
        'Yes',
        'Yes: turn each island so it takes the least room. No: keep the way it faces. Type Yes or No, such as Yes.',
      ),
      solidScriptParameterWords(
        'method',
        'Method',
        'text',
        'Bounding Box',
        'How tightly islands fit: Bounding Box packs their boxes in rows, Convex Hull nests their convex hulls, Exact Shape nests their faces into notches. Type one, such as Convex Hull.',
        SOLID_SCRIPT_UVS_PACK_METHODS,
      ),
      solidScriptParameter(
        'from',
        'Bottom Left',
        'vector3',
        '0, 0, 0',
        'Lowest U and V of the area to fill, such as 0, 0, 0.',
      ),
      solidScriptParameter(
        'to',
        'Top Right',
        'vector3',
        '1, 1, 0',
        'Highest U and V of the area to fill, such as 1, 1, 0.',
      ),
      solidScriptParameterOfWhere('Face', '[=[$Face.Normal.Y] > 0.9]'),
      solidScriptParameterOf('faces or objects', '$Selected.Faces'),
    ],
    listing: (read) => [
      'Pack Islands',
      ...(read.text('margin') === '' ? [] : [' Margin ', read.value('margin')]),
      ...(read.text('rotate') === '' ? [] : [' Rotate ', read.value('rotate')]),
      ...(read.changed('method') ? [' Method ', read.value('method')] : []),
      ...(read.text('from') === '' ? [] : [' Bottom Left ', read.value('from')]),
      ...(read.text('to') === '' ? [] : [' Top Right ', read.value('to')]),
      ...solidScriptListingOf(read),
    ],
    execute: (run) => {
      solidScriptUvsPack(run, solidScriptFaceTargets(run, 'Pack Islands'), solidScriptUvsPackSettings(run));
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
      "Offsets, scales and rotates the UV mapping of the faces in UV space. Offset is tiles added to U and V (Z is ignored); on solids from Input Objects it shifts the texture of that copy. It is added after Scale and Rotate. Pivot is Center (the middle of the faces' UVs), Tile (the middle of the texture tile under that center, such as 0.5, 0.5), Origin (0, 0) or Each Face (the middle of each face's own UVs, so every face turns and scales in place). Readable Text Yes keeps lettering readable when a later Mirror or a mirrored copy would otherwise reverse it, No lets the reflection reverse it, and left off the solid keeps the Readable Text it already has. Textures is Move With Shape, so textures stay on their faces, or World Aligned, so they stay where they are in the world; left off, the solid keeps the Textures it already has. Of gives the faces, or solids for all their faces; empty uses [$Selected.Faces]. Solids stay solids; meshes stay meshes. Example: Project Box UVs, then Transform UVs Offset 0.5, 0 Rotate 90.",
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
export function solidScriptUvsSize(run: SolidScriptBlockRun, label: string): number {
  const size = solidScriptValueNumber(run.value('size'));
  if (size === undefined) throw new Error(`${label} needs a Size in metres, such as 1`);
  if (!(size > 0)) throw new Error(`Size must be greater than 0, not ${size}`);
  return size;
}

/**
 * Writes a projection onto a solid as records, or onto a mesh as corner UVs.
 *
 * @param run Running line.
 * @param leaf Solid or mesh.
 * @param faces Faces of this leaf.
 * @param matrix Of one face.
 */
export function solidScriptUvsWriteLeaf(
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
 * Unwraps the given faces, each laid on its own plane, side by side along U a
 * whole number of repeats apart, so no two share a spot.
 *
 * @param run Running line.
 * @param faces Faces to unwrap.
 */
function solidScriptUvsUnwrap(run: SolidScriptBlockRun, faces: readonly SolidScriptFaceFacts[]): void {
  const size = solidScriptUvsSize(run, 'Unwrap');
  const reach = Math.max(
    0,
    ...faces.flatMap((face) => face.corners.map((corner) => corner.distanceTo(face.corners[0]!))),
  );
  const stride = Math.ceil((2 * reach) / size) + 1;
  const order = new Map(faces.map((face, index) => [face, index]));
  for (const [leaf, group] of solidScriptFaceGroups(faces, (face) => face.leaf)) {
    solidScriptUvsWriteLeaf(run, leaf, group, (face) => {
      const mapped = textureUvUnwrapFace(face.corners, face.normal, size, (order.get(face) ?? 0) * stride);
      if (!mapped) throw new Error('Unwrap needs a face with at least one corner');
      return mapped;
    });
  }
}

/**
 * Unwraps faces into islands cut open only along Seams, each face folded open
 * from its neighbour, or with Method Conformal relaxed into a conformal map.
 *
 * @param run Running line.
 * @param faces Faces to unwrap.
 * @param method Unfold or Conformal.
 */
function solidScriptUvsUnwrapSeams(
  run: SolidScriptBlockRun,
  faces: readonly SolidScriptFaceFacts[],
  method: 'Unfold' | 'Conformal',
): void {
  const lay = method === 'Conformal' ? solidScriptUvConformal : solidScriptUvUnfold;
  const uvs = lay(faces, solidScriptUvsSeamLinks(run, faces), solidScriptUvsSize(run, 'Unwrap'));
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
function solidScriptUvsPack(
  run: SolidScriptBlockRun,
  faces: readonly SolidScriptFaceFacts[],
  settings: SolidScriptUvPackSettings,
): void {
  const uvs = faces.map((face) => solidScriptFaceCornerUvs(face));
  const packed = solidScriptUvIslandsPack(faces, uvs, settings);
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
export function solidScriptUvsWriteCorners(
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
  return solidScriptValueText(run.value('pivot')).trim().toLowerCase();
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
