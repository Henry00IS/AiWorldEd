import { solidScriptListingOf } from './solid_script_command_listing.js';
import { solidScriptParameterOfWhere } from './solid_script_command_of_where.js';
import {
  SolidScriptCommand,
  type SolidScriptCommandParameter,
  type SolidScriptCommandSpec,
} from './solid_script_command.js';
import { solidScriptListingOptions } from './solid_script_command_listing.js';
import { solidScriptParameterEach } from './solid_script_command_each.js';
import {
  solidScriptOfAccepts,
  solidScriptParameter,
  solidScriptParameterOf,
  solidScriptParameterOptional,
  solidScriptParameterRotation,
  solidScriptParameterWords,
} from './solid_script_command_parameters.js';
import {
  SOLID_SCRIPT_TRANSFORM_AROUND,
  solidScriptTransformAround,
  solidScriptTransformEach,
  solidScriptTransformLocal,
  solidScriptTransformMoveTo,
  solidScriptTransformResize,
  solidScriptTransformRotateTo,
  solidScriptTransformScaleTo,
  solidScriptTransformSpace,
  type SolidScriptTransformWorldOf,
} from '@/solid_script/language/solid_script_transform_apply.js';
import {
  solidScriptAlignMatrix,
  solidScriptMirrorMatrix,
  solidScriptMoveMatrix,
  solidScriptRotateMatrix,
  solidScriptScaleMatrix,
} from '@/solid_script/language/solid_script_transforms.js';
import { solidScriptMatrixRows } from '@/solid_script/language/solid_script_reshape.js';
import { solidScriptTransformRandomize } from '@/solid_script/language/solid_script_transform_randomize.js';

/** What stops every block without its End. */
const SOLID_SCRIPT_STOPS_END = 'A missing End line.';

/** Shared Of field of the flat transform tools, including Move By and Move To. */
const SOLID_SCRIPT_TRANSFORM_OF: SolidScriptCommandParameter = {
  ...solidScriptParameterOf('objects, paths or points', '$Selected.Objects', ['Object', 'Path', 'Vector']),
  paths: true,
};

/** Meaning of each Around word. */
const SOLID_SCRIPT_TRANSFORM_AROUND_MEANINGS: Readonly<Record<(typeof SOLID_SCRIPT_TRANSFORM_AROUND)[number], string>> =
  {
    Origin: 'The origin of the current space.',
    'Combined Center': 'The middle of the box around everything in Of.',
    'Each Center': 'The middle of each item on its own, so every item turns or grows in place.',
  };

/**
 * The Around field of Rotate By and Scale By.
 *
 * @param what What the line does, such as turns.
 * @returns Field.
 */
function solidScriptParameterAround(what: string): SolidScriptCommandParameter {
  return solidScriptParameterWords(
    'around',
    'Around',
    'text',
    'Origin',
    `The point it ${what} about: Origin, Combined Center, or Each Center for every item in place. Type one, such as Each Center.`,
    SOLID_SCRIPT_TRANSFORM_AROUND.map((word) => ({ word, detail: SOLID_SCRIPT_TRANSFORM_AROUND_MEANINGS[word] })),
  );
}

/**
 * Commands that change the space later lines work in, or transform existing
 * brushes, meshes and point lists.
 */
