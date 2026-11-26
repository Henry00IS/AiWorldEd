import { solidScriptListingOf } from './solid_script_command_listing.js';
import { solidScriptParameterOfWhere } from './solid_script_command_of_where.js';
import { SolidScriptCommand, type SolidScriptCommandParameter } from './solid_script_command.js';
import { solidScriptParameterEach } from './solid_script_command_each.js';
import {
  solidScriptListingOptions,
  type SolidScriptListingPiece,
  type SolidScriptListingValues,
} from './solid_script_command_listing.js';
import {
  solidScriptParameter,
  solidScriptParameterInto,
  solidScriptParameterOf,
  solidScriptParameterWords,
} from './solid_script_command_parameters.js';
import { solidScriptFaceEachNumber } from './solid_script_face_each.js';
import { solidScriptFaceTargets, solidScriptFaceWrite } from './solid_script_face_of.js';
import {
  solidScriptScatterIds,
  solidScriptScatterKeep,
  solidScriptScatterRun,
  type SolidScriptScatterOn,
} from '@/solid_script/language/solid_script_scatter.js';
import { solidScriptMemberRound, solidScriptMemberVector } from '@/solid_script/language/solid_script_members.js';
import type * as THREE from 'three';
import type { SolidScriptBlockRun } from '@/solid_script/language/solid_script_machine_types.js';
import { solidScriptPlaceAlignMatrix } from '@/solid_script/language/solid_script_place.js';
import { solidScriptRotationDegrees } from '@/solid_script/language/solid_script_transforms.js';

/**
 * Lists how many points a scatter line gives: its Count, or Density and the
 * amount per metre when By is Density.
 *
 * @param read Line values.
 * @returns Listing parts.
 */
function solidScriptScatterListingAmount(read: SolidScriptListingValues): SolidScriptListingPiece[] {
  return read.text('by').trim().toLowerCase() === 'density'
    ? [read.value('by'), ' ', read.value('density')]
    : [read.value('count')];
}

/**
 * Lists a scatter line: its name, what it uses, Into, then the results and
 * options that are set.
 *
 * @param spec Scatter block.
 * @param read Line values.
 * @returns Listing parts.
 */
function solidScriptScatterListing(
  spec: SolidScriptScatterSpec,
  read: SolidScriptListingValues,
): SolidScriptListingPiece[] {
  const has = (key: string) => spec.fields.some((field) => field.key === key);
  const set = (key: string, label: string) =>
    has(key) && read.text(key) !== '' ? [` ${label} `, read.value(key)] : [];
  return [
    spec.label,
    ' ',
    ...(has('counts') ? [read.value('counts'), ' In ', read.value('size')] : solidScriptScatterListingAmount(read)),
    ...(has('counts') || !has('size') ? [] : [' In ', read.value('size')]),
    ' With Seed ',
    read.value('seed'),
    ...(has('of') ? solidScriptListingOf(read) : []),
    ' Into ',
    read.value('into'),
    ...set('normals', 'Normals'),
    ...set('rotations', 'Rotations'),
    ...set('ids', 'Ids'),
    ...solidScriptListingOptions([
      has('spacing') && read.changed('spacing') && ['Spacing ', read.value('spacing')],
      read.changed('keep') && ['Keep ', read.value('keep')],
    ]),
  ];
}

/**
 * Writes the way the face under each point looks to Normals, and the turn that
 * stands a shape up along it, in X, Y, Z degrees as Rotation reads them, to
 * Rotations.
 *
 * @param run Running line.
 * @param normals Face direction under each point.
 */
function solidScriptScatterWriteFaces(run: SolidScriptBlockRun, normals: readonly THREE.Vector3[]): void {
  solidScriptFaceWrite(
    run,
    'normals',
    normals.map((normal) => solidScriptMemberVector(normal)),
  );
  if (run.text('rotations').trim() === '') return;
  solidScriptFaceWrite(
    run,
    'rotations',
    normals.map((normal) =>
      solidScriptRotationDegrees(solidScriptPlaceAlignMatrix(normal)).map(solidScriptMemberRound),
    ),
  );
}

/** What differs between the four scatter blocks. */
interface SolidScriptScatterSpec {
  id: string;
  label: string;
  on: SolidScriptScatterOn;
  description: string;
  manual: string;
  stops: readonly string[];
  /** Fields between Keep and Into, and after Into for the results. */
  fields: readonly SolidScriptCommandParameter[];
  results: readonly SolidScriptCommandParameter[];
}

/** Text every scatter block's manual ends with. */
const SOLID_SCRIPT_SCATTER_MANUAL_END =
  'Ids gets a number for each point from where it lies, so a random value seeded by it stays with that point when other points come or go, unlike [$Index]. The 🔁 Keep is the chance, from 0 to 1, that each point stays, with [$Point] the point: every point draws one steady number from its Id and the Seed, so raising Keep only adds points.';

