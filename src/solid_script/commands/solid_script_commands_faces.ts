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
import { solidScriptPlaceMatrices } from '@/solid_script/language/solid_script_place.js';
import { solidScriptFaceGroups, solidScriptFaceTargets, solidScriptFaceWrite } from './solid_script_face_of.js';
import { solidScriptScaleFaces } from '@/solid_script/language/solid_script_scale_faces.js';
import { solidScriptScatterRun } from '@/solid_script/language/solid_script_scatter.js';
import {
  solidScriptGeometryBevel,
  solidScriptGeometryFaceMatrix,
  solidScriptGeometryFacePrism,
  solidScriptGeometryFaces,
  solidScriptGeometryFacesDelete,
  solidScriptGeometryInset,
  solidScriptGeometryPick,
  type SolidScriptEdgeFacts,
  type SolidScriptFaceFacts,
  type SolidScriptFacePick,
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
import {
  SolidScriptElement,
  solidScriptValueNumber,
  solidScriptValueNumbers,
  solidScriptValueText,
  solidScriptValueTruthy,
  type SolidScriptValue,
} from '@/solid_script/language/solid_script_value.js';

/** Ways Select Faces picks, with the direction of each side choice. */
const SOLID_SCRIPT_FACE_DIRECTIONS: Readonly<Record<string, THREE.Vector3>> = SOLID_SCRIPT_AXES_FACING;

/**
 * Every choice of Select Faces' Which field with what it picks, in the order
 * the help lists them.
 */
const SOLID_SCRIPT_FACE_WHICH_WORDS: readonly SolidScriptCommandWord[] = [
  { word: 'All', detail: 'Every face' },
  ...Object.entries(SOLID_SCRIPT_FACE_DIRECTIONS).map(([word, direction]) => {
    const axis = (['x', 'y', 'z'] as const).find((key) => direction[key] !== 0) ?? 'z';
    const sign = direction[axis] > 0 ? '+' : '−';
    return {
      word,
      detail: `Faces pointing ${word.toLowerCase()} (${sign}${axis.toUpperCase()}). Example: Select Faces Which ${word}, then Extrude Face By 1.`,
    };
  }),
  { word: 'Facing', detail: 'Faces pointing along Detail' },
  { word: 'Tagged', detail: 'Faces tagged with the name in Detail' },
  { word: 'Biggest', detail: 'The largest faces; Detail says how many' },
  { word: 'Smallest', detail: 'The smallest faces; Detail says how many' },
  { word: 'Number', detail: 'Faces by number; Detail lists them' },
  { word: 'Where', detail: 'Faces where the condition in Detail holds' },
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
 * Reads how Select Faces picks.
 *
 * @param run Running line.
 * @returns Pick.
 */
function solidScriptFacePickRead(run: SolidScriptBlockRun): SolidScriptFacePick {
  const which = run.text('which').trim();
  const direction = SOLID_SCRIPT_FACE_DIRECTIONS[which];
  const within = (): number => {
    const number = solidScriptValueNumber(run.value('within'));
    if (number === undefined || number < 0 || number > 180)
      throw new Error('Within needs a number of degrees, 0 to 180');
    return number;
  };
  if (direction) return { by: 'facing', direction, within: within() };
  switch (which) {
    case 'All':
      return { by: 'all' };
    case 'Facing': {
      const numbers = solidScriptValueNumbers(run.value('detail'));
      if (numbers?.length !== 3)
        throw new Error('Facing needs a direction in Detail, three numbers such as 0, 1, 0 for up');
      return { by: 'facing', direction: new THREE.Vector3(...numbers).normalize(), within: within() };
    }
    case 'Tagged': {
      const tag = run.text('detail').trim();
      if (tag === '') throw new Error('Tagged needs a name in Detail, such as Top, Side or Step Tread');
      return { by: 'tag', tag };
    }
    case 'Biggest':
    case 'Smallest': {
      const count = run.text('detail').trim() === '' ? 1 : solidScriptValueNumber(run.value('detail'));
      if (count === undefined || !Number.isInteger(count) || count < 1)
        throw new Error(`${which} needs a whole number of faces in Detail, such as 1`);
      return { by: which === 'Biggest' ? 'biggest' : 'smallest', count };
    }
    case 'Number': {
      const value = run.value('detail');
      const numbers = Array.isArray(value) ? solidScriptValueNumbers(value) : [solidScriptValueNumber(value)];
      if (!numbers || numbers.some((number) => number === undefined))
        throw new Error('Number needs face numbers in Detail, such as 0 or 0, 2, 4');
      return { by: 'numbers', numbers: numbers as number[] };
    }
    case 'Where':
      return {
        by: 'where',
        holds: (face) =>
          solidScriptValueTruthy(run.valueWith('detail', { $Face: run.elements.face(face), $Index: face.index })),
      };
    default:
      throw new Error(`Which must be one of ${SOLID_SCRIPT_FACE_WHICH.join(', ')}, not "${which}"`);
  }
}

/**
 * Lists a Scatter Points line: the default Faces form omits Where, and other
 * Where values show only the fields they use.
 *
 * @param read Line values.
 * @returns Listing parts.
 */
function solidScriptScatterListing(read: SolidScriptListingValues): SolidScriptListingPiece[] {
  const where = read.text('where').trim();
  if (where === '' || where.toLowerCase() === 'faces') return solidScriptScatterListingFaces(read);
  return solidScriptScatterListingOther(read, where);
}

/**
 * Lists a Scatter Points line whose Where is Faces, or empty (the default).
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
    read.variable('into'),
    ...(read.text('normals') === '' ? [] : [' Normals ', read.variable('normals')]),
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
    read.variable('into'),
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
      'Picks faces and puts them in [$Selected.Faces], where Extrude Face, Inset Face, Bevel Edges, Delete Faces and Texture Faces find them when their Of is empty. Of says where to pick from: brushes (all their faces) or faces (a list to narrow down); empty uses [$Selected.Brushes], every brush built above. Into also writes the faces to a variable, a Face list. Where tests each face as [$Face], and [$Index] is its number from 0; [$CX], [$CY] and [$CZ] are short forms of [$Face.Center.X] and the other axes, and [$NX], [$NY] and [$NZ] of [$Face.Normal]. How adds to or removes from the faces picked before. Inside a For Each round the pick stays in that round. Example: Cube, then Select Faces Which Up and Extrude Face By 1 pulls the top up.',
    stops: [
      'No brushes to pick from.',
      'A Which that is not one of the choices.',
      'A Detail that does not fit the Which.',
      'An Of that is not brushes or faces.',
    ],
    parameters: [
      solidScriptParameterWords(
        'which',
        'Which',
        'text',
        'Up',
        `How to pick. One of: ${SOLID_SCRIPT_FACE_WHICH.join(', ')}.`,
        SOLID_SCRIPT_FACE_WHICH_WORDS,
      ),
      {
        ...solidScriptParameterOptional(
          'detail',
          'Detail',
          'value',
          'The name for Tagged, how many for Biggest or Smallest, numbers for Number, a direction for Facing, a condition for Where such as [=[$Face.Area] > 1], with [$Face] the face being tested and [$Index] its number from 0.',
        ),
        each: 'Face',
        eachWhen: { field: 'which', words: ['Where'] },
      },
      solidScriptParameterOf('brushes or faces to pick from', '$Selected.Brushes'),
      solidScriptParameter(
        'within',
        'Within',
        'number',
        '30',
        'Degrees a face may lean and still count as facing that way.',
      ),
      solidScriptParameterWords(
        'how',
        'How',
        'text',
        'New',
        'New starts again, Add picks more, Remove drops faces. One of: New, Add, Remove.',
        SOLID_SCRIPT_FACE_HOW.map((word) => ({ word, detail: SOLID_SCRIPT_FACE_HOW_DETAILS[word] })),
      ),
      solidScriptParameterInto('the picked faces, a Face list', 'Face List', 'what is made'),
    ],
    listing: (read) => {
      const which = read.text('which').trim();
      const facing = which in SOLID_SCRIPT_FACE_DIRECTIONS || which === 'Facing';
      return [
        'Select Faces',
        which,
        ...(read.text('detail').trim() === '' ? [] : [' ', read.value('detail')]),
        ...(read.text('of') === '' ? [] : [' Of ', read.value('of')]),
        ...(facing && read.changed('within') ? [' within ', read.value('within'), '°'] : []),
        ...solidScriptListingOptions([read.text('how').trim() !== 'New' && [read.text('how').trim()]]),
        ...(read.text('into') === '' ? [] : [' Into ', read.variable('into')]),
      ];
    },
    execute: (run) => {
      const how = run.text('how').trim();
      if (!(SOLID_SCRIPT_FACE_HOW as readonly string[]).includes(how))
        throw new Error(`How must be New, Add or Remove, not "${how}"`);
      const given = run.ofValues();
      const from = given ?? run.selectedGet('brushes');
      const faces: SolidScriptFaceFacts[] = [];
      for (const value of from) {
        if (!(value instanceof SolidScriptElement) || (value.kind !== 'face' && value.kind !== 'brush'))
          throw new Error(`Select Faces picks from brushes or faces, not ${solidScriptKindNamed(value)}`);
        faces.push(...run.elements.faces(value));
      }
      if (faces.length === 0)
        throw new Error('Select Faces has no faces to pick from; add a brush such as Cube or Input Brushes above it');
      const picked = solidScriptGeometryPick(faces, solidScriptFacePickRead(run)).map((face) =>
        run.elements.face(face),
      );
      const before = how === 'New' ? [] : run.selectedGet('faces');
      const after =
        how === 'Remove'
          ? before.filter((face) => !picked.includes(face as SolidScriptElement))
          : [...before, ...picked.filter((face) => !before.includes(face))];
      run.selectedSet('faces', after);
      solidScriptFaceWrite(run, 'into', after);
      return [];
    },
  }),
  new SolidScriptCommand({
    id: 'scatter_points',
    label: 'Scatter Points',
    category: 'Faces',
    description: 'Spread points on faces, inside a shape, in a box, or on a grid',
    manual:
      'Spreads points and writes their positions to Into as a list of vectors. Where chooses how: Faces (the default) spreads them over faces, more on bigger ones, and writes the way each face looks to Normals; Inside fills the volume of a brush or mesh; Box fills a box of Size, centered on the origin; Grid lays Counts points along that box. Of gives the faces, brushes or meshes for Faces and Inside; empty uses [$Selected.Faces]. The same Seed gives the same points for the random modes. Example: Select Faces Which Up, Scatter Points 20 Into [Spots], then Place At Points At [Spots], Sphere, End.',
    stops: [
      'No faces, when Where is Faces or Inside.',
      'A Count that is not a whole number from 0 to 10000.',
      'An empty Into.',
      'A Size below 0, or Counts that are not whole numbers from 1 to 100 with at most 10000 points in all.',
    ],
    parameters: [
      solidScriptParameterWords(
        'where',
        'Where',
        'text',
        'Faces',
        'Where to put the points: Faces, Inside, Box or Grid.',
        [
          {
            word: 'Faces',
            detail:
              'Spread over faces, more on bigger ones. Example: Scatter Points Where Faces, Count 20 Into [Spots].',
          },
          { word: 'Inside', detail: 'Fill the volume of a brush or mesh' },
          {
            word: 'Box',
            detail:
              'Fill a box of Size, centered on the origin. Example: Scatter Points Where Box, Size 2, 2, 2, Count 20.',
          },
          { word: 'Grid', detail: 'A regular grid of Counts in a box of Size' },
        ],
      ),
      solidScriptParameterWhen(
        solidScriptParameter('count', 'Count', 'number', '10', 'How many points, 0 to 10000.'),
        'where',
        ['Faces', 'Inside', 'Box'],
      ),
      solidScriptParameterWhen(
        solidScriptParameter('seed', 'Seed', 'number', '0', 'Any number; another seed gives other points.'),
        'where',
        ['Faces', 'Inside', 'Box'],
      ),
      solidScriptParameterWhen(solidScriptParameterOf('faces, brushes or meshes', '$Selected.Faces'), 'where', [
        'Faces',
        'Inside',
      ]),
      {
        ...solidScriptParameterInto('the points, a list of vectors', 'Vector List', 'what is made'),
        hint: 'Variable to write the points to, a list of vectors.',
        optional: false,
        default: 'Points',
      },
      solidScriptParameterWhen(
        {
          ...solidScriptParameterInto(
            'the way the face under each point looks, a list of vectors',
            'Vector List',
            'face directions',
          ),
          key: 'normals',
          label: 'Normals',
        },
        'where',
        ['Faces'],
      ),
      solidScriptParameterWhen(
        solidScriptParameter(
          'size',
          'Size',
          'vector3',
          '1, 1, 1',
          'Width, height and depth of the box, in metres, for Box and Grid.',
        ),
        'where',
        ['Box', 'Grid'],
      ),
      solidScriptParameterWhen(
        solidScriptParameter(
          'counts',
          'Counts',
          'vector3',
          '3, 3, 3',
          'How many grid points stand along width, height and depth.',
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
    manual:
      'Builds the brushes between this line and its End standing on a face: up is the way the face points and the center is the middle of the face. Of gives the face, such as [Face] in For Each [Face] In [$Selected.Faces]; given several faces it builds them on each. Empty Of uses [$Selected.Faces]. Lift moves them out from the face. Example: For Each [Face] In [$Selected.Faces], Place On Face Of [Face], Cylinder, End, End puts a post on every picked face.',
    stops: ['No faces.', 'Nothing between this line and its End.', 'A missing End line.'],
    nesting: 'open',
    endLabel: 'Place',
    parameters: [
      solidScriptParameterOf('faces', '$Selected.Faces'),
      solidScriptParameter('lift', 'Lift', 'number', '0', 'Metres to move the brushes out from the face.'),
    ],
    listing: (read) => [
      'Place On Face',
      ...(read.text('of') === '' ? [] : [' Of ', read.value('of')]),
      ...solidScriptListingOptions([read.changed('lift') && ['Lift ', read.value('lift')]]),
    ],
    execute: (run) => {
      const lift = solidScriptValueNumber(run.value('lift'));
      if (lift === undefined) throw new Error('Lift needs a number of metres, such as 0');
      return solidScriptFaceTargets(run, 'Place On Face').flatMap((face) =>
        run.framed(solidScriptGeometryFaceMatrix(face).multiply(new THREE.Matrix4().makeTranslation(0, lift, 0))),
      );
    },
  }),

  new SolidScriptCommand({
    id: 'place_at_points',
    label: 'Place At Points',
    category: 'Faces',
    description: 'Stand brushes at a list of points',
    manual:
      'Builds the brushes between this line and its End at each point in At, a list of vectors such as the points Scatter Points writes. Directions, when given, turns up (Y) along the matching entry, one per point; leave it empty to keep world up. Lift moves them out along that up. Example: Scatter Points 20 Into [Spots] Normals [Dirs], then Place At Points At [Spots] Directions [Dirs], Sphere, End, puts a ball on every point, standing on the face.',
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
      solidScriptParameter('lift', 'Lift', 'number', '0', 'Metres to move the brushes out along up.'),
    ],
    listing: (read) => [
      'Place At Points',
      ' At ',
      read.value('at'),
      ...(read.text('directions') === '' ? [] : [' Directions ', read.value('directions')]),
      ...solidScriptListingOptions([read.changed('lift') && ['Lift ', read.value('lift')]]),
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
      'Pulls faces out along the way they point. On a brush each face becomes a new brush, a slab standing on it, and Into gets those brushes; on a mesh the face itself moves out. Of gives the faces, or brushes for all their faces; empty uses [$Selected.Faces]. Top and Sides name variables for the new faces: Top the moved or capping faces and Sides the new side faces, as the operation builds them. Afterwards [$Selected.Faces] holds the top faces. Lift moves a slab away from its face. Example: Select Faces Which Up, Extrude Face By 1, Top [Roof].',
    stops: ['No faces.', 'A negative Distance on a brush.', 'A Lift on a mesh.'],
    parameters: [
      solidScriptParameter('distance', 'Distance', 'number', '0.2', 'Metres to pull out.'),
      solidScriptParameterOptional(
        'lift',
        'Lift',
        'number',
        'Metres between a brush face and its slab; empty is 0. Brushes only.',
      ),
      solidScriptParameterOf('faces or brushes', '$Selected.Faces'),
      solidScriptParameterInto('the new brushes, a Brush list', 'Brush List', 'what is made'),
      { ...solidScriptParameterInto('the top faces, a Face list', 'Face List', 'top faces'), key: 'top', label: 'Top' },
      {
        ...solidScriptParameterInto('the new side faces, a Face list', 'Face List', 'side faces'),
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
      ...(read.text('into') === '' ? [] : [' Into ', read.variable('into')]),
      ...(read.text('top') === '' ? [] : [' Top ', read.variable('top')]),
      ...(read.text('sides') === '' ? [] : [' Sides ', read.variable('sides')]),
    ],
    execute: (run) => {
      const distance = solidScriptFaceDistance(run, 'Distance');
      const lift = run.text('lift').trim() === '' ? 0 : solidScriptValueNumber(run.value('lift'));
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
              slab: { kind: 'solid', label: 'Slab', points: solidScriptGeometryFacePrism(face, distance, lift) },
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
      'Gives each face of a mesh a smaller copy of itself inside, joined to the old outline by a ring of faces. Of gives the faces; empty uses [$Selected.Faces]. A brush stops the line: wrap it in Mesh From Brushes first. Inner and Ring name variables for the new faces, as the operation builds them. Afterwards [$Selected.Faces] holds the inner faces. Example: Mesh From Brushes around a Cube, Select Faces Which Up, Inset Face By 0.1, Extrude Face By -0.2 sinks a tray.',
    stops: ['No faces.', 'A brush. Wrap it in Mesh From Brushes first.'],
    parameters: [
      solidScriptParameter('distance', 'Distance', 'number', '0.1', 'Metres from the old edge to the new one.'),
      solidScriptParameterOf('faces', '$Selected.Faces'),
      {
        ...solidScriptParameterInto('the inner faces, a Face list', 'Face List', 'inner faces'),
        key: 'inner',
        label: 'Inner',
      },
      {
        ...solidScriptParameterInto('the ring faces, a Face list', 'Face List', 'ring faces'),
        key: 'ring',
        label: 'Ring',
      },
    ],
    listing: (read) => [
      'Inset Face',
      'By ',
      read.value('distance'),
      ...(read.text('of') === '' ? [] : [' Of ', read.value('of')]),
      ...(read.text('inner') === '' ? [] : [' Inner ', read.variable('inner')]),
      ...(read.text('ring') === '' ? [] : [' Ring ', read.variable('ring')]),
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
      solidScriptParameter('distance', 'Distance', 'number', '0.1', 'Metres to cut back along each side.'),
      solidScriptParameterOf('edges, faces or brushes', '$Selected.Edges', ['Brush', 'Face', 'Edge']),
      solidScriptParameterInto('the new faces, a Face list', 'Face List', 'what is made'),
    ],
    listing: (read) => [
      'Bevel Edges',
      'By ',
      read.value('distance'),
      ...(read.text('of') === '' ? [] : [' Of ', read.value('of')]),
      ...(read.text('into') === '' ? [] : [' Into ', read.variable('into')]),
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
        const { points, cuts } = solidScriptGeometryBevel(leaf, edges, distance);
        const bevelled: SolidScriptShapeSolid = { ...leaf, points };
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
      'Takes faces out of a mesh, leaving an opening. Of gives the faces, or a mesh for all its faces; empty uses [$Selected.Faces]. A brush stops the line: wrap it in Mesh From Brushes first. The faces leave every list that held them. Example: Mesh From Brushes around a Cube, Select Faces Which Up, Delete Faces leaves an open box.',
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
      'Gives faces their own library texture. Of gives the faces, or brushes for all their faces; empty uses [$Selected.Faces]. It works on brushes and wins over a Texture block around them. The faces keep it when the brush is moved, turned or scaled. Example: Cube, Select Faces Which Up, Texture Faces grass gives a box a grass top.',
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
      'Scales each face about its center, in the plane of the face. Of gives the faces, or brushes for all their faces; empty uses [$Selected.Faces]. A brush stays a brush, and a mesh stays a mesh. Factor 1 leaves the face as it is; 0.5 shrinks it toward its center, and 2 grows it. If several picked faces share a corner, the corner takes the average of those moves. A Factor that would fold a brush so it is no longer a convex brush stops the line. Example: Select Faces Which Up, Scale Faces By 0.5 turns the top of a Cube into a smaller roof.',
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
        'How much to scale each face about its center; 1 leaves it as it is.',
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
