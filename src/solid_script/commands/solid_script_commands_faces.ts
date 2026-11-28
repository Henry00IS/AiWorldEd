import { solidScriptTextureChecked } from '@/solid_script/language/solid_script_texture_known.js';
import { solidScriptGeometryFacesOutside } from '@/solid_script/language/solid_script_geometry_outside.js';
import { SOLID_SCRIPT_COMMANDS_EXTRUDE } from './solid_script_commands_extrude.js';
import { solidScriptListingOf } from './solid_script_command_listing.js';
import { solidScriptParameterOfWhere } from './solid_script_command_of_where.js';
import type { SolidScriptShape } from '@/solid_script/language/solid_script_shape.js';
import type { SolidScriptGeometryLeaf } from '@/solid_script/language/solid_script_geometry.js';
import { solidScriptEachRead } from '@/solid_script/language/solid_script_each_read.js';
import { solidScriptScaleFacesHowOf } from './solid_script_scale_faces_how.js';
import { solidScriptFaceEach, solidScriptFaceEachNumber } from './solid_script_face_each.js';
import { solidScriptParameterEach } from './solid_script_command_each.js';
import { solidScriptKindNamed } from '@/solid_script/language/solid_script_kinds.js';
import * as THREE from 'three';
import { SolidScriptCommand, type SolidScriptCommandWord } from './solid_script_command.js';
import { solidScriptListingOptions } from './solid_script_command_listing.js';
import {
  solidScriptParameter,
  solidScriptParameterInto,
  solidScriptParameterOptional,
  solidScriptParameterRest,
  solidScriptParameterWords,
  solidScriptParameterOf,
} from './solid_script_command_parameters.js';
import type { SolidScriptBlockRun } from '@/solid_script/language/solid_script_machine_types.js';
import { solidScriptPlaceAtMatrix, solidScriptPlaceMatrices } from '@/solid_script/language/solid_script_place.js';
import { solidScriptFaceGroups, solidScriptFaceTargets, solidScriptFaceWrite } from './solid_script_face_of.js';
import { solidScriptScaleFaces } from '@/solid_script/language/solid_script_scale_faces.js';
import { SOLID_SCRIPT_COMMANDS_SCATTER } from './solid_script_commands_scatter.js';
import {
  solidScriptGeometryFaces,
  solidScriptGeometryInset,
  type SolidScriptFaceFacts,
} from '@/solid_script/language/solid_script_geometry.js';
import { SOLID_SCRIPT_MESH_NEEDS_WRAP, type SolidScriptShapeMesh } from '@/solid_script/language/solid_script_mesh.js';
import { SOLID_SCRIPT_AXES_FACING } from '@/solid_script/language/solid_script_axes.js';
import { solidScriptShapeMapLeaves, type SolidScriptFaceTag } from '@/solid_script/language/solid_script_shape.js';
import { SOLID_SCRIPT_SELECT_BETWEEN, solidScriptOfEmpty } from '@/solid_script/language/solid_script_select.js';
import {
  SOLID_SCRIPT_FACING_WITHIN_DEFAULT,
  solidScriptConditionHolds,
  solidScriptFacingHolds,
  solidScriptHasTagHolds,
} from '@/solid_script/language/solid_script_condition.js';
import {
  SolidScriptElement,
  solidScriptValueText,
  type SolidScriptValue,
} from '@/solid_script/language/solid_script_value.js';

/** Ways Select Faces picks, with the direction of each Facing choice. */
const SOLID_SCRIPT_FACE_DIRECTIONS: Readonly<Record<string, THREE.Vector3>> = Object.fromEntries(
  Object.entries(SOLID_SCRIPT_AXES_FACING).map(([word, direction]) => [`Facing ${word}`, direction]),
);

/**
 * Every choice of Select Faces' Which field with what it picks, in the order
 * the help lists them.
 */