/** Fields of the scatter blocks, by key. */
const SOLID_SCRIPT_SCATTER_FIELDS = {
  by: solidScriptParameterWords(
    'by',
    'By',
    'text',
    'Count',
    'How many points: Count gives Count points, Density gives Density points per square metre on faces, or per cubic metre inside, so bigger shapes get more. Type one, such as Density.',
    [
      { word: 'Count', detail: 'A set number of points' },
      { word: 'Density', detail: 'Points per square metre on faces, per cubic metre inside' },
    ],
  ),
  count: solidScriptParameter(
    'count',
    'Count',
    'number',
    '10',
    'How many points when By is Count, 0 to 10000, such as 20.',
  ),
  density: solidScriptParameter(
    'density',
    'Density',
    'number',
    '10',
    'Points per cubic metre when By is Density, such as 10.',
  ),
  spacing: solidScriptParameter(
    'spacing',
    'Spacing',
    'number',
    '0',
    'Smallest distance between two points, in metres, such as 0.5. With 0 they may lie anywhere. When not all of them fit, it gives as many as fit.',
  ),
  keep: solidScriptParameterEach(
    solidScriptParameter(
      'keep',
      'Keep',
      'number',
      '1',
      'Chance from 0 to 1 that each point stays, such as 0.5; it can change per point, such as [=Noise([$Point.Position], 0.2)] for patches.',
    ),
    'Point',
  ),
  seed: solidScriptParameter('seed', 'Seed', 'number', '0', 'Any number, such as 1; another seed gives other points.'),
  size: solidScriptParameter(
    'size',
    'Size',
    'vector3',
    '1, 1, 1',
    'Width, height and depth of the box, in metres, such as 4, 2, 4.',
  ),
  into: {
    ...solidScriptParameterInto('the points, a list of vectors', 'Vector List', 'what is made', 'label'),
    hint: 'Variable to write the points to, a list of vectors, such as Path.',
    optional: false,
    default: 'Points',
  } as SolidScriptCommandParameter,
  ids: {
    ...solidScriptParameterInto(
      'a steady number for each point, worked out from where it lies, a list of numbers',
      'Number List',
      'point ids',
      'label',
    ),
    key: 'ids',
    label: 'Ids',
  } as SolidScriptCommandParameter,
} as const;

/** By and Count: how many points a random scatter block gives. */
const SOLID_SCRIPT_SCATTER_RANDOM: readonly SolidScriptCommandParameter[] = [
  SOLID_SCRIPT_SCATTER_FIELDS.by,
  SOLID_SCRIPT_SCATTER_FIELDS.count,
];

/**
 * Runs a scatter line and writes its points, face directions and ids.
 *
 * @param spec Scatter block.
 * @param run Running line.
 * @returns No new shapes.
 */
function solidScriptScatterExecute(spec: SolidScriptScatterSpec, run: SolidScriptBlockRun): [] {
  const scattered = solidScriptScatterRun(
    run,
    spec.on,
    () => solidScriptFaceTargets(run, spec.label),
    (faces) =>
      solidScriptFaceEachNumber(run, 'density', faces, 'Density needs a number of points per square metre, such as 10'),
  );
  const found = solidScriptScatterKeep(run, scattered);
  solidScriptFaceWrite(
    run,
    'into',
    found.positions.map((point) => solidScriptMemberVector(point)),
  );
  if (found.normals) solidScriptScatterWriteFaces(run, found.normals);
  solidScriptFaceWrite(run, 'ids', solidScriptScatterIds(found.positions));
  return [];
}

/**
 * Builds one scatter block from what makes it different.
 *
 * @param spec Scatter block.
 * @returns Command.
 */
function solidScriptScatterCommand(spec: SolidScriptScatterSpec): SolidScriptCommand {
  return new SolidScriptCommand({
    id: spec.id,
    label: spec.label,
    category: 'Points',
    description: spec.description,
    synonyms: ['scatter', 'spread', 'random points', 'distribute'],
    manual: `Spreads points and writes their positions to Into as a list of vectors. ${spec.manual} ${SOLID_SCRIPT_SCATTER_MANUAL_END}`,
    stops: [...spec.stops, 'An empty Into.'],
    parameters: [
      ...spec.fields,
      SOLID_SCRIPT_SCATTER_FIELDS.keep,
      SOLID_SCRIPT_SCATTER_FIELDS.seed,
      ...spec.results.filter((field) => field.key === 'where' || field.key === 'of'),
      SOLID_SCRIPT_SCATTER_FIELDS.into,
      ...spec.results.filter((field) => field.key !== 'where' && field.key !== 'of'),
      SOLID_SCRIPT_SCATTER_FIELDS.ids,
    ],
    listing: (read) => solidScriptScatterListing(spec, read),
    execute: (run) => solidScriptScatterExecute(spec, run),
  });
}

/** Stops of the scatter blocks that count or measure how many points to give. */
const SOLID_SCRIPT_SCATTER_AMOUNT_STOPS = [
  'A Count that is not a whole number from 0 to 10000.',
  'A By other than Count or Density.',
];

