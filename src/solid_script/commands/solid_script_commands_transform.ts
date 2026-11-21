import {
  SolidScriptCommand,
  type SolidScriptCommandParameter,
  type SolidScriptCommandSpec,
} from './solid_script_command.js';
import { solidScriptListingOptions } from './solid_script_command_listing.js';
import {
  solidScriptOfAccepts,
  solidScriptParameter,
  solidScriptParameterOf,
  solidScriptParameterOptional,
} from './solid_script_command_parameters.js';
import {
  solidScriptTransformApply,
  solidScriptTransformMove,
  solidScriptTransformMoveTo,
  solidScriptTransformResize,
  solidScriptTransformRotateTo,
  solidScriptTransformScaleTo,
  solidScriptTransformSpace,
} from '@/solid_script/language/solid_script_transform_apply.js';
import {
  solidScriptAlignMatrix,
  solidScriptMirrorMatrix,
  solidScriptRotateMatrix,
  solidScriptScaleMatrix,
} from '@/solid_script/language/solid_script_transforms.js';
import { solidScriptMatrixRows } from '@/solid_script/language/solid_script_reshape.js';

/** What stops every block without its End. */
const SOLID_SCRIPT_STOPS_END = 'A missing End line.';

/** Ids of the flat transform tools that take Of. */
export const SOLID_SCRIPT_TRANSFORM_TOOL_IDS = [
  'move_by',
  'move_to',
  'rotate_by',
  'rotate_to',
  'scale_by',
  'scale_to',
  'align',
  'mirror',
  'resize',
  'matrix',
] as const;

