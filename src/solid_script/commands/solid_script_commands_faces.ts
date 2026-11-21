import { solidScriptKindNamed } from '@/solid_script/language/solid_script_kinds.js';
import * as THREE from 'three';
import { SolidScriptCommand, type SolidScriptCommandWord } from './solid_script_command.js';
import {
  solidScriptListingOptions,
  type SolidScriptListingPiece,
  type SolidScriptListingValues,
} from './solid_script_command_listing.js';
import {
  solidScriptParameter,
  solidScriptParameterInto,
  solidScriptParameterOptional,
  solidScriptParameterWords,
  solidScriptParameterOf,
  solidScriptParameterWhen,
} from './solid_script_command_parameters.js';
import type { SolidScriptBlockRun } from '@/solid_script/language/solid_script_machine_types.js';
import { solidScriptPlaceAtMatrix, solidScriptPlaceMatrices } from '@/solid_script/language/solid_script_place.js';
import { solidScriptRunValueOptional } from '@/solid_script/language/solid_script_run_optional.js';
import { solidScriptFaceGroups, solidScriptFaceTargets, solidScriptFaceWrite } from './solid_script_face_of.js';
import { solidScriptScaleFaces } from '@/solid_script/language/solid_script_scale_faces.js';
import { solidScriptScatterRun } from '@/solid_script/language/solid_script_scatter.js';
import {
  solidScriptGeometryBevel,
  solidScriptGeometryFacePrism,
  solidScriptGeometryFaces,
  solidScriptGeometryFacesDelete,
  solidScriptGeometryInset,
  type SolidScriptEdgeFacts,
  type SolidScriptFaceFacts,
} from '@/solid_script/language/solid_script_geometry.js';
import {
  SOLID_SCRIPT_MESH_NEEDS_WRAP,
  solidScriptMeshExtrudeFaces,
  type SolidScriptShapeMesh,
} from '@/solid_script/language/solid_script_mesh.js';
import { SOLID_SCRIPT_AXES_FACING } from '@/solid_script/language/solid_script_axes.js';
import { solidScriptMemberVector } from '@/solid_script/language/solid_script_members.js';
import {
  solidScriptShapeMapLeaves,
  type SolidScriptFaceTag,
  type SolidScriptShapeSolid,
} from '@/solid_script/language/solid_script_shape.js';
import { SOLID_SCRIPT_SELECT_BETWEEN, solidScriptOfEmpty } from '@/solid_script/language/solid_script_select.js';
import {
  SOLID_SCRIPT_FACING_WITHIN_DEFAULT,
  solidScriptConditionHolds,
  solidScriptFacingHolds,
  solidScriptHasTagHolds,
} from '@/solid_script/language/solid_script_condition.js';
import {
  SolidScriptElement,
  solidScriptValueNumber,
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

/** The tag Bevel Edges gives the faces it cuts, so it never cuts them again. */
const SOLID_SCRIPT_FACE_BEVEL_TAG = 'Bevel';

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

/**
 * Lists a Scatter Points line: the On Faces form stays as it was, so existing
 * Where values show only the fields they use.
 *
 * @param read Line values.
 * @returns Listing parts.
 */
function solidScriptScatterListing(read: SolidScriptListingValues): SolidScriptListingPiece[] {
  const where = read.text('where').trim();
  if (where === '' || where.toLowerCase() === 'on faces') return solidScriptScatterListingFaces(read);
  return solidScriptScatterListingOther(read, where);
}

/**
 * Lists a Scatter Points line whose Where is On Faces, or empty (the default).
 *
 * @param read Line values.
 * @returns Listing parts.
 */
function solidScriptScatterListingFaces(read: SolidScriptListingValues): SolidScriptListingPiece[] {
  return [
    'Scatter Points',
    ' ',
    read.value('count'),
    ' With Seed ',
    read.value('seed'),
    ...(read.text('of') === '' ? [] : [' Of ', read.value('of')]),
    ' Into ',
    read.value('into'),
    ...(read.text('normals') === '' ? [] : [' Normals ', read.value('normals')]),
  ];
}

/**
 * Lists a Scatter Points line whose Where is not Faces.
 *
 * @param read Line values.
 * @param where Where word or variable.
 * @returns Listing parts.
 */
function solidScriptScatterListingOther(read: SolidScriptListingValues, where: string): SolidScriptListingPiece[] {
  const folded = where.toLowerCase();
  const grid = folded === 'grid';
  const box = grid || folded === 'in box';
  return [
    'Scatter Points',
    ' ',
    read.value('where'),
    ...(grid ? [' ', read.value('counts'), ' In ', read.value('size')] : [' ', read.value('count')]),
    ...(!grid && box ? [' In ', read.value('size')] : []),
    ...(grid ? [] : [' With Seed ', read.value('seed')]),
    ...(read.text('of') === '' || box ? [] : [' Of ', read.value('of')]),
    ' Into ',
    read.value('into'),
  ];
}

/**
 * Reads the edges a line works on now: those its Of gives (edges, the edges of
 * faces, or every edge of brushes), else [$Selected.Edges], else the edges of
 * [$Selected.Faces].
 *
 * @param run Running line.
 * @param label Command, for messages.
 * @returns Edges read from the latest geometry.
 */
function solidScriptFaceEdgeTargets(run: SolidScriptBlockRun, label: string): SolidScriptEdgeFacts[] {
  const given = run.ofValues();
  const picked = run.selectedGet('edges');
  const values = given ?? (picked.length > 0 ? picked : run.selectedGet('faces'));
  if (values.length === 0)
    throw new Error(`${label} has no edges to work on; pick faces with Select Faces above it, or give edges in Of`);
  const edges: SolidScriptEdgeFacts[] = [];
  for (const value of values) {
    if (!(value instanceof SolidScriptElement) || value.kind === 'vertex' || value.kind === 'data')
      throw new Error(`${label} takes edges, faces or brushes, not ${solidScriptKindNamed(value)}`);
    for (const edge of run.elements.edges(value))
      if (!edges.some((known) => known.faces[0].leaf === edge.faces[0].leaf && known.index === edge.index))
        edges.push(edge);
  }
  return edges;
}

/**
 * Reads a distance field.
 *
 * @param run Running line.
 * @param what Field caption.
 * @returns Metres.
 */
function solidScriptFaceDistance(run: SolidScriptBlockRun, what: string): number {
  const number = solidScriptValueNumber(run.value('distance'));
  if (number === undefined) throw new Error(`${what} needs a number of metres, such as 0.2`);
  return number;
}

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
 * Faces Select Faces may pick from, or a stop when Of or [$Selected.Brushes]
 * has nothing.
 *
 * @param run Running line.
 * @returns Faces of those brushes or of a face list in Of.
 */
/**
 * Face number a Where condition reads as [$Index].
 *
 * @param run Running line.
 * @param item Picked face.
 * @returns Face number from 0, or 0 when it has none.
 */
function solidScriptFaceWhereIndex(run: SolidScriptBlockRun, item: SolidScriptValue): number {
  if (!(item instanceof SolidScriptElement)) return 0;
  return run.elements.faces(item)[0]?.index ?? 0;
}

function solidScriptFaceSelectFrom(run: SolidScriptBlockRun): SolidScriptFaceFacts[] {
  const given = run.ofValues();
  const from = given ?? run.selectedGet('brushes');
  if (!given && from.length === 0) throw new Error(solidScriptOfEmpty('Select Faces', 'brushes'));
  const faces: SolidScriptFaceFacts[] = [];
  for (const value of from) {
    if (!(value instanceof SolidScriptElement) || (value.kind !== 'face' && value.kind !== 'brush'))
      throw new Error(`Select Faces picks from brushes or faces, not ${solidScriptKindNamed(value)}`);
    faces.push(...run.elements.faces(value));
  }
  if (faces.length === 0)
    throw new Error('Select Faces has no faces to pick from; add a brush such as Cube or Input Brushes above it');
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
 * Commands that pick faces of the shapes built so far and work on faces and
 * edges given as values.
 */
export const SOLID_SCRIPT_COMMANDS_FACES: readonly SolidScriptCommand[] = [
  new SolidScriptCommand({
    id: 'select_faces',
    label: 'Select Faces',
    category: 'Faces',
    description: 'Pick faces of brushes',
    fills: ['$Face', '$Index', '$CX', '$CY', '$CZ', '$NX', '$NY', '$NZ'],
    manual:
      'Picks faces and puts them in [$Selected.Faces], where Extrude Face, Inset Face, Bevel Edges, Delete Faces and Texture Faces find them when their Of is empty. Of says where to pick from: brushes (all their faces) or faces (a list to narrow down); empty uses [$Selected.Brushes]. Which is a preset that equals a written-out Where: All keeps every face, Facing Up equals Facing([$Face.Normal], Vector(0, 1, 0)), and Top equals [=HasTag([$Face.Tags], "Top")]. Which Between keeps the faces between this Select Faces and the previous one. Where is a 🔁 condition each remaining face must pass, with [$Face] the face being tested and [$Index] its number from 0; [$CX], [$CY] and [$CZ] are short forms of [$Face.Center.X] and the other axes, and [$NX], [$NY] and [$NZ] of [$Face.Normal]. Left off, Where keeps what Which picked. How adds to or removes from the faces picked before. Into also writes the faces to a variable, a Face list. To pick faces of a new brush, set Of to that brush or its Name. To walk the same faces after later Select lines, write them Into a variable. Example: Cube, then Select Faces Facing Up and Extrude Face By 1 pulls the top up.',
    stops: [
      'No brushes to pick from.',
      'A Which that is not one of the choices.',
      'An Of that is not brushes or faces.',
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
      {
        ...solidScriptParameterOptional(
          'where',
          'Where',
          'value',
          'A 🔁 condition each face must pass, such as [=Facing([$Face.Normal], Vector(0, 1, 0))] or [=HasTag([$Face.Tags], "Top")]. [$Face] is the face being tested and [$Index] is its number from 0. Left off keeps every face Which picked.',
        ),
        each: 'Face',
      },
      solidScriptParameterOf('brushes or faces to pick from', '$Selected.Brushes'),
      solidScriptParameterWords(
        'how',
        'How',
        'text',
        'New',
        'New starts again, Add picks more, Remove drops faces. One of: New, Add, Remove. Type one word, such as Add.',
        SOLID_SCRIPT_FACE_HOW.map((word) => ({ word, detail: SOLID_SCRIPT_FACE_HOW_DETAILS[word] })),
      ),
      solidScriptParameterInto('the picked faces, a Face list', 'Face List', 'what is made', 'label'),
    ],
    listing: (read) => {
      return [
        'Select Faces',
        read.value('which'),
        ...(read.text('where').trim() === '' ? [] : [' Where ', read.value('where')]),
        ...(read.text('of') === '' ? [] : [' Of ', read.value('of')]),
        ...solidScriptListingOptions([read.changed('how') && ['How ', read.value('how')]]),
        ...(read.text('into') === '' ? [] : [' Into ', read.value('into')]),
      ];
    },
    execute: (run) => {
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
      const picked = chosen.filter((item) =>
        solidScriptConditionHolds(run, 'where', { $Face: item, $Index: solidScriptFaceWhereIndex(run, item) }),
      );
      solidScriptFaceSelectWrite(run, how, items, picked);
      return [];
    },
  }),
  new SolidScriptCommand({
    id: 'scatter_points',
    label: 'Scatter Points',
    category: 'Faces',
    description: 'Spread points on faces, inside a shape, in a box, or on a grid',
    manual:
      'Spreads points and writes their positions to Into as a list of vectors. Where chooses how: On Faces (the default) spreads them over faces, more on bigger ones, and writes the way each face looks to Normals, and skips faces that lie back to back against another brush in Of, such as where the brushes of a Rotate Extrude ring meet; Inside fills the volume of a brush or mesh; In Box fills a box of Size, centered on the origin; Grid lays Counts points along that box. Of gives the faces, brushes or meshes for On Faces and Inside; empty uses [$Selected.Faces]. The same Seed gives the same points for the random modes. Example: Select Faces Facing Up, Scatter Points 20 Into [Spots], then Place At Points At [Spots], Sphere, End.',
    stops: [
      'No faces, when Where is On Faces or Inside.',
      'A Count that is not a whole number from 0 to 10000.',
      'An empty Into.',
      'A Size below 0, or Counts that are not whole numbers from 1 to 100 with at most 10000 points in all.',
    ],
    parameters: [
      solidScriptParameterWords(
        'where',
        'Where',
        'text',
        'On Faces',
        'Where to put the points: On Faces, Inside, In Box or Grid. Type one word, such as On Faces.',
        [
          { word: 'On Faces', detail: 'Spread over faces, more on bigger ones' },
          { word: 'Inside', detail: 'Fill the volume of a brush or mesh' },
          { word: 'In Box', detail: 'Fill a box of Size, centered on the origin' },
          { word: 'Grid', detail: 'A regular grid of Counts in a box of Size' },
        ],
      ),
      solidScriptParameterWhen(
        solidScriptParameter('count', 'Count', 'number', '10', 'How many points, 0 to 10000, such as 20.'),
        'where',
        ['On Faces', 'Inside', 'In Box'],
      ),
      solidScriptParameterWhen(
        solidScriptParameter('seed', 'Seed', 'number', '0', 'Any number, such as 1; another seed gives other points.'),
        'where',
        ['On Faces', 'Inside', 'In Box'],
      ),
      solidScriptParameterWhen(solidScriptParameterOf('faces, brushes or meshes', '$Selected.Faces'), 'where', [
        'On Faces',
        'Inside',
      ]),
      {
        ...solidScriptParameterInto('the points, a list of vectors', 'Vector List', 'what is made', 'label'),
        hint: 'Variable to write the points to, a list of vectors, such as Path.',
        optional: false,
        default: 'Points',
      },
      solidScriptParameterWhen(
        {
          ...solidScriptParameterInto(
            'the way the face under each point looks, a list of vectors',
            'Vector List',
            'face directions',
            'label',
          ),
          key: 'normals',
          label: 'Normals',
        },
        'where',
        ['On Faces'],
      ),
      solidScriptParameterWhen(
        solidScriptParameter(
          'size',
          'Size',
          'vector3',
          '1, 1, 1',
          'Width, height and depth of the box, in metres, for In Box and Grid, such as 4, 2, 4.',
        ),
        'where',
        ['In Box', 'Grid'],
      ),
      solidScriptParameterWhen(
        solidScriptParameter(
          'counts',
          'Counts',
          'vector3',
          '3, 3, 3',
          'How many grid points stand along width, height and depth, such as 4, 1, 4.',
        ),
        'where',
        ['Grid'],
      ),
    ],
    listing: (read) => solidScriptScatterListing(read),
    execute: (run) => {
      const found = solidScriptScatterRun(run, () => solidScriptFaceTargets(run, 'Scatter Points'));
      solidScriptFaceWrite(
        run,
        'into',
        found.positions.map((point) => solidScriptMemberVector(point)),
      );
      if (found.normals)
        solidScriptFaceWrite(
          run,
          'normals',
          found.normals.map((point) => solidScriptMemberVector(point)),
        );
      return [];
    },
  }),
  new SolidScriptCommand({
    id: 'place_on_face',
    label: 'Place On Face',
    category: 'Faces',
    description: 'Stand brushes on faces',
    builds: true,
    intoList: true,
    manual:
      'Builds the brushes between this line and its End standing on a face: up is the way the face points and the center is the middle of the face. Of gives the face, such as [Face] in For Each [Face] In [$Selected.Faces]; given several faces it builds them on each. Empty Of uses [$Selected.Faces]. Lift moves them out from the face. The same as Points From Faces then Place At Points with Align To Normal, with the same lift. Into is always a list of the brushes or meshes it built, even when there is only one. Example: For Each [Face] In [$Selected.Faces], Place On Face Of [Face], Cylinder, End, End puts a post on every picked face.',
    stops: ['No faces.', 'Nothing between this line and its End.', 'A missing End line.'],
    nesting: 'open',
    endLabel: 'Place',
    parameters: [
      solidScriptParameterOf('faces', '$Selected.Faces'),
      solidScriptParameter(
        'lift',
        'Lift',
        'number',
        '0',
        'Metres to move the brushes out from the face, such as 0.02.',
      ),
    ],
    listing: (read) => [
      'Place On Face',
      ...(read.text('of') === '' ? [] : [' Of ', read.value('of')]),
      ...solidScriptListingOptions([read.changed('lift') && ['Lift ', read.value('lift')]]),
    ],
    execute: (run) => {
      const lift = solidScriptValueNumber(run.value('lift'));
      if (lift === undefined) throw new Error('Lift needs a number of metres, such as 0');
      const identity = new THREE.Matrix4();
      return solidScriptFaceTargets(run, 'Place On Face').flatMap((face) =>
        run.framed(solidScriptPlaceAtMatrix(face.center, face.normal, lift, true, identity, identity)),
      );
    },
  }),

  new SolidScriptCommand({
    id: 'place_at_points',
    label: 'Place At Points',
    category: 'Faces',
    description: 'Stand brushes at a list of points',
    builds: true,
    intoList: true,
    fills: ['$Point', '$Index', '$X', '$Y', '$Z'],
    manual:
      'Builds the brushes between this line and its End at each point in At, a list of vectors such as the points Scatter Points writes. Directions, when given, turns up (Y) along the matching entry, one per point; leave it empty to keep world up. Lift moves them out along that up. Align To Normal stands each copy the way Place On Face would, with Direction as the face normal. Rotation and Scale are worked out once per point as 🔁 fields, with [$Point] the position, [$Index] from 0, and [$X], [$Y] and [$Z]. Into is always a list of the brushes or meshes it built, even when there is only one. Example: Scatter Points 20 Into [Spots] Normals [Dirs], then Place At Points At [Spots] Directions [Dirs], Sphere, End, puts a ball on every point, standing on the face.',
    stops: [
      'A point or direction that is not x, y, z.',
      'A Directions list whose length is not the number of points in At.',
      'A missing End line.',
    ],
    nesting: 'open',
    endLabel: 'Place',
    parameters: [
      solidScriptParameter(
        'at',
        'At',
        'points3',
        '0, 0, 0',
        'Points to stand on, a list of vectors such as [Spots] from Scatter Points, or 0, 0, 0 for one point at the origin.',
      ),
      solidScriptParameterOptional(
        'directions',
        'Directions',
        'points3',
        'Optional: one direction per point, such as [Dirs] from Scatter Points Normals, so up (Y) points along it. Empty keeps world up.',
      ),
      solidScriptParameter('lift', 'Lift', 'number', '0', 'Metres to move the brushes out along up, such as 0.02.'),
      solidScriptParameter(
        'align',
        'Align To Normal',
        'boolean',
        'No',
        'Yes: stand each copy the way Place On Face would, with Directions as the normals. No: the shortest turn that points up along each direction, or world up when Directions is left off. Type Yes or No, such as Yes.',
      ),
      {
        ...solidScriptParameter(
          'rotation',
          'Rotation',
          'vector3',
          '0, 0, 0',
          'Degrees around X, then Y, then Z, worked out once per point, such as 0, 45, 0 or [=Vector(0, [$Index] * 15, 0)]. May use [$Point], [$Index], [$X], [$Y] and [$Z].',
        ),
        each: 'Point',
      },
      {
        ...solidScriptParameter(
          'scale',
          'Scale',
          'vector3',
          '1, 1, 1',
          'Size of each copy, worked out once per point, such as 1 or [=[$Index] * 0.1 + 0.5]. May use [$Point], [$Index], [$X], [$Y] and [$Z].',
        ),
        each: 'Point',
      },
    ],
    listing: (read) => [
      'Place At Points',
      ' At ',
      read.value('at'),
      ...(read.text('directions') === '' ? [] : [' Directions ', read.value('directions')]),
      ...solidScriptListingOptions([
        read.changed('lift') && ['Lift ', read.value('lift')],
        read.on('align') && ['Align To Normal'],
        read.changed('rotation') && ['Rotation ', read.value('rotation')],
        read.changed('scale') && ['Scale ', read.value('scale')],
      ]),
    ],
    execute: (run) => solidScriptPlaceMatrices(run).flatMap((matrix) => run.framed(matrix)),
  }),
  new SolidScriptCommand({
    id: 'extrude_face',
    edits: true,
    label: 'Extrude Face',
    category: 'Faces',
    description: 'Pull faces out',
    manual:
      'Pulls faces out along the way they point. On a brush each face becomes a new brush, a slab standing on it, and Into gets those brushes; on a mesh the face itself moves out. Of gives the faces, or brushes for all their faces; empty uses [$Selected.Faces]. Top and Sides name variables for the new faces: Top the moved or capping faces and Sides the new side faces, as the operation builds them. Afterwards [$Selected.Faces] holds the top faces. Lift moves a slab away from its face. Example: Select Faces Facing Up, Extrude Face By 1, Top [Roof].',
    stops: ['No faces.', 'A negative Distance on a brush.', 'A Lift on a mesh.'],
    parameters: [
      solidScriptParameter('distance', 'Distance', 'number', '0.2', 'Metres to pull out, such as 0.5.'),
      solidScriptParameterOptional(
        'lift',
        'Lift',
        'number',
        'Metres between a brush face and its slab, such as 0.05; left off is 0. Brushes only.',
      ),
      solidScriptParameterOf('faces or brushes', '$Selected.Faces'),
      solidScriptParameterInto('the new brushes, a Brush list', 'Brush List', 'what is made', 'copy'),
      {
        ...solidScriptParameterInto('the top faces, a Face list', 'Face List', 'top faces', 'label'),
        key: 'top',
        label: 'Top',
      },
      {
        ...solidScriptParameterInto('the new side faces, a Face list', 'Face List', 'side faces', 'label'),
        key: 'sides',
        label: 'Sides',
      },
    ],
    listing: (read) => [
      'Extrude Face',
      'By ',
      read.value('distance'),
      ...(read.text('lift').trim() === '' ? [] : [' Lift ', read.value('lift')]),
      ...(read.text('of') === '' ? [] : [' Of ', read.value('of')]),
      ...(read.text('into') === '' ? [] : [' Into ', read.value('into')]),
      ...(read.text('top') === '' ? [] : [' Top ', read.value('top')]),
      ...(read.text('sides') === '' ? [] : [' Sides ', read.value('sides')]),
    ],
    execute: (run) => {
      const distance = solidScriptFaceDistance(run, 'Distance');
      const lifted = solidScriptRunValueOptional(run, 'lift');
      const lift = lifted === undefined ? 0 : solidScriptValueNumber(lifted);
      if (lift === undefined) throw new Error('Lift needs a number of metres, such as 0.25');
      const added: { slab: SolidScriptShapeSolid; normal: THREE.Vector3 }[] = [];
      const tops: SolidScriptValue[] = [];
      const sides: SolidScriptValue[] = [];
      const brushes: SolidScriptValue[] = [];
      const targets = solidScriptFaceTargets(run, 'Extrude Face');
      for (const [leaf, faces] of solidScriptFaceGroups(targets, (face) => face.leaf)) {
        if (leaf.kind === 'solid') {
          if (distance < 0)
            throw new Error('Extrude Face cannot push into a brush; use a Subtractive brush to cut into it');
          for (const face of faces)
            added.push({
              slab: {
                kind: 'solid',
                label: 'Slab',
                ...solidScriptGeometryFacePrism(face, distance, lift, 'Extrude Face'),
              },
              normal: face.normal,
            });
          continue;
        }
        if (lift !== 0) throw new Error('Lift only works on brushes; on a mesh, Extrude Face moves the face itself');
        const numbers = new Set(faces.map((face) => face.index));
        run.leafReplace(
          leaf,
          solidScriptMeshExtrudeFaces(leaf, (_, __, index) => (numbers.has(index) ? distance : null)),
        );
        const outputs = solidScriptFaceOutputs(leaf, numbers);
        const read = solidScriptGeometryFaces([run.leafLatest(leaf)]);
        // The moved faces stay the same faces, in the order of their numbers.
        [...faces]
          .sort((a, b) => a.index - b.index)
          .forEach((face, at) => run.elements.faceMoved(face, read[outputs.tops[at]!]!));
        tops.push(...outputs.tops.map((number) => run.elements.face(read[number]!)));
        sides.push(...outputs.sides.map((number) => run.elements.face(read[number]!)));
        brushes.push(run.elements.brush(leaf));
      }
      const adopted = run.adopted(added.map((entry) => entry.slab));
      // A slab is built from its face: the cap looks the way the face does, the sides across it.
      for (const { slab, normal } of added) {
        if (!adopted.includes(slab)) continue;
        brushes.push(run.elements.brush(slab));
        for (const face of solidScriptGeometryFaces([slab])) {
          const along = face.normal.dot(normal);
          if (along > 0.9999) tops.push(run.elements.face(face));
          else if (Math.abs(along) < 1e-6) sides.push(run.elements.face(face));
        }
      }
      run.selectedSet('faces', tops);
      solidScriptFaceWrite(run, 'into', brushes);
      solidScriptFaceWrite(run, 'top', tops);
      solidScriptFaceWrite(run, 'sides', sides);
      return adopted;
    },
  }),
  new SolidScriptCommand({
    id: 'inset_face',
    edits: true,
    label: 'Inset Face',
    category: 'Faces',
    description: 'Shrink faces inside a ring',
    manual:
      'Gives each face of a mesh a smaller copy of itself inside, joined to the old outline by a ring of faces. Of gives the faces; empty uses [$Selected.Faces]. A brush stops the line: wrap it in Mesh From Brushes first. Inner and Ring name variables for the new faces, as the operation builds them. Afterwards [$Selected.Faces] holds the inner faces. Example: Mesh From Brushes around a Cube, Select Faces Facing Up, Inset Face By 0.1, Extrude Face By -0.2 sinks a tray.',
    stops: ['No faces.', 'A brush. Wrap it in Mesh From Brushes first.'],
    parameters: [
      solidScriptParameter(
        'distance',
        'Distance',
        'number',
        '0.1',
        'Metres from the old edge to the new one, such as 0.1.',
      ),
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
      ...(read.text('of') === '' ? [] : [' Of ', read.value('of')]),
      ...(read.text('inner') === '' ? [] : [' Inner ', read.value('inner')]),
      ...(read.text('ring') === '' ? [] : [' Ring ', read.value('ring')]),
    ],
    execute: (run) => {
      const distance = solidScriptFaceDistance(run, 'Distance');
      const inner: SolidScriptValue[] = [];
      const ring: SolidScriptValue[] = [];
      for (const [leaf, faces] of solidScriptFaceGroups(
        solidScriptFaceTargets(run, 'Inset Face'),
        (face) => face.leaf,
      )) {
        if (leaf.kind !== 'mesh') throw new Error(SOLID_SCRIPT_MESH_NEEDS_WRAP);
        const mesh: SolidScriptShapeMesh = leaf;
        const numbers = new Set(faces.map((face) => face.index));
        const inset = solidScriptGeometryInset(mesh, numbers, distance);
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
    id: 'bevel_edges',
    edits: true,
    label: 'Bevel Edges',
    category: 'Faces',
    description: 'Cut edges off flat',
    manual:
      'Cuts edges of brushes off flat, Distance back along each face. Of gives edges, faces (their edges) or brushes (all their edges); empty uses [$Selected.Edges], else the edges of [$Selected.Faces]. Edges already bevelled are skipped, so bevelling face by face ends the same as bevelling all at once. Into names a variable for the new faces, and [$Selected.Faces] holds them afterwards. Example: Cube, Select Faces All, Bevel Edges by 0.1.',
    stops: ['No edges.', 'Edges of a mesh. Bevel Edges works on brushes for now.', 'A Distance of 0 or less.'],
    parameters: [
      solidScriptParameter('distance', 'Distance', 'number', '0.1', 'Metres to cut back along each side, such as 0.1.'),
      solidScriptParameterOf('edges, faces or brushes', '$Selected.Edges', ['Brush', 'Face', 'Edge']),
      solidScriptParameterInto('the new faces, a Face list', 'Face List', 'what is made', 'label'),
    ],
    listing: (read) => [
      'Bevel Edges',
      'By ',
      read.value('distance'),
      ...(read.text('of') === '' ? [] : [' Of ', read.value('of')]),
      ...(read.text('into') === '' ? [] : [' Into ', read.value('into')]),
    ],
    execute: (run) => {
      const distance = solidScriptFaceDistance(run, 'Distance');
      if (distance <= 0) throw new Error('Bevel Edges needs a Distance above 0');
      const made: SolidScriptValue[] = [];
      const groups = solidScriptFaceGroups(
        solidScriptFaceEdgeTargets(run, 'Bevel Edges'),
        (edge) => edge.faces[0].leaf,
      );
      for (const [leaf, all] of groups) {
        if (leaf.kind !== 'solid') throw new Error('Bevel Edges works on brushes for now, not meshes');
        const edges = all.filter(
          (edge) => !edge.faces.some((face) => face?.tags.includes(SOLID_SCRIPT_FACE_BEVEL_TAG)),
        );
        if (edges.length === 0) continue;
        const { body, cuts } = solidScriptGeometryBevel(leaf, edges, distance);
        const bevelled: SolidScriptShapeSolid = { ...leaf, ...body };
        const faces = solidScriptGeometryFaces([bevelled]).filter((face) =>
          cuts.some(
            (cut) =>
              cut.normal.dot(face.normal) > 0.9999 &&
              Math.abs(face.center.clone().sub(cut.point).dot(cut.normal)) < 1e-5,
          ),
        );
        const tags = faces.map((face) => ({
          point: face.center.clone(),
          normal: face.normal.clone(),
          tag: SOLID_SCRIPT_FACE_BEVEL_TAG,
        }));
        run.leafReplace(leaf, { ...bevelled, faceTags: [...(leaf.faceTags ?? []), ...tags] });
        const read = solidScriptGeometryFaces([run.leafLatest(leaf)]);
        for (const face of read)
          if (
            face.tags.includes(SOLID_SCRIPT_FACE_BEVEL_TAG) &&
            faces.some((cut) => cut.center.distanceTo(face.center) < 1e-6)
          )
            made.push(run.elements.face(face));
      }
      run.selectedSet('faces', made);
      solidScriptFaceWrite(run, 'into', made);
      return [];
    },
  }),
  new SolidScriptCommand({
    id: 'delete_faces',
    edits: true,
    label: 'Delete Faces',
    category: 'Faces',
    description: 'Take faces out',
    manual:
      'Takes faces out of a mesh, leaving an opening. Of gives the faces, or a mesh for all its faces; empty uses [$Selected.Faces]. A brush stops the line: wrap it in Mesh From Brushes first. The faces leave every list that held them. Example: Mesh From Brushes around a Cube, Select Faces Facing Up, Delete Faces leaves an open box.',
    stops: ['No faces.', 'A brush. Wrap it in Mesh From Brushes first.'],
    parameters: [solidScriptParameterOf('faces or meshes', '$Selected.Faces')],
    listing: (read) => ['Delete Faces', ...(read.text('of') === '' ? [] : [' Of ', read.value('of')])],
    execute: (run) => {
      for (const [leaf, faces] of solidScriptFaceGroups(
        solidScriptFaceTargets(run, 'Delete Faces'),
        (face) => face.leaf,
      )) {
        if (leaf.kind !== 'mesh') throw new Error(SOLID_SCRIPT_MESH_NEEDS_WRAP);
        run.leafReplace(leaf, solidScriptGeometryFacesDelete(leaf, new Set(faces.map((face) => face.index))));
      }
      return [];
    },
  }),
  new SolidScriptCommand({
    id: 'texture',
    label: 'Texture',
    category: 'Faces',
    description: 'Paint brushes with a texture',
    manual:
      "Gives every face of the brushes and meshes between this line and its End the texture named by Texture, the name a texture has in the texture library. Brushes outside any Texture block keep the generator's own texture, and an inner Texture block wins over an outer one. A texture Input picks the name from the library, so the inspector can change it. Example: Input Wall, texture, then Texture [Wall] around the walls paints them with the picked texture.",
    stops: ['A missing End line.', 'A [Name] for a variable not set above this line.'],
    nesting: 'open',
    parameters: [
      {
        ...solidScriptParameterOptional(
          'texture',
          'Texture',
          'message',
          "Name of a library texture; [Name] puts in a variable, such as a texture Input. Empty keeps the generator's texture.",
        ),
        texture: true,
        accepts: ['Text'],
      },
    ],
    listing: (read) => ['Texture', read.value('texture')],
    execute: (run) => {
      const texture = solidScriptValueText(run.value('texture')).trim();
      const shapes = run.local(run.planar);
      if (texture === '') return run.placed(shapes);
      return run.placed(
        shapes.map((shape) =>
          solidScriptShapeMapLeaves(shape, (leaf) =>
            (leaf.kind === 'solid' || leaf.kind === 'mesh') && leaf.texture === undefined ? { ...leaf, texture } : leaf,
          ),
        ),
      );
    },
  }),
  new SolidScriptCommand({
    id: 'texture_faces',
    edits: true,
    label: 'Texture Faces',
    category: 'Faces',
    description: 'Paint faces with a texture',
    manual:
      'Gives faces their own library texture. Of gives the faces, or brushes for all their faces; empty uses [$Selected.Faces]. It works on brushes and wins over a Texture block around them. The faces keep it when the brush is moved, turned or scaled. Example: Cube, Select Faces Facing Up, Texture Faces grass gives a box a grass top.',
    stops: [
      'No faces.',
      'Faces of a mesh. Texture Faces works on brushes for now.',
      'An empty Texture.',
      'A [Name] for a variable not set above this line.',
    ],
    parameters: [
      {
        ...solidScriptParameter(
          'texture',
          'Texture',
          'message',
          'grass',
          'Name of a library texture; [Name] puts in a variable, such as a texture Input.',
        ),
        texture: true,
        accepts: ['Text'],
      },
      solidScriptParameterOf('faces or brushes', '$Selected.Faces'),
    ],
    listing: (read) => [
      'Texture Faces',
      read.value('texture'),
      ...(read.text('of') === '' ? [] : [' Of ', read.value('of')]),
    ],
    execute: (run) => {
      const texture = solidScriptValueText(run.value('texture')).trim();
      if (texture === '') throw new Error('Texture Faces needs a Texture name');
      for (const [leaf, faces] of solidScriptFaceGroups(
        solidScriptFaceTargets(run, 'Texture Faces'),
        (face) => face.leaf,
      )) {
        if (leaf.kind !== 'solid') throw new Error('Texture Faces works on brushes for now, not meshes');
        const added = faces.map((face) => ({ point: face.center.clone(), normal: face.normal.clone(), texture }));
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
      'Scales each face about its center, in the plane of the face. Of gives the faces, or brushes for all their faces; empty uses [$Selected.Faces]. A brush stays a brush, and a mesh stays a mesh. Factor 1 leaves the face as it is; 0.5 shrinks it toward its center, and 2 grows it. If several picked faces share a corner, the corner takes the average of those moves. A Factor that would fold a brush so it is no longer a convex brush stops the line. Example: Select Faces Facing Up, Scale Faces By 0.5 turns the top of a Cube into a smaller roof.',
    stops: [
      'No faces.',
      'A Factor that is not a number.',
      'A Factor that would fold a brush so it is no longer a convex brush.',
    ],
    parameters: [
      solidScriptParameter(
        'factor',
        'Factor',
        'number',
        '1',
        'How much to scale each face about its center, such as 0.5. 1 leaves it as it is.',
      ),
      solidScriptParameterOf('faces or brushes', '$Selected.Faces'),
    ],
    listing: (read) => [
      'Scale Faces',
      'By ',
      read.value('factor'),
      ...(read.text('of') === '' ? [] : [' Of ', read.value('of')]),
    ],
    execute: (run) => {
      const factor = run.fields().number('factor', 1);
      const targets = solidScriptFaceTargets(run, 'Scale Faces');
      for (const [leaf, faces] of solidScriptFaceGroups(targets, (face) => face.leaf))
        run.leafReplace(leaf, solidScriptScaleFaces(leaf, faces, factor, 'Scale Faces'));
      return [];
    },
  }),
];