const SOLID_SCRIPT_FACE_WHICH_WORDS: readonly SolidScriptCommandWord[] = [
  { word: 'All', detail: 'Every face, the same as a Where left off' },
  {
    word: SOLID_SCRIPT_SELECT_BETWEEN,
    detail:
      "The faces between this Select Faces and the previous one. Example: Cube, Select Faces, Cube, then Select Faces Which Between picks only the second Cube's faces.",
  },
  ...Object.entries(SOLID_SCRIPT_FACE_DIRECTIONS).map(([word, direction]) => {
    const axis = (['x', 'y', 'z'] as const).find((key) => direction[key] !== 0) ?? 'z';
    const sign = direction[axis] > 0 ? '+' : '−';
    return {
      word,
      detail: `Faces pointing ${word.slice('Facing '.length).toLowerCase()} (${sign}${axis.toUpperCase()}), the same as Where [=Facing([$Face.Normal], Vector(${direction.x}, ${direction.y}, ${direction.z}))]`,
    };
  }),
  { word: 'Top', detail: 'Faces tagged Top, the same as Where [=HasTag([$Face.Tags], "Top")]' },
  { word: 'Bottom', detail: 'Faces tagged Bottom, the same as Where [=HasTag([$Face.Tags], "Bottom")]' },
];

/** Every choice of Select Faces' Which field. */
const SOLID_SCRIPT_FACE_WHICH = SOLID_SCRIPT_FACE_WHICH_WORDS.map((entry) => entry.word);

/** How a Select Faces line changes the faces already picked. */
const SOLID_SCRIPT_FACE_HOW = ['New', 'Add', 'Remove'] as const;

/** What each How choice does, shown beside it while the field is typed. */
const SOLID_SCRIPT_FACE_HOW_DETAILS: Readonly<Record<(typeof SOLID_SCRIPT_FACE_HOW)[number], string>> = {
  New: 'Start a new pick',
  Add: 'Pick more faces',
  Remove: 'Drop faces from the pick',
};

/**
 * Keeps the faces a Select Faces Which preset picks. Each preset equals a
 * written-out Where: All keeps every face, Top and Bottom use HasTag, and
 * Facing Up and the other facing words use Facing with the default lean.
 *
 * @param which Which word.
 * @param faces Faces to pick from.
 * @returns Faces the preset keeps.
 */
function solidScriptFaceSelectWhich(which: string, faces: readonly SolidScriptFaceFacts[]): SolidScriptFaceFacts[] {
  if (which === 'All') return [...faces];
  if (which === 'Top' || which === 'Bottom') return faces.filter((face) => solidScriptHasTagHolds(face.tags, which));
  const direction = SOLID_SCRIPT_FACE_DIRECTIONS[which];
  if (direction)
    return faces.filter((face) =>
      solidScriptFacingHolds(face.normal.toArray(), direction.toArray(), SOLID_SCRIPT_FACING_WITHIN_DEFAULT),
    );
  throw new Error(`Which must be one of ${SOLID_SCRIPT_FACE_WHICH.join(', ')}, not "${which}"`);
}

/** What a Distance that is not a number stops with. */
export const SOLID_SCRIPT_FACE_DISTANCE_NEEDS = 'Distance needs a number of metres, such as 0.2';

/**
 * Numbers the faces an Extrude or Inset of a mesh made: for every chosen face
 * the ring of new side faces and then the moved or inner face, in the order the
 * operation writes them.
 *
 * @param before Mesh before the operation.
 * @param chosen Face numbers worked on.
 * @returns Numbers of the moved or inner faces and of the side or ring faces.
 */
function solidScriptFaceOutputs(
  before: SolidScriptShapeMesh,
  chosen: ReadonlySet<number>,
): { tops: number[]; sides: number[] } {
  const tops: number[] = [];
  const sides: number[] = [];
  let at = 0;
  before.faces.forEach((loop, index) => {
    if (!chosen.has(index)) {
      at++;
      return;
    }
    for (let corner = 0; corner < loop.length; corner++) sides.push(at++);
    tops.push(at++);
  });
  return { tops, sides };
}

/**
 * Tags faces of a mesh by number, so later lines and [Face.Tag] can tell them.
 *
 * @param mesh Mesh.
 * @param numbers Face numbers.
 * @param tag Tag.
 * @returns Tags to add.
 */
function solidScriptFaceTagsOf(
  mesh: SolidScriptShapeMesh,
  numbers: readonly number[],
  tag: string,
): SolidScriptFaceTag[] {
  const faces = solidScriptGeometryFaces([mesh]);
  return numbers.map((number) => ({
    point: faces[number]!.center.clone(),
    normal: faces[number]!.normal.clone(),
    tag,
  }));
}

/**
 * Faces Select Faces may pick from, or a stop when Of or [$Selected.Objects]
 * has nothing.
 *
 * @param run Running line.
 * @returns Faces of those brushes or of a face list in Of.
 */