export const SOLID_SCRIPT_COMMANDS_TRANSFORM: readonly SolidScriptCommand[] = [
  new SolidScriptCommand({
    id: 'transform',
    label: 'Transform',
    category: 'Transforms',
    description: 'Change the space that later lines work in',
    manual:
      'Changes only the space of the lines between this line and its End. Move, Rotate and Scale are applied in that order after On. On takes a face or an object: a face uses the same frame as Place On Face, a solid uses its center with world axes, and leaving On off keeps the parent space. What the lines build is stored in ordinary script space. Transform never groups solids for CSG. Example: Transform On [Wall.Faces.First] Move 0, 0.1, 0 around a Cube stands the cube just above that wall face.',
    stops: [
      'A Move, Rotate or Scale that is not one number or three numbers separated by commas.',
      'An On that is not one face or one object.',
      SOLID_SCRIPT_STOPS_END,
    ],
    nesting: 'open',
    parameters: [
      solidScriptParameter(
        'move',
        'Move',
        'vector3',
        '0, 0, 0',
        'Distance along X, Y and Z in metres, in this space, such as 0, 2, 0.',
      ),
      solidScriptParameterRotation(
        'rotate',
        'Rotate',
        'Degrees around X, then Y, then Z, in this space, such as 0, 90, 0, or a Rotation such as [Spin].',
      ),
      solidScriptParameter(
        'scale',
        'Scale',
        'vector3',
        '1, 1, 1',
        'Stretch factor along X, Y and Z in this space, such as 2, 1, 1. 1 keeps the size.',
      ),
      {
        ...solidScriptParameterOptional(
          'on',
          'On',
          'value',
          'Face or object whose space the lines work in, such as [Front]; left off keeps the parent space. A face uses the same frame as Place On Face. An object uses its center with world axes.',
        ),
        accepts: solidScriptOfAccepts(['Face', 'Object']),
        nameGroups: ['Objects', 'Faces'],
      },
    ],
    listing: (read) => [
      'Transform',
      ...(read.text('on').trim() === '' ? [] : [' On ', read.value('on')]),
      ...(read.changed('move') ? [' Move ', read.value('move')] : []),
      ...(read.changed('rotate') ? [' Rotate ', read.value('rotate')] : []),
      ...(read.changed('scale') ? [' Scale ', read.value('scale')] : []),
    ],
    execute: (run) => run.transformed(solidScriptTransformSpace(run)),
  }),
  solidScriptTransformTool({
    id: 'move_by',
    label: 'Move By',
    description: 'Move existing objects or points by a distance',
    manual:
      'Moves the objects or points in Of, or [$Selected.Objects] when Of is left off, by a distance in the current space, in metres. The distance is literal: a By of 1, 0, 0 moves them one metre along X, no matter how small or large they are. Without Into the change happens where the items already are; with Into the originals stay and the moved copies are only in that variable. Example: Move By 0, 2, 0 Of [Box] raises the box two metres.',
    stops: ['No objects or points.', 'A By that is not one number or three numbers separated by commas.'],
    parameters: [
      solidScriptParameter('by', 'By', 'vector3', '0, 0, 0', 'Distance along X, Y and Z in metres, such as 0, 2, 0.'),
    ],
    listing: (read) => ['Move By', ' ', read.value('by')],
    world: solidScriptTransformLocal((args) => solidScriptMoveMatrix(args, 'by')),
  }),
  solidScriptTransformTool({
    id: 'move_to',
    label: 'Move To',
    description: 'Move existing objects or points so their center sits at a point',
    manual:
      'Moves the objects or points in Of, or [$Selected.Objects] when Of is left off, so their combined center sits at To, a point in script space in metres. The combined center is the middle of the box around every point of the selection, the same middle a Center, Center, Center anchor uses. Without Into the change happens where the items already are; with Into the originals stay and the moved copies are only in that variable. Example: Move To 3, 1, 0 Of [Door] slides the door so its center sits at 3, 1, 0.',
    stops: ['No objects or points.', 'A To that is not one number or three numbers separated by commas.'],
    parameters: [
      solidScriptParameter(
        'to',
        'To',
        'vector3',
        '0, 0, 0',
        'Point the combined center should sit at, in metres, such as 0, 4, 0.',
      ),
    ],
    listing: (read) => ['Move To', ' ', read.value('to')],
    world: solidScriptTransformMoveTo,
  }),
  solidScriptTransformTool({
    id: 'rotate_by',
    label: 'Rotate By',
    description: 'Turn existing objects or points by an angle',
    manual:
      'Turns the objects or points in Of, or [$Selected.Objects] when Of is left off, around the origin of the current space, first around X, then Y, then Z, in degrees. Around Combined Center turns them about the middle of all of them, and Each Center turns every item about its own middle, in place. Without Into the change happens where the items already are; with Into the originals stay and the turned copies are only in that variable. By also takes a Rotation, such as one from Make Rotation. Example: Rotate By 0, 90, 0 Of [Box] turns the box a quarter turn around the upright Y axis of the current space.',
    stops: ['No objects or points.', 'A By that is not one number or three numbers separated by commas.'],
    parameters: [
      solidScriptParameterRotation(
        'by',
        'By',
        'Degrees around X, then Y, then Z, such as 0, 90, 0, or a Rotation such as [Spin].',
      ),
      solidScriptParameterAround('turns'),
    ],
    listing: (read) => [
      'Rotate By',
      ' ',
      read.value('by'),
      ' Degrees',
      ...(read.changed('around') ? [' Around ', read.value('around')] : []),
    ],
    world: solidScriptTransformAround('Rotate By', (args) => solidScriptRotateMatrix(args, 'by')),
  }),
  solidScriptTransformTool({
    id: 'rotate_to',
    label: 'Rotate To',
    description: 'Turn existing objects or points around their center to an angle',
    manual:
      'Turns the objects or points in Of, or [$Selected.Objects] when Of is left off, around their combined center, first around X, then Y, then Z, in degrees, in the current space. The combined center is the middle of the box around the selection, the same point Move To uses. These angles are applied to the solids as they are now, so a second Rotate To of the same angles turns them again. Without Into the change happens where the items already are; with Into the originals stay and the turned copies are only in that variable. To also takes a Rotation, such as one from Make Rotation. Example: Rotate To 0, 90, 0 Of [Box] turns the box a quarter turn around the upright Y axis through its center.',
    stops: ['No objects or points.', 'A To that is not one number or three numbers separated by commas.'],
    parameters: [
      solidScriptParameterRotation(
        'to',
        'To',
        'Degrees around X, then Y, then Z, such as 0, 90, 0, or a Rotation such as [Spin].',
      ),
    ],
    listing: (read) => ['Rotate To', ' ', read.value('to'), ' Degrees'],
    world: solidScriptTransformRotateTo,
  }),
  solidScriptTransformTool({
    id: 'scale_by',
    label: 'Scale By',
    description: 'Stretch or shrink existing objects or points by a factor',
    manual:
      'Stretches or shrinks the objects or points in Of, or [$Selected.Objects] when Of is left off, measured from the origin of the current space: 1 keeps the size, 2 doubles it, 0.5 halves it. Around Combined Center scales them about the middle of all of them, and Each Center scales every item about its own middle. Without Into the change happens where the items already are; with Into the originals stay and the scaled copies are only in that variable. Example: Scale By 1, 1, 2 Of [Sphere] makes the sphere twice as tall, like an egg.',
    stops: ['No objects or points.', 'A By that is not one number or three numbers separated by commas.'],
    parameters: [
      solidScriptParameter(
        'by',
        'By',
        'vector3',
        '1, 1, 1',
        'Stretch factor along X, Y and Z, such as 2, 1, 1. 1 keeps the size.',
      ),
      solidScriptParameterAround('grows'),
    ],
    listing: (read) => [
      'Scale By',
      ' ',
      read.value('by'),
      ...(read.changed('around') ? [' Around ', read.value('around')] : []),
    ],
    world: solidScriptTransformAround('Scale By', (args) => solidScriptScaleMatrix(args, 'by')),
  }),
  solidScriptTransformTool({
    id: 'randomize',
    label: 'Randomize',
    description: 'Move, turn and scale each object or point by a random amount',
    manual:
      'Gives every object or point in Of, or [$Selected.Objects] when Of is left off, its own random change: a move of up to Move metres either way on each axis, a turn of up to Turn degrees either way around X, then Y, then Z, and one Scale factor between the two given, all about its own center. ID picks the random numbers of each item, [$Id] by default, so deleting one item keeps the others where they are; Seed gives another set. The same ID and Seed always give the same change. Without Into the change happens where the items already are; with Into the originals stay and the changed copies are only in that variable. Example: Scatter Points, Place At Points with a Cylinder inside Into [Rocks], then Randomize Of [Rocks] Turn 0, 180, 0 Scale 0.8, 1.2 makes every rock face its own way and size.',
    stops: [
      'No objects or points.',
      'A Scale of 0 or below.',
      'A Move or Turn that is not one number or three numbers.',
    ],
    parameters: [
      solidScriptParameter(
        'move',
        'Move',
        'vector3',
        '0, 0, 0',
        'Largest move either way on X, Y and Z in metres, such as 0.2, 0, 0.2.',
      ),
      solidScriptParameter(
        'turn',
        'Turn',
        'vector3',
        '0, 180, 0',
        'Largest turn either way around X, Y and Z in degrees, such as 0, 180, 0 for any way around up.',
      ),
      {
        ...solidScriptParameter(
          'scale',
          'Scale',
          'value',
          '0.8, 1.2',
          'Smallest and biggest size factor, such as 0.8, 1.2; one number, such as 1, keeps every size.',
        ),
        accepts: ['Number', 'Number List', 'Vector', 'Text'],
      },
      solidScriptParameter('seed', 'Seed', 'number', '0', 'Another number gives another set of changes, such as 1.'),
      solidScriptParameter(
        'id',
        'ID',
        'number',
        '[=[$Id]]',
        'Which random numbers an item gets, such as [=[$Id]], so an item keeps its change when others are deleted.',
      ),
    ],
    listing: (read) => [
      'Randomize',
      ...(read.changed('move') ? [' Move ', read.value('move')] : []),
      ' Turn ',
      read.value('turn'),
      ' Scale ',
      read.value('scale'),
      ...(read.changed('seed') ? [' Seed ', read.value('seed')] : []),
    ],
    world: solidScriptTransformRandomize,
  }),
  solidScriptTransformTool({
    id: 'scale_to',
    label: 'Scale To',
    description: 'Stretch existing objects or points to an exact size about their center',
    manual:
      'Stretches the objects or points in Of, or [$Selected.Objects] when Of is left off, about their combined center so that, together, they measure exactly the given width (X), height (Y) and depth (Z) in metres. The combined center is the middle of the box around the selection, the same point Move To uses. A size must be above 0 on every axis. Without Into the change happens where the items already are; with Into the originals stay and the scaled copies are only in that variable. Example: Scale To 4, 2, 1 Of [Sphere] gives an egg four metres long, two metres tall and one metre deep.',
    stops: [
      'No objects or points.',
      'A size of 0 or below on any axis.',
      'Stretching shapes that are flat along an axis.',
    ],
    parameters: [
      solidScriptParameter(
        'to',
        'To',
        'vector3',
        '2, 2, 2',
        'Width (X), height (Y) and depth (Z) in metres, such as 4, 2, 4. Every axis must be above 0.',
      ),
    ],
    listing: (read) => ['Scale To', ' ', read.value('to')],
    world: solidScriptTransformScaleTo,
  }),
  solidScriptTransformTool({
    id: 'align',
    label: 'Align To',
    description: 'Turn existing objects or points to point along a direction',
    manual:
      'Turns the objects or points in Of, or [$Selected.Objects] when Of is left off, so that their upright Y axis, or the axis Axis names, points along Direction, by the shortest turn around the origin of the current space; Amount takes only that share of the turn, so 0.5 leans halfway. Forward, when given with Axis Y, also turns their front (Z) to point along it, as far as it can while up stays on Direction, so a post can face up and along a path. Without Into the change happens where the items already are; with Into the originals stay and the turned copies are only in that variable. Example: after Scatter Points Into Spots Normals Ways, For Each [Spot] In [Spots] Key I, Move To [Spot] Of [Spike] Into [Copy], Align To [Ways([I])] Of [Copy] stands a spike out of every face.',
    stops: ['No objects or points.', 'A Direction of 0, 0, 0.'],
    parameters: [
      solidScriptParameter(
        'direction',
        'Direction',
        'vector3',
        '0, 1, 0',
        'Where up (Y) should point, such as 1, 0, 0.',
      ),
      solidScriptParameterOptional(
        'forward',
        'Forward',
        'vector3',
        'Optional: where the front (Z) should point, laid square to up first, such as 1, 0, 0 to face along X. Empty, 0, 0, 0 or a way along up keeps the shortest turn.',
      ),
      solidScriptParameterWords(
        'axis',
        'Axis',
        'text',
        'Y',
        'Which axis of the items points along Direction: X, Y or Z. Type one, such as Z.',
        [
          { word: 'X', detail: 'Point the side along Direction' },
          { word: 'Y', detail: 'Point up along Direction' },
          { word: 'Z', detail: 'Point the front along Direction' },
        ],
      ),
      solidScriptParameter(
        'amount',
        'Amount',
        'number',
        '1',
        'How much of the turn to take, from 0 (none) to 1 (all of it), such as 0.5 to lean halfway.',
      ),
    ],
    listing: (read) => [
      'Align To',
      ' ',
      read.value('direction'),
      ...(read.text('forward') === '' ? [] : [' Forward ', read.value('forward')]),
      ...solidScriptListingOptions([
        read.changed('axis') && ['Axis ', read.value('axis')],
        read.changed('amount') && ['Amount ', read.value('amount')],
      ]),
    ],
    world: solidScriptTransformLocal(solidScriptAlignMatrix),
  }),
  solidScriptTransformTool({
    id: 'mirror',
    label: 'Mirror',
    description: 'Flip existing objects or points to the other side',
    manual:
      'Flips the objects or points in Of, or [$Selected.Objects] when Of is left off, to the other side of a mirror through the origin of the current space. The direction says which way the mirror faces: 1, 0, 0 flips left and right. Without Into the original moves; with Into the original stays and the flipped copy is only in that variable. Example: build a post at X = 2, then Mirror Of [Post] Across 1, 0, 0 Into [Twin] keeps the post and writes its twin at X = -2.',
    stops: ['No objects or points.', 'A direction of 0, 0, 0.'],
    parameters: [
      solidScriptParameter(
        'v',
        'Plane Normal',
        'vector3',
        '1, 0, 0',
        'Direction the mirror faces, such as 1, 0, 0 for a cut on the right.',
      ),
    ],
    listing: (read) => ['Mirror', ' Across ', read.value('v')],
    world: solidScriptTransformLocal(solidScriptMirrorMatrix),
  }),
  solidScriptTransformTool({
    id: 'resize',
    label: 'Resize',
    description: 'Stretch existing objects or points to an exact size',
    manual:
      'Stretches the objects or points in Of, or [$Selected.Objects] when Of is left off, about the origin of the current space so that, together, they measure exactly the given width (X), height (Y) and depth (Z) in metres. A size of 0 leaves that axis alone, or with Keep Proportions scales it like the first axis that has a size. Without Into the change happens where the items already are; with Into the originals stay and the resized copies are only in that variable. Example: Resize Of [Sphere] To 4, 2, 1 gives an egg four metres long, without working out the scale yourself.',
    stops: [
      'No objects or points.',
      'A size below 0, or 0 on every axis.',
      'Stretching shapes that are flat along an axis.',
    ],
    parameters: [
      solidScriptParameter(
        'size',
        'Size',
        'vector3',
        '2, 2, 2',
        'Width (X), height (Y) and depth (Z) in metres, such as 4, 0, 0 to stretch only the width. 0 keeps an axis.',
      ),
      solidScriptParameter(
        'keep',
        'Keep Proportions',
        'boolean',
        'No',
        'Yes: axes with a size of 0 scale like the first axis that has one. Type Yes or No, such as Yes.',
      ),
    ],
    listing: (read) => [
      'Resize',
      ' To ',
      read.value('size'),
      ...solidScriptListingOptions([read.on('keep') && ['Keep Proportions']]),
    ],
    world: solidScriptTransformResize,
  }),
  solidScriptTransformTool({
    id: 'matrix',
    label: 'Matrix',
    description: 'Move, turn, stretch and slant existing objects or points at once',
    manual:
      'Moves the objects or points in Of, or [$Selected.Objects] when Of is left off, by a 3 by 4 matrix, one row per axis: the new X is Row 1 times x, y, z, 1, and so on, in the current space. The fourth number of a row moves along that axis. It can do everything Move By, Rotate By, Scale By and Mirror do, and slant (shear) too. Without Into the change happens where the items already are; with Into the originals stay and the copies are only in that variable. Example: Matrix Of [Box] with Row 1 of 1, 0, 0.5, 0 leans the box over, moving its top half a metre along X per metre of height.',
    stops: ['No objects or points.', 'A row that is not four numbers.', 'A matrix that squashes shapes flat.'],
    parameters: [
      solidScriptParameterRow(
        'row1',
        'Row 1',
        '1, 0, 0, 0',
        'How X is made from x, y, z, plus a move along X, such as 1, 0, 0, 2 to move 2 metres right.',
      ),
      solidScriptParameterRow(
        'row2',
        'Row 2',
        '0, 1, 0, 0',
        'How Y is made from x, y, z, plus a move along Y, such as 0, 1, 0, 0.',
      ),
      solidScriptParameterRow(
        'row3',
        'Row 3',
        '0, 0, 1, 0',
        'How Z is made from x, y, z, plus a move along Z, such as 0, 0, 1, 0.',
      ),
    ],
    listing: (read) => ['Matrix', ' ', read.value('row1'), ' / ', read.value('row2'), ' / ', read.value('row3')],
    world: solidScriptTransformLocal(solidScriptMatrixRows),
  }),
];