/** Scatter On Faces: spreads points over faces. */
const SOLID_SCRIPT_COMMAND_SCATTER_ON_FACES = solidScriptScatterCommand({
  id: 'scatter_on_faces',
  label: 'Scatter On Faces',
  on: 'On Faces',
  description: 'Spread points over faces',
  manual:
    'Spreads them over the faces in Of, more on bigger ones, writes the way each face looks to Normals and the turn that stands a shape up on it to Rotations (X, Y, Z degrees, as Rotation reads them), and skips faces that lie back to back against another object in Of, such as where the solids of a Rotate Extrude ring meet. By Count gives Count points; By Density gives Density points per square metre, which can change per face with [$Face] the face. Spacing keeps points at least that far apart. Of empty uses [$Selected.Faces]. The same Seed gives the same points. Example: Select Faces Facing Up, Scatter On Faces 20 Into [Spots], then Place At Points At [Spots], Sphere, End.',
  stops: ['No faces.', ...SOLID_SCRIPT_SCATTER_AMOUNT_STOPS],
  fields: [
    ...SOLID_SCRIPT_SCATTER_RANDOM,
    solidScriptParameterEach(
      {
        ...SOLID_SCRIPT_SCATTER_FIELDS.density,
        hint: 'Points per square metre when By is Density, such as 10; it can change per face, such as [=Max(0, [$Face.Normal].Y) * 20] for more on flat ground.',
      },
      'Face',
    ),
    SOLID_SCRIPT_SCATTER_FIELDS.spacing,
  ],
  results: [
    solidScriptParameterOfWhere('Face', '[=[$Face.Normal.Y] > 0.9]'),
    solidScriptParameterOf('faces, objects', '$Selected.Faces'),
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
    {
      ...solidScriptParameterInto(
        'the turn that stands a shape up on the face under each point, in X, Y, Z degrees, a list of vectors',
        'Vector List',
        'face rotations',
        'label',
      ),
      key: 'rotations',
      label: 'Rotations',
    },
  ],
});

/** Scatter Inside, Scatter In Box and Scatter In Grid. */
const SOLID_SCRIPT_COMMANDS_SCATTER_VOLUMES: readonly SolidScriptCommand[] = [
  solidScriptScatterCommand({
    id: 'scatter_inside',
    label: 'Scatter Inside',
    on: 'Inside',
    description: 'Spread points inside a shape',
    manual:
      'Fills the volume of the objects in Of, more in bigger ones. By Count gives Count points; By Density gives Density points per cubic metre. Spacing keeps points at least that far apart. Of empty uses [$Selected.Faces]. The same Seed gives the same points. Example: Scatter Inside 50 Of [Rock] Into [Grains].',
    stops: ['No faces.', 'An object with no volume.', ...SOLID_SCRIPT_SCATTER_AMOUNT_STOPS],
    fields: [...SOLID_SCRIPT_SCATTER_RANDOM, SOLID_SCRIPT_SCATTER_FIELDS.density, SOLID_SCRIPT_SCATTER_FIELDS.spacing],
    results: [
      solidScriptParameterOfWhere('Face', '[=[$Face.Normal.Y] > 0.9]'),
      solidScriptParameterOf('faces, objects', '$Selected.Faces'),
    ],
  }),
  solidScriptScatterCommand({
    id: 'scatter_in_box',
    label: 'Scatter In Box',
    on: 'In Box',
    description: 'Spread points in a box',
    manual:
      'Fills a box of Size, centered on the origin and moved by the blocks around the line. By Count gives Count points; By Density gives Density points per cubic metre. Spacing keeps points at least that far apart. The same Seed gives the same points. Example: Scatter In Box 16 In 2, 1.2, 2 Into [Spots].',
    stops: [...SOLID_SCRIPT_SCATTER_AMOUNT_STOPS, 'A Size below 0.'],
    fields: [
      ...SOLID_SCRIPT_SCATTER_RANDOM,
      SOLID_SCRIPT_SCATTER_FIELDS.density,
      SOLID_SCRIPT_SCATTER_FIELDS.spacing,
      SOLID_SCRIPT_SCATTER_FIELDS.size,
    ],
    results: [],
  }),
  solidScriptScatterCommand({
    id: 'scatter_in_grid',
    label: 'Scatter In Grid',
    on: 'In Grid',
    description: 'Lay points on a grid in a box',
    manual:
      'Lays Counts points along the width, height and depth of a box of Size, centered on the origin and moved by the blocks around the line, the first and last on its sides. Example: Scatter In Grid 4, 1, 4 In 6, 0, 6 Into [Spots] Keep 0.5.',
    stops: ['A Size below 0, or Counts that are not whole numbers from 1 to 100 with at most 10000 points in all.'],
    fields: [
      SOLID_SCRIPT_SCATTER_FIELDS.size,
      solidScriptParameter(
        'counts',
        'Counts',
        'vector3',
        '3, 3, 3',
        'How many grid points stand along width, height and depth, such as 4, 1, 4.',
      ),
    ],
    results: [],
  }),
];

/** The scatter blocks: on faces, inside a shape, in a box or on a grid. */
export const SOLID_SCRIPT_COMMANDS_SCATTER: readonly SolidScriptCommand[] = [
  SOLID_SCRIPT_COMMAND_SCATTER_ON_FACES,
  ...SOLID_SCRIPT_COMMANDS_SCATTER_VOLUMES,
];