function solidScriptFaceSelectFrom(run: SolidScriptBlockRun): SolidScriptFaceFacts[] {
  const given = run.ofValues();
  const from = given ?? run.selectedGet('objects');
  if (!given && from.length === 0) throw new Error(solidScriptOfEmpty('Select Faces', 'objects'));
  const faces: SolidScriptFaceFacts[] = [];
  for (const value of from) {
    if (!(value instanceof SolidScriptElement) || (value.kind !== 'face' && value.kind !== 'brush'))
      throw new Error(`Select Faces picks from objects or faces, not ${solidScriptKindNamed(value)}`);
    faces.push(...run.elements.faces(value));
  }
  if (faces.length === 0)
    throw new Error('Select Faces has no faces to pick from; add a solid such as Cube or Input Objects above it');
  return faces;
}

/**
 * Writes the faces a Select Faces line picked, after How, and remembers the
 * pool for Which Between.
 *
 * @param run Running line.
 * @param how New, Add or Remove.
 * @param items Faces in the pool.
 * @param picked Faces this Which chose.
 */
function solidScriptFaceSelectWrite(
  run: SolidScriptBlockRun,
  how: string,
  items: readonly SolidScriptValue[],
  picked: readonly SolidScriptValue[],
): void {
  const before = how === 'New' ? [] : run.selectedGet('faces');
  const after =
    how === 'Remove'
      ? before.filter((face) => !picked.includes(face as SolidScriptElement))
      : [...before, ...picked.filter((face) => !before.includes(face))];
  run.selectNote('faces', items);
  run.selectedSet('faces', after);
  solidScriptFaceWrite(run, 'into', after);
}

/**
 * Paints the objects of a Texture block, working the texture out for each
 * object; an object with a texture from an inner block keeps it, and one whose
 * texture reads empty keeps the default.
 *
 * @param run Running line.
 * @param shapes Shapes built inside the block.
 * @returns Painted shapes.
 */
function solidScriptTexturePaint(run: SolidScriptBlockRun, shapes: SolidScriptShape[]): SolidScriptShape[] {
  const leaves: SolidScriptGeometryLeaf[] = [];
  shapes.forEach((shape) =>
    solidScriptShapeMapLeaves(shape, (leaf) => {
      if (leaf.kind === 'solid' || leaf.kind === 'mesh') leaves.push(leaf);
      return leaf;
    }),
  );
  const read = solidScriptEachRead(run, 'texture', leaves.length, (index) => {
    const leaf = leaves[index];
    return { ...(leaf ? { $Object: run.elements.brush(leaf) } : {}), $Index: index, $Count: leaves.length };
  });
  const order = new Map<SolidScriptShape, number>(leaves.map((leaf, index) => [leaf, index]));
  return shapes.map((shape) =>
    solidScriptShapeMapLeaves(shape, (leaf) =>
      solidScriptTextureLeaf(run, leaf, solidScriptValueText(read(order.get(leaf) ?? -1) ?? '').trim()),
    ),
  );
}

/**
 * Gives one object of a Texture block its texture.
 *
 * @param run Running line.
 * @param leaf Object as built.
 * @param texture Texture name; empty keeps the default.
 * @returns The object, painted when it had no texture yet.
 */
function solidScriptTextureLeaf(run: SolidScriptBlockRun, leaf: SolidScriptShape, texture: string): SolidScriptShape {
  if ((leaf.kind !== 'solid' && leaf.kind !== 'mesh') || texture === '') return leaf;
  const latest = run.leafLatest(leaf);
  if (latest.texture !== undefined) return latest;
  const painted = { ...latest, texture: solidScriptTextureChecked(run, texture) };
  run.leafReplace(latest, painted);
  return painted;
}

/**
 * Runs Select Faces: picks faces by Which and Where, joins them with the pick
 * before as How says, and writes Into and Rest.
 *
 * @param run Running line.
 */
function solidScriptSelectFacesRun(run: SolidScriptBlockRun): void {
  const how = run.text('how').trim();
  if (!(SOLID_SCRIPT_FACE_HOW as readonly string[]).includes(how))
    throw new Error(`How must be New, Add or Remove, not "${how}"`);
  const faces = solidScriptFaceSelectFrom(run);
  const items = faces.map((face) => run.elements.face(face));
  const which = run.text('which').trim();
  const chosen =
    which === SOLID_SCRIPT_SELECT_BETWEEN
      ? run.selectFresh('faces', items)
      : solidScriptFaceSelectWhich(which, faces).map((face) => run.elements.face(face));
  const picked = chosen.filter((item, index) =>
    solidScriptConditionHolds(run, 'where', { $Face: item, $Index: index, $Count: chosen.length }),
  );
  solidScriptFaceSelectWrite(run, how, items, picked);
  solidScriptFaceWrite(
    run,
    'rest',
    items.filter((item) => !picked.includes(item)),
  );
}