/**
 * A flat transform tool: Of, optional Into, and a transform applied to existing
 * brushes, meshes or points.
 *
 * @param spec Command fields shared with a tool, without Of.
 * @returns Command.
 */
function solidScriptTransformTool(spec: {
  id: string;
  label: string;
  description: string;
  manual: string;
  stops: readonly string[];
  parameters: readonly SolidScriptCommandParameter[];
  listing: SolidScriptCommandSpec['listing'];
  world: SolidScriptTransformWorldOf;
}): SolidScriptCommand {
  const keys = spec.parameters.map((parameter) => parameter.key);
  return new SolidScriptCommand({
    id: spec.id,
    edits: true,
    label: spec.label,
    category: 'Transforms',
    description: spec.description,
    manual: spec.manual,
    stops: spec.stops,
    parameters: [
      ...spec.parameters.map((parameter) => solidScriptParameterEach(parameter, 'Item')),
      solidScriptParameterOfWhere('Item', '[=[$Index] % 2 == 0]'),
      SOLID_SCRIPT_TRANSFORM_OF,
    ],
    listing: (read) => [...spec.listing(read), ...solidScriptListingOf(read)],
    execute: (run) => {
      solidScriptTransformEach(run, spec.label, keys, spec.world);
      return [];
    },
  });
}

/**
 * A row of the Matrix line: four numbers, or one number for all four.
 *
 * @param key Key of the stored value.
 * @param label Visible caption.
 * @param fallback Value of a new line.
 * @param hint Hover text.
 * @returns Field.
 */
function solidScriptParameterRow(
  key: string,
  label: string,
  fallback: string,
  hint: string,
): SolidScriptCommandParameter {
  return { ...solidScriptParameter(key, label, 'value', fallback, hint), accepts: ['Number', 'Number List', 'Text'] };
}
