import { solidScriptListingOf } from './solid_script_command_listing.js';
import { solidScriptParameterOfWhere } from './solid_script_command_of_where.js';
import { SolidScriptCommand } from './solid_script_command.js';
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
  solidScriptParameterWhen,
  solidScriptParameterWords,
} from './solid_script_command_parameters.js';
import { solidScriptFaceEachNumber } from './solid_script_face_each.js';
import { solidScriptFaceTargets, solidScriptFaceWrite } from './solid_script_face_of.js';
import { solidScriptScatterIds, solidScriptScatterRun } from '@/solid_script/language/solid_script_scatter.js';
import { solidScriptMemberRound, solidScriptMemberVector } from '@/solid_script/language/solid_script_members.js';
import type * as THREE from 'three';
import type { SolidScriptBlockRun } from '@/solid_script/language/solid_script_machine_types.js';
import { solidScriptPlaceAlignMatrix } from '@/solid_script/language/solid_script_place.js';
import { solidScriptRotationDegrees } from '@/solid_script/language/solid_script_transforms.js';

/**
 * Lists a Scatter Points line: the On Faces form stays as it was, so existing
 * Where values show only the fields they use.
 *
 * @param read Line values.
 * @returns Listing parts.
 */
function solidScriptScatterListing(read: SolidScriptListingValues): SolidScriptListingPiece[] {
  const on = read.text('on').trim();
  const ids = read.text('ids') === '' ? [] : [' Ids ', read.value('ids')];
  if (on === '' || on.toLowerCase() === 'on faces') return [...solidScriptScatterListingFaces(read), ...ids];
  return [...solidScriptScatterListingOther(read, on), ...ids];
}

/**
 * Lists a Scatter Points line whose On is On Faces, or empty (the default).
 *
 * @param read Line values.
 * @returns Listing parts.
 */
function solidScriptScatterListingFaces(read: SolidScriptListingValues): SolidScriptListingPiece[] {
  return [
    'Scatter Points',
    ' ',
    ...solidScriptScatterListingAmount(read),
    ' With Seed ',
    read.value('seed'),
    ...solidScriptListingOf(read),
    ' Into ',
    read.value('into'),
    ...(read.text('normals') === '' ? [] : [' Normals ', read.value('normals')]),
    ...(read.text('rotations') === '' ? [] : [' Rotations ', read.value('rotations')]),
    ...solidScriptListingOptions([read.changed('spacing') && ['Spacing ', read.value('spacing')]]),
  ];
}

/**
 * Lists a Scatter Points line whose On is not On Faces.
 *
 * @param read Line values.
 * @param where Where word or variable.
 * @returns Listing parts.
 */
function solidScriptScatterListingOther(read: SolidScriptListingValues, on: string): SolidScriptListingPiece[] {
  const folded = on.toLowerCase();
  const grid = folded === 'grid';
  const box = grid || folded === 'in box';
  return [
    'Scatter Points',
    ' ',
    read.value('on'),
    ...(grid
      ? [' ', read.value('counts'), ' In ', read.value('size')]
      : [' ', ...solidScriptScatterListingAmount(read)]),
    ...(!grid && box ? [' In ', read.value('size')] : []),
    ...(grid ? [] : [' With Seed ', read.value('seed')]),
    ...(read.text('of') === '' || box ? [] : [' Of ', read.value('of')]),
    ' Into ',
    read.value('into'),
    ...solidScriptListingOptions([!grid && read.changed('spacing') && ['Spacing ', read.value('spacing')]]),
  ];
}

/**
 * Lists how many points a Scatter Points line gives: its Count, or Density and
 * the amount per metre when By is Density.
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

/**
 * Scatter Points: spreads points on faces, inside a shape, in a box or on a
 * grid.
 */