/** Shared Of field of the flat transform tools, including Move By and Move To. */
const SOLID_SCRIPT_TRANSFORM_OF: SolidScriptCommandParameter = {
  ...solidScriptParameterOf('brushes, meshes, outlines or points', '$Selected.Brushes', ['Brush', 'Outline', 'Vector']),
  outlines: true,
};

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
      'Changes only the space of the lines between this line and its End. Move, Rotate and Scale are applied in that order after On. On takes a face or a brush: a face uses the same frame as Place On Face, a brush uses its center with world axes, and leaving On off keeps the parent space. What the lines build is stored in ordinary script space. Transform never groups brushes for CSG. Example: Transform On [Wall.Faces.First] Move 0, 0.1, 0 around a Cube stands the cube just above that wall face.',
    stops: [
      'A Move, Rotate or Scale that is not one number or three numbers separated by commas.',
      'An On that is not one face or one brush.',
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
      solidScriptParameter(
        'rotate',
        'Rotate',
        'vector3',
        '0, 0, 0',
        'Degrees around X, then Y, then Z, in this space, such as 0, 90, 0.',
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
          'Face or brush whose space the lines work in, such as [Front]; left off keeps the parent space. A face uses the same frame as Place On Face. A brush uses its center with world axes.',
        ),
        accepts: solidScriptOfAccepts(['Face', 'Brush']),
        nameGroups: ['Brushes', 'Faces'],
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
    description: 'Move existing brushes, meshes or points by a distance',
    manual:
      'Moves the brushes, meshes or points in Of, or [$Selected.Brushes] when Of is left off, by a distance in the current space, in metres. The distance is literal: a By of 1, 0, 0 moves them one metre along X, no matter how small or large they are. Without Into the change happens where the items already are; with Into the originals stay and the moved copies are only in that variable. Example: Move By 0, 2, 0 Of [Box] raises the box two metres.',
    stops: ['No brushes, meshes or points.', 'A By that is not one number or three numbers separated by commas.'],
    parameters: [
      solidScriptParameter('by', 'By', 'vector3', '0, 0, 0', 'Distance along X, Y and Z in metres, such as 0, 2, 0.'),
    ],
    listing: (read) => ['Move By', ' ', read.value('by')],
    execute: (run) => {
      solidScriptTransformMove(run);
      return [];
    },
  }),
  solidScriptTransformTool({
    id: 'move_to',
    label: 'Move To',
    description: 'Move existing brushes, meshes or points so their center sits at a point',
    manual:
      'Moves the brushes, meshes or points in Of, or [$Selected.Brushes] when Of is left off, so their combined center sits at To, a point in script space in metres. The combined center is the middle of the box around every point of the selection, the same middle a Center, Center, Center anchor uses. Without Into the change happens where the items already are; with Into the originals stay and the moved copies are only in that variable. Example: Move To 3, 1, 0 Of [Door] slides the door so its center sits at 3, 1, 0.',
    stops: ['No brushes, meshes or points.', 'A To that is not one number or three numbers separated by commas.'],
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
    execute: (run) => {
      solidScriptTransformMoveTo(run);
      return [];
    },
  }),
  solidScriptTransformTool({
    id: 'rotate_by',
    label: 'Rotate By',
    description: 'Turn existing brushes, meshes or points by an angle',
    manual:
      'Turns the brushes, meshes or points in Of, or [$Selected.Brushes] when Of is left off, around the origin of the current space, first around X, then Y, then Z, in degrees. Without Into the change happens where the items already are; with Into the originals stay and the turned copies are only in that variable. Example: Rotate By 0, 90, 0 Of [Box] turns the box a quarter turn around the upright Y axis of the current space.',
    stops: ['No brushes, meshes or points.', 'A By that is not one number or three numbers separated by commas.'],
    parameters: [
      solidScriptParameter('by', 'By', 'vector3', '0, 0, 0', 'Degrees around X, then Y, then Z, such as 0, 90, 0.'),
    ],
    listing: (read) => ['Rotate By', ' ', read.value('by'), ' Degrees'],
    execute: (run) => {
      solidScriptTransformApply(run, 'Rotate By', solidScriptRotateMatrix(run.fields(), 'by'));
      return [];
    },
  }),
  solidScriptTransformTool({
    id: 'rotate_to',
    label: 'Rotate To',
    description: 'Turn existing brushes, meshes or points around their center to an angle',
    manual:
      'Turns the brushes, meshes or points in Of, or [$Selected.Brushes] when Of is left off, around their combined center, first around X, then Y, then Z, in degrees, in the current space. The combined center is the middle of the box around the selection, the same point Move To uses. These angles are applied to the brushes as they are now, so a second Rotate To of the same angles turns them again. Without Into the change happens where the items already are; with Into the originals stay and the turned copies are only in that variable. Example: Rotate To 0, 90, 0 Of [Box] turns the box a quarter turn around the upright Y axis through its center.',
    stops: ['No brushes, meshes or points.', 'A To that is not one number or three numbers separated by commas.'],
    parameters: [
      solidScriptParameter('to', 'To', 'vector3', '0, 0, 0', 'Degrees around X, then Y, then Z, such as 0, 90, 0.'),
    ],
    listing: (read) => ['Rotate To', ' ', read.value('to'), ' Degrees'],
    execute: (run) => {
      solidScriptTransformRotateTo(run);
      return [];
    },
  }),
  solidScriptTransformTool({
    id: 'scale_by',
    label: 'Scale By',
    description: 'Stretch or shrink existing brushes, meshes or points by a factor',
    manual:
      'Stretches or shrinks the brushes, meshes or points in Of, or [$Selected.Brushes] when Of is left off, measured from the origin of the current space: 1 keeps the size, 2 doubles it, 0.5 halves it. Without Into the change happens where the items already are; with Into the originals stay and the scaled copies are only in that variable. Example: Scale By 1, 1, 2 Of [Sphere] makes the sphere twice as tall, like an egg.',
    stops: ['No brushes, meshes or points.', 'A By that is not one number or three numbers separated by commas.'],
    parameters: [
      solidScriptParameter(
        'by',
        'By',
        'vector3',
        '1, 1, 1',
        'Stretch factor along X, Y and Z, such as 2, 1, 1. 1 keeps the size.',
      ),
    ],
    listing: (read) => ['Scale By', ' ', read.value('by')],
    execute: (run) => {
      solidScriptTransformApply(run, 'Scale By', solidScriptScaleMatrix(run.fields(), 'by'));
      return [];
    },
  }),
  solidScriptTransformTool({
    id: 'scale_to',
    label: 'Scale To',
    description: 'Stretch existing brushes, meshes or points to an exact size about their center',
    manual:
      'Stretches the brushes, meshes or points in Of, or [$Selected.Brushes] when Of is left off, about their combined center so that, together, they measure exactly the given width (X), height (Y) and depth (Z) in metres. The combined center is the middle of the box around the selection, the same point Move To uses. A size must be above 0 on every axis. Without Into the change happens where the items already are; with Into the originals stay and the scaled copies are only in that variable. Example: Scale To 4, 2, 1 Of [Sphere] gives an egg four metres long, two metres tall and one metre deep.',
    stops: [
      'No brushes, meshes or points.',
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
    execute: (run) => {
      solidScriptTransformScaleTo(run);
      return [];
    },
  }),
  solidScriptTransformTool({
    id: 'align',
    label: 'Align To',
    description: 'Turn existing brushes, meshes or points to point along a direction',
    manual:
      'Turns the brushes, meshes or points in Of, or [$Selected.Brushes] when Of is left off, so that their upright Y axis points along Direction, by the shortest turn around the origin of the current space. Without Into the change happens where the items already are; with Into the originals stay and the turned copies are only in that variable. Example: after Scatter Points Into Spots Normals Ways, For Each [Spot] In [Spots] Key I, Move To [Spot] Of [Spike] Into [Copy], Align To [Ways([I])] Of [Copy] stands a spike out of every face.',
    stops: ['No brushes, meshes or points.', 'A Direction of 0, 0, 0.'],
    parameters: [
      solidScriptParameter(
        'direction',
        'Direction',
        'vector3',
        '0, 1, 0',
        'Where up (Y) should point, such as 1, 0, 0.',
      ),
    ],
    listing: (read) => ['Align To', ' ', read.value('direction')],
    execute: (run) => {
      solidScriptTransformApply(run, 'Align To', solidScriptAlignMatrix(run.fields()));
      return [];
    },
  }),
  solidScriptTransformTool({
    id: 'mirror',
    label: 'Mirror',
    description: 'Flip existing brushes, meshes or points to the other side',
    manual:
      'Flips the brushes, meshes or points in Of, or [$Selected.Brushes] when Of is left off, to the other side of a mirror through the origin of the current space. The direction says which way the mirror faces: 1, 0, 0 flips left and right. Without Into the original moves; with Into the original stays and the flipped copy is only in that variable. Example: build a post at X = 2, then Mirror Of [Post] Across 1, 0, 0 Into [Twin] keeps the post and writes its twin at X = -2.',
    stops: ['No brushes, meshes or points.', 'A direction of 0, 0, 0.'],
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
    execute: (run) => {
      solidScriptTransformApply(run, 'Mirror', solidScriptMirrorMatrix(run.fields()));
      return [];
    },
  }),
  solidScriptTransformTool({
    id: 'resize',
    label: 'Resize',
    description: 'Stretch existing brushes, meshes or points to an exact size',
    manual:
      'Stretches the brushes, meshes or points in Of, or [$Selected.Brushes] when Of is left off, about the origin of the current space so that, together, they measure exactly the given width (X), height (Y) and depth (Z) in metres. A size of 0 leaves that axis alone, or with Keep Proportions scales it like the first axis that has a size. Without Into the change happens where the items already are; with Into the originals stay and the resized copies are only in that variable. Example: Resize Of [Sphere] To 4, 2, 1 gives an egg four metres long, without working out the scale yourself.',
    stops: [
      'No brushes, meshes or points.',
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
    execute: (run) => {
      solidScriptTransformResize(run);
      return [];
    },
  }),
  solidScriptTransformTool({
    id: 'matrix',
    label: 'Matrix',
    description: 'Move, turn, stretch and slant existing brushes, meshes or points at once',
    manual:
      'Moves the brushes, meshes or points in Of, or [$Selected.Brushes] when Of is left off, by a 3 by 4 matrix, one row per axis: the new X is Row 1 times x, y, z, 1, and so on, in the current space. The fourth number of a row moves along that axis. It can do everything Move By, Rotate By, Scale By and Mirror do, and slant (shear) too. Without Into the change happens where the items already are; with Into the originals stay and the copies are only in that variable. Example: Matrix Of [Box] with Row 1 of 1, 0, 0.5, 0 leans the box over, moving its top half a metre along X per metre of height.',
    stops: ['No brushes, meshes or points.', 'A row that is not four numbers.', 'A matrix that squashes shapes flat.'],
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
    execute: (run) => {
      solidScriptTransformApply(run, 'Matrix', solidScriptMatrixRows(run.fields()));
      return [];
    },
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
  execute: SolidScriptCommandSpec['execute'];
}): SolidScriptCommand {
  return new SolidScriptCommand({
    id: spec.id,
    edits: true,
    label: spec.label,
    category: 'Transforms',
    description: spec.description,
    manual: spec.manual,
    stops: spec.stops,
    parameters: [...spec.parameters, SOLID_SCRIPT_TRANSFORM_OF],
    listing: (read) => [...spec.listing(read), ...(read.text('of') === '' ? [] : [' Of ', read.value('of')])],
    execute: spec.execute,
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