/**
 * Commands that pick faces of the shapes built so far and work on faces and
 * edges given as values.
 */
export const SOLID_SCRIPT_COMMANDS_FACES: readonly SolidScriptCommand[] = [
  new SolidScriptCommand({
    id: 'select_faces',
    label: 'Select Faces',
    category: 'Faces',
    description: 'Pick faces of objects',
    manual:
      'Picks faces and puts them in [$Selected.Faces], where Extrude Face, Inset Face, Bevel Edges, Delete Faces and Texture Faces find them when their Of is empty. Of says where to pick from: objects (all their faces) or faces (a list to narrow down); empty uses [$Selected.Objects]. Which is a preset that equals a written-out Where: All keeps every face, Facing Up equals Facing([$Face.Normal], Vector(0, 1, 0)), and Top equals [=HasTag([$Face.Tags], "Top")]. Which Between keeps the faces between this Select Faces and the previous one. Where is a condition each remaining face must pass, with [$Face] the face being tested, [$Index] its place in the list from 0 and [$Count] how many there are; [$X], [$Y] and [$Z] are short forms of [$Face.Center], and [$NX], [$NY] and [$NZ] of [$Face.Normal]. Left off, Where keeps what Which picked. How adds to or removes from the faces picked before. Into also writes the faces to a variable, a Face list, and Rest the faces looked at but not picked, so one line splits faces in two. To pick faces of a new object, set Of to that object or its Name. To walk the same faces after later Select lines, write them Into a variable. Example: Cube, then Select Faces Facing Up and Extrude Face By 1 pulls the top up.',
    stops: [
      'No objects to pick from.',
      'A Which that is not one of the choices.',
      'An Of that is not objects or faces.',
    ],
    parameters: [
      solidScriptParameterWords(
        'which',
        'Which',
        'text',
        'Facing Up',
        `How to pick. One of: ${SOLID_SCRIPT_FACE_WHICH.join(', ')}. Type one word, such as Facing Up.`,
        SOLID_SCRIPT_FACE_WHICH_WORDS,
      ),
      solidScriptParameterEach(
        solidScriptParameterOptional(
          'where',
          'Where',
          'value',
          'A condition each face must pass, such as [=Facing([$Face.Normal], Vector(0, 1, 0))] or [=HasTag([$Face.Tags], "Top")]. Left off keeps every face Which picked.',
        ),
        'Face',
      ),
      solidScriptParameterOf('objects or faces to pick from', '$Selected.Objects'),
      solidScriptParameterWords(
        'how',
        'How',
        'text',
        'New',
        'New starts again, Add picks more, Remove drops faces. One of: New, Add, Remove. Type one word, such as Add.',
        SOLID_SCRIPT_FACE_HOW.map((word) => ({ word, detail: SOLID_SCRIPT_FACE_HOW_DETAILS[word] })),
      ),
      solidScriptParameterInto('the picked faces, a Face list', 'Face List', 'what is made', 'label'),
      solidScriptParameterRest('faces', 'Face List'),
    ],
    listing: (read) => {
      return [
        'Select Faces',
        read.value('which'),
        ...solidScriptListingOf(read),
        ...solidScriptListingOptions([read.changed('how') && ['How ', read.value('how')]]),
        ...(read.text('into') === '' ? [] : [' Into ', read.value('into')]),
        ...(read.text('rest') === '' ? [] : [' Rest ', read.value('rest')]),
      ];
    },
    execute: (run) => {
      solidScriptSelectFacesRun(run);
      return [];
    },
  }),
  ...SOLID_SCRIPT_COMMANDS_SCATTER,
  new SolidScriptCommand({
    id: 'place_on_face',
    builtKind: 'Object',
    label: 'Place On Face',
    category: 'Faces',
    description: 'Stand objects on faces',
    builds: true,
    intoList: true,
    manual:
      'Builds the objects between this line and its End standing on a face: up is the way the face points and the center is the middle of the face. Of gives the face, such as [Top] in For Each [Top] In [$Selected.Faces]; given several faces it builds them on each. Empty Of uses [$Selected.Faces]. Faces that lie back to back against another object in Of, inside the shape, are skipped. Lift moves them out from the face. The same as Points From Faces then Place At Points with Align To Normal, with the same lift. Into is always a list of the objects it built, even when there is only one. Lift can change per face, with [$Face] the face, [$Index] its number from 0 and [$Count] how many there are. Example: For Each [Top] In [$Selected.Faces], Place On Face Of [Top], Cylinder, End, End puts a post on every picked face.',
    stops: ['No faces.', 'Nothing between this line and its End.', 'A missing End line.'],
    nesting: 'open',
    endLabel: 'Place',
    parameters: [
      solidScriptParameterOfWhere('Face', '[=[$Face.Normal.Y] > 0.9]'),
      solidScriptParameterOf('faces', '$Selected.Faces'),
      solidScriptParameterEach(
        solidScriptParameter(
          'lift',
          'Lift',
          'number',
          '0',
          'Metres to move the objects out from the face, such as 0.02 or [=[$Index] * 0.1].',
        ),
        'Face',
      ),
    ],
    listing: (read) => [
      'Place On Face',
      ...solidScriptListingOf(read),
      ...solidScriptListingOptions([read.changed('lift') && ['Lift ', read.value('lift')]]),
    ],
    execute: (run) => {
      const faces = solidScriptGeometryFacesOutside(solidScriptFaceTargets(run, 'Place On Face'));
      const liftOf = solidScriptFaceEachNumber(run, 'lift', faces, 'Lift needs a number of metres, such as 0');
      const identity = new THREE.Matrix4();
      return faces.flatMap((face) =>
        run.framed(solidScriptPlaceAtMatrix(face.center, face.normal, liftOf(face), true, identity, identity)),
      );
    },
  }),

  new SolidScriptCommand({
    id: 'place_at_points',
    builtKind: 'Object',
    label: 'Place At Points',
    category: 'Points',
    description: 'Stand objects at a list of points',
    builds: true,
    intoList: true,
    manual:
      'Builds the objects between this line and its End at each point in At, a list of vectors such as the points Scatter On Faces writes. Directions, when given, turns up (Y) along one direction for all points, or along the matching entry of a list with one per point; leave it empty to keep world up. Forward, when given, also turns the front (Z) of each copy toward it, as far as it can while up stays, so a fence post stands up and faces along a path. Lift moves them out along that up. Align To Normal stands each copy the way Place On Face would, with Directions as the face normal. Directions, Forward, Lift, Align To Normal, Rotation and Scale can each change per point: [$Point] is the point, with its Position and Normal (the direction, or world up), [$Index] its number from 0, [$Count] how many points there are, and [$X], [$Y] and [$Z] its position; for example Lift [=[$Index] * 0.1] stacks the copies like stairs. Build One Line builds only one of the lines inside at each point, the one Choice picks (from 0, wrapping, so -1 is the last; lines that only set values do not count), to scatter variants such as three kinds of rock. Where is a 🔁 condition a point must pass before a copy is built; skipped points keep their place in the index and count, and all other fields still use the original index. Into is always a list of the objects it built, even when there is only one. Example: Scatter On Faces 20 Into [Spots] Normals [Dirs], then Place At Points At [Spots] Directions [Dirs], Sphere, End, puts a ball on every point, standing on the face.',
    stops: [
      'A point or direction that is not x, y or x, y, z.',
      'A Directions or Forward list with more than one entry whose length is not the number of points in At.',
      'A missing End line.',
    ],
    nesting: 'open',
    endLabel: 'Place',
    parameters: [
      solidScriptParameterEach(
        solidScriptParameterOptional(
          'where',
          'Where',
          'value',
          'A condition a point must pass to get a copy, such as [=[$X] > 0] or [=EveryNth([$Index], 2)]. Left off builds at every point.',
        ),
        'Point',
      ),
      solidScriptParameter(
        'at',
        'At',
        'points3',
        '0, 0, 0',
        'Points to stand on, a list of vectors such as [Spots] from Scatter On Faces, or 0, 0, 0 for one point at the origin.',
      ),
      solidScriptParameterEach(
        solidScriptParameterOptional(
          'directions',
          'Directions',
          'points3',
          'Optional: the way up (Y) points, one direction for all points such as 1, 0, 0, one per point such as [Dirs] from Scatter On Faces Normals, or [=Vector(0, 1, [$X] * 0.1)]. Empty keeps world up.',
        ),
        'Point',
      ),
      solidScriptParameterEach(
        solidScriptParameterOptional(
          'forward',
          'Forward',
          'points3',
          'Optional: the way the front (Z) points, laid square to up, one for all points such as 1, 0, 0, one per point such as [Ways], or [=PathDirection([Path], [$Index] / ([$Count] - 1))]. Empty, 0, 0, 0 or a way along up keeps the turn Directions gives.',
        ),
        'Point',
      ),
      solidScriptParameterEach(
        solidScriptParameter(
          'lift',
          'Lift',
          'number',
          '0',
          'Metres to move the objects out along up, such as 0.02 or [=[$Index] * 0.1].',
        ),
        'Point',
      ),
      solidScriptParameterEach(
        solidScriptParameter(
          'align',
          'Align To Normal',
          'boolean',
          'No',
          'Yes: stand each copy the way Place On Face would, with Directions as the normals. No: the shortest turn that points up along each direction, or world up when Directions is left off. Type Yes or No, such as Yes, or [=[$Index] % 2 == 0] for every other copy.',
        ),
        'Point',
      ),
      solidScriptParameterWords(
        'build',
        'Build',
        'text',
        'Every Line',
        'What to build at each point: Every Line builds all the lines inside, One Line builds only the one Choice picks, to scatter variants. Type one, such as One Line.',
        [
          { word: 'Every Line', detail: 'Build all the lines inside at every point' },
          { word: 'One Line', detail: 'Build one line inside per point, picked by Choice' },
        ],
      ),
      solidScriptParameterEach(
        solidScriptParameter(
          'choice',
          'Choice',
          'number',
          '[=RandomInt(0, 999, [$Index])]',
          'When Build is One Line, which line inside to build at each point, from 0 for the first, such as [$Index] to take turns or [=RandomInt(0, 999, [$Index])] for a random one. It wraps, so -1 is the last.',
        ),
        'Point',
      ),
      solidScriptParameterEach(
        solidScriptParameter(
          'rotation',
          'Rotation',
          'vector3',
          '0, 0, 0',
          'Degrees around X, then Y, then Z, such as 0, 45, 0 or [=Vector(0, [$Index] * 15, 0)].',
        ),
        'Point',
      ),
      solidScriptParameterEach(
        solidScriptParameter(
          'scale',
          'Scale',
          'vector3',
          '1, 1, 1',
          'Size of each copy, such as 1 or [=[$Index] * 0.1 + 0.5].',
        ),
        'Point',
      ),
    ],
    listing: (read) => [
      'Place At Points',
      ' At ',
      read.value('at'),
      ...(read.text('where').trim() === '' ? [] : [' Where ', read.value('where')]),
      ...(read.text('directions') === '' ? [] : [' Directions ', read.value('directions')]),
      ...(read.text('forward') === '' ? [] : [' Forward ', read.value('forward')]),
      ...solidScriptListingOptions([
        read.changed('lift') && ['Lift ', read.value('lift')],
        read.on('align') && ['Align To Normal'],
        read.changed('rotation') && ['Rotation ', read.value('rotation')],
        read.changed('scale') && ['Scale ', read.value('scale')],
        read.changed('build') && ['Build ', read.value('build'), ' Choice ', read.value('choice')],
      ]),
    ],
    execute: (run) =>
      solidScriptPlaceMatrices(run).flatMap(({ matrix, choice }) =>
        choice === null ? run.framed(matrix) : run.framedChoice(matrix, choice),
      ),
  }),
  ...SOLID_SCRIPT_COMMANDS_EXTRUDE,
  new SolidScriptCommand({
    id: 'inset_face',
    edits: true,
    label: 'Inset Face',
    category: 'Faces',
    description: 'Shrink faces inside a ring',
    manual:
      'Gives each face of a mesh a smaller copy of itself inside, joined to the old path by a ring of faces. Of gives the faces; empty uses [$Selected.Faces]. A solid stops the line: wrap it in Mesh From Solids first. Inner and Ring name variables for the new faces, as the operation builds them. Afterwards [$Selected.Faces] holds the inner faces. Example: Mesh From Solids around a Cube, Select Faces Facing Up, Inset Face By 0.1, Extrude Face By -0.2 sinks a tray.',
    stops: ['No faces.', 'A solid. Wrap it in Mesh From Solids first.'],
    parameters: [
      solidScriptParameterEach(
        solidScriptParameter(
          'distance',
          'Distance',
          'number',
          '0.1',
          'Metres from the old edge to the new one, such as 0.1 or [=0.05 + [$Index] * 0.01].',
        ),
        'Face',
      ),
      solidScriptParameterOfWhere('Face', '[=[$Face.Normal.Y] > 0.9]'),
      solidScriptParameterOf('faces', '$Selected.Faces'),
      {
        ...solidScriptParameterInto('the inner faces, a Face list', 'Face List', 'inner faces', 'label'),
        key: 'inner',
        label: 'Inner',
      },
      {
        ...solidScriptParameterInto('the ring faces, a Face list', 'Face List', 'ring faces', 'label'),
        key: 'ring',
        label: 'Ring',
      },
    ],
    listing: (read) => [
      'Inset Face',
      'By ',
      read.value('distance'),
      ...solidScriptListingOf(read),
      ...(read.text('inner') === '' ? [] : [' Inner ', read.value('inner')]),
      ...(read.text('ring') === '' ? [] : [' Ring ', read.value('ring')]),
    ],
    execute: (run) => {
      const targets = solidScriptFaceTargets(run, 'Inset Face');
      const distanceOf = solidScriptFaceEachNumber(run, 'distance', targets, SOLID_SCRIPT_FACE_DISTANCE_NEEDS);
      const inner: SolidScriptValue[] = [];
      const ring: SolidScriptValue[] = [];
      for (const [leaf, faces] of solidScriptFaceGroups(targets, (face) => face.leaf)) {
        if (leaf.kind !== 'mesh') throw new Error(SOLID_SCRIPT_MESH_NEEDS_WRAP);
        const mesh: SolidScriptShapeMesh = leaf;
        const numbers = new Set(faces.map((face) => face.index));
        const inset = solidScriptGeometryInset(mesh, new Map(faces.map((face) => [face.index, distanceOf(face)])));
        const outputs = solidScriptFaceOutputs(mesh, numbers);
        const tags = [
          ...solidScriptFaceTagsOf(inset, outputs.tops, 'Inner'),
          ...solidScriptFaceTagsOf(inset, outputs.sides, 'Ring'),
        ];
        run.leafReplace(leaf, { ...inset, faceTags: [...(inset.faceTags ?? []), ...tags] });
        const read = solidScriptGeometryFaces([run.leafLatest(leaf)]);
        inner.push(...outputs.tops.map((number) => run.elements.face(read[number]!)));
        ring.push(...outputs.sides.map((number) => run.elements.face(read[number]!)));
      }
      run.selectedSet('faces', inner);
      solidScriptFaceWrite(run, 'inner', inner);
      solidScriptFaceWrite(run, 'ring', ring);
      return [];
    },
  }),
  new SolidScriptCommand({
    id: 'texture',
    label: 'Texture',
    category: 'Objects',
    description: 'Paint objects with a texture',
    manual:
      "Gives every face of the objects between this line and its End the texture named by Texture, the name a texture has in the texture library. Objects outside any Texture block keep the generator's own texture, and an inner Texture block wins over an outer one. A name this project has no texture for still paints, as the texture may come with another project, and adds a warning. A texture Input picks the name from the library, so the inspector can change it. The 🔁 Texture may change per object, such as with [$Index]. Example: Input Wall, texture, then Texture [Wall] around the walls paints them with the picked texture.",
    stops: ['A missing End line.', 'A [Name] for a variable not set above this line.'],
    nesting: 'open',
    parameters: [
      solidScriptParameterEach(
        {
          ...solidScriptParameterOptional(
            'texture',
            'Texture',
            'message',
            'Name of a library texture; [Name] puts in a variable, such as a texture Input, and [=Pick([$Index] % 2, "grass", "stone")] alternates two. Empty keeps the generator\'s texture.',
          ),
          texture: true,
          accepts: ['Text'],
        },
        'Object',
      ),
    ],
    listing: (read) => ['Texture', read.value('texture')],
    execute: (run) => run.placed(solidScriptTexturePaint(run, run.local(run.planar))),
  }),
  new SolidScriptCommand({
    id: 'texture_faces',
    edits: true,
    label: 'Texture Faces',
    category: 'Faces',
    description: 'Paint faces with a texture',
    manual:
      'Gives faces their own library texture. Of gives the faces, or solids for all their faces; empty uses [$Selected.Faces]. It works on solids and meshes and wins over a Texture block around them. A name this project has no texture for adds a warning. On a mesh each texture becomes one of its texture slots, and each face points at its slot. The faces keep it when the object is moved, turned or scaled. Example: Cube, Select Faces Facing Up, Texture Faces grass gives a box a grass top.',
    stops: ['No faces.', 'An empty Texture.', 'A [Name] for a variable not set above this line.'],
    parameters: [
      solidScriptParameterEach(
        {
          ...solidScriptParameter(
            'texture',
            'Texture',
            'message',
            'grass',
            'Name of a library texture; [Name] puts in a variable, such as a texture Input, and [=Pick([$Index] % 2, "grass", "stone")] alternates two.',
          ),
          texture: true,
          accepts: ['Text'],
        },
        'Face',
      ),
      solidScriptParameterOfWhere('Face', '[=[$Face.Normal.Y] > 0.9]'),
      solidScriptParameterOf('faces or solids', '$Selected.Faces'),
    ],
    listing: (read) => ['Texture Faces', read.value('texture'), ...solidScriptListingOf(read)],
    execute: (run) => {
      const targets = solidScriptFaceTargets(run, 'Texture Faces');
      const read = solidScriptFaceEach(run, 'texture', targets);
      const textureOf = (face: SolidScriptFaceFacts): string => {
        const texture = solidScriptValueText(read(face)).trim();
        if (texture === '') throw new Error('Texture Faces needs a Texture name');
        return solidScriptTextureChecked(run, texture);
      };
      for (const [leaf, faces] of solidScriptFaceGroups(targets, (face) => face.leaf)) {
        const added = faces.map((face) => ({
          point: face.center.clone(),
          normal: face.normal.clone(),
          texture: textureOf(face),
        }));
        run.leafReplace(leaf, { ...leaf, faceTextures: [...(leaf.faceTextures ?? []), ...added] });
      }
      return [];
    },
  }),
  new SolidScriptCommand({
    id: 'scale_faces',
    edits: true,
    label: 'Scale Faces',
    category: 'Faces',
    description: 'Scale faces about their centers',
    manual:
      'Scales each face about its center, in the plane of the face. Of gives the faces, or solids for all their faces; empty uses [$Selected.Faces]. A solid stays a solid, and a mesh stays a mesh. Factor 1 leaves the face as it is; 0.5 shrinks it toward its center, and 2 grows it. Center, when given, is the point a face is scaled about instead, and Axis scales only along that direction; both may change per face. Picked faces that share corners scale as one island, by the average of their Factors about the average of their Centers, so a picked strip or patch shrinks as a whole. A solid may be left not convex for now, so later lines can keep moving its corners; only when the script ends does a warning list the solids still not convex, which are not built. Example: Select Faces Facing Up, Scale Faces By 0.5 turns the top of a Cube into a smaller roof.',
    stops: ['No faces.', 'A Factor that is not a number.'],
    parameters: [
      solidScriptParameterEach(
        solidScriptParameter(
          'factor',
          'Factor',
          'number',
          '1',
          'How much to scale each face about its center, such as 0.5 or [=1 - [$Y] * 0.1]. 1 leaves it as it is.',
        ),
        'Face',
      ),
      solidScriptParameterEach(
        solidScriptParameterOptional(
          'center',
          'Center',
          'vector3',
          'Point each face is scaled about, such as 0, 0, 0 or [=[$Face.Parent.Center]]. Left off uses the center of the face.',
        ),
        'Face',
      ),
      solidScriptParameterEach(
        solidScriptParameterOptional(
          'axis',
          'Axis',
          'vector3',
          'Direction to scale along only, such as 1, 0, 0 to make faces narrower but not shorter. Left off scales every way.',
        ),
        'Face',
      ),
      solidScriptParameterOfWhere('Face', '[=[$Face.Normal.Y] > 0.9]'),
      solidScriptParameterOf('faces or objects', '$Selected.Faces'),
    ],
    listing: (read) => ['Scale Faces', 'By ', read.value('factor'), ...solidScriptListingOf(read)],
    execute: (run) => {
      const targets = solidScriptFaceTargets(run, 'Scale Faces');
      const howOf = solidScriptScaleFacesHowOf(run, targets);
      for (const [leaf, faces] of solidScriptFaceGroups(targets, (face) => face.leaf))
        run.leafReplace(leaf, solidScriptScaleFaces(leaf, faces, howOf, 'Scale Faces'));
      return [];
    },
  }),
];