export const SOLID_SCRIPT_COMMAND_SCATTER = new SolidScriptCommand({
  id: 'scatter_points',
  label: 'Scatter Points',
  category: 'Points',
  description: 'Spread points on faces, inside a shape, in a box, or on a grid',
  manual:
    'Spreads points and writes their positions to Into as a list of vectors. On chooses how: On Faces (the default) spreads them over faces, more on bigger ones, and writes the way each face looks to Normals and the turn that stands a shape up on it to Rotations (X, Y, Z degrees, as Rotation reads them), and skips faces that lie back to back against another object in Of, such as where the solids of a Rotate Extrude ring meet; Inside fills the volume of an object; In Box fills a box of Size, centered on the origin; Grid lays Counts points along that box. By chooses how many: Count gives that many, and Density gives so many per square metre On Faces (it can change per face, with [$Face] the face) or per cubic metre Inside and In Box, so a bigger shape gets more. Ids gets a number for each point from where it lies, so a random value seeded by it stays with that point when other points come or go, unlike [$Index]. Spacing keeps points at least that far apart; when not all of them fit, it gives as many as fit. Of gives the faces, objects for On Faces and Inside; empty uses [$Selected.Faces]. The same Seed gives the same points for the random modes. Example: Select Faces Facing Up, Scatter Points 20 Into [Spots], then Place At Points At [Spots], Sphere, End.',
  stops: [
    'No faces, when On is On Faces or Inside.',
    'A Count that is not a whole number from 0 to 10000.',
    'An empty Into.',
    'A Size below 0, or Counts that are not whole numbers from 1 to 100 with at most 10000 points in all.',
  ],
  parameters: [
    solidScriptParameterWords(
      'on',
      'On',
      'text',
      'On Faces',
      'Where to put the points: On Faces, Inside, In Box or Grid. Type one of them, such as On Faces.',
      [
        { word: 'On Faces', detail: 'Spread over faces, more on bigger ones' },
        { word: 'Inside', detail: 'Fill the volume of an object' },
        { word: 'In Box', detail: 'Fill a box of Size, centered on the origin' },
        { word: 'Grid', detail: 'A regular grid of Counts in a box of Size' },
      ],
    ),
    solidScriptParameterWhen(
      solidScriptParameter('count', 'Count', 'number', '10', 'How many points, 0 to 10000, such as 20.'),
      'by',
      ['Count'],
    ),
    solidScriptParameterWhen(
      solidScriptParameterWords(
        'by',
        'By',
        'text',
        'Count',
        'How many points: Count gives that many, Density gives so many per square metre On Faces, or per cubic metre Inside and In Box, so bigger shapes get more. Type one, such as Density.',
        [
          { word: 'Count', detail: 'A set number of points' },
          { word: 'Density', detail: 'Points per square metre on faces, per cubic metre inside' },
        ],
      ),
      'on',
      ['On Faces', 'Inside', 'In Box'],
    ),
    solidScriptParameterWhen(
      solidScriptParameterEach(
        solidScriptParameter(
          'density',
          'Density',
          'number',
          '10',
          'Points per square metre On Faces, or per cubic metre Inside and In Box, such as 10. On Faces it can change per face, such as [=Max(0, [$Face.Normal].Y) * 20] for more on flat ground.',
        ),
        'Face',
      ),
      'by',
      ['Density'],
    ),
    solidScriptParameterWhen(
      solidScriptParameter(
        'spacing',
        'Spacing',
        'number',
        '0',
        'Smallest distance between two points, in metres, such as 0.5. With 0 they may lie anywhere. When not all of them fit, it gives as many as fit.',
      ),
      'on',
      ['On Faces', 'Inside', 'In Box'],
    ),
    solidScriptParameterWhen(
      solidScriptParameter('seed', 'Seed', 'number', '0', 'Any number, such as 1; another seed gives other points.'),
      'on',
      ['On Faces', 'Inside', 'In Box'],
    ),
    solidScriptParameterWhen(solidScriptParameterOfWhere('Face', '[=[$Face.Normal.Y] > 0.9]'), 'on', ['On Faces']),
    solidScriptParameterWhen(solidScriptParameterOf('faces, objects', '$Selected.Faces'), 'on', ['On Faces', 'Inside']),
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
      'on',
      ['On Faces'],
    ),
    solidScriptParameterWhen(
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
      'on',
      ['On Faces'],
    ),
    {
      ...solidScriptParameterInto(
        'a steady number for each point, worked out from where it lies, a list of numbers',
        'Number List',
        'point ids',
        'label',
      ),
      key: 'ids',
      label: 'Ids',
    },
    solidScriptParameterWhen(
      solidScriptParameter(
        'size',
        'Size',
        'vector3',
        '1, 1, 1',
        'Width, height and depth of the box, in metres, for In Box and Grid, such as 4, 2, 4.',
      ),
      'on',
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
      'on',
      ['Grid'],
    ),
  ],
  listing: (read) => solidScriptScatterListing(read),
  execute: (run) => {
    const found = solidScriptScatterRun(
      run,
      () => solidScriptFaceTargets(run, 'Scatter Points'),
      (faces) =>
        solidScriptFaceEachNumber(
          run,
          'density',
          faces,
          'Density needs a number of points per square metre, such as 10',
        ),
    );
    solidScriptFaceWrite(
      run,
      'into',
      found.positions.map((point) => solidScriptMemberVector(point)),
    );
    if (found.normals) solidScriptScatterWriteFaces(run, found.normals);
    solidScriptFaceWrite(run, 'ids', solidScriptScatterIds(found.positions));
    return [];
  },
});
