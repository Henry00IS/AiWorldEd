import { solidScriptParameterEach } from './solid_script_command_each.js';
import { solidScriptListingOf } from './solid_script_command_listing.js';
import { solidScriptParameterOfWhere } from './solid_script_command_of_where.js';
import * as THREE from 'three';
import { SolidScriptCommand } from './solid_script_command.js';
import { solidScriptListingOptions } from './solid_script_command_listing.js';
import {
  solidScriptParameter,
  solidScriptParameterInto,
  solidScriptParameterOf,
  solidScriptParameterWhen,
  solidScriptParameterWords,
} from './solid_script_command_parameters.js';
import {
  SOLID_SCRIPT_ARRAY_COUNT_MAX,
  SOLID_SCRIPT_ARRAY_SHAPES,
  solidScriptArrayMatrices,
  type SolidScriptArrayLayout,
  type SolidScriptArrayShape,
} from '@/solid_script/language/solid_script_array.js';
import type { SolidScriptShape } from '@/solid_script/language/solid_script_shape.js';
import type { SolidScriptBlockRun } from '@/solid_script/language/solid_script_machine_types.js';
import { solidScriptPathSample } from '@/solid_script/language/solid_script_path_model.js';
import { solidScriptShapeClone } from '@/solid_script/language/solid_script_shape_clone.js';
import { solidScriptShapeTransform } from '@/solid_script/language/solid_script_reshape.js';
import type { SolidScriptGeometryLeaf } from '@/solid_script/language/solid_script_geometry.js';
import { solidScriptFaceWrite } from './solid_script_face_of.js';
import {
  solidScriptTransformPicked,
  solidScriptTransformWorld,
} from '@/solid_script/language/solid_script_transform_apply.js';
import { SolidScriptPathElement } from '@/solid_script/language/solid_script_value.js';

/**
 * Reads the Shape word, stopping on one it does not know.
 *
 * @param run Running line.
 * @returns Shape.
 */
function solidScriptArrayShapeOf(run: SolidScriptBlockRun): SolidScriptArrayShape {
  const typed = run.text('shape').trim();
  const found = SOLID_SCRIPT_ARRAY_SHAPES.find((shape) => shape.toLowerCase() === typed.toLowerCase());
  if (!found) throw new Error(`Shape must be Line, Circle or Along Path, not "${typed}"`);
  return found;
}

/**
 * Reads the Path of Along Path: a drawn Path, or a list of points.
 *
 * @param run Running line.
 * @returns Points and whether the Path is closed.
 */
function solidScriptArrayPathOf(run: SolidScriptBlockRun): { path: number[][]; closed: boolean } {
  const given = run.values('path');
  const drawn = given.length === 1 && given[0] instanceof SolidScriptPathElement ? given[0] : undefined;
  if (drawn) return { path: solidScriptPathSample(drawn.path), closed: drawn.path.closed };
  return { path: run.value('path') as number[][], closed: false };
}

/**
 * Reads the layout of an Array line from its fields.
 *
 * @param run Running line.
 * @param count Number of copies, including the original.
 * @returns Layout.
 */
function solidScriptArrayLayoutOf(run: SolidScriptBlockRun, count: number): SolidScriptArrayLayout {
  const fields = run.fields();
  if (count < 1 || count > SOLID_SCRIPT_ARRAY_COUNT_MAX)
    throw new Error(`Count must be 1 to ${SOLID_SCRIPT_ARRAY_COUNT_MAX}, not ${count}`);
  const shape = solidScriptArrayShapeOf(run);
  const vector = (key: string): THREE.Vector3 => new THREE.Vector3(...fields.vector(key, [0, 0, 0]));
  const along = shape === 'Along Path' ? solidScriptArrayPathOf(run) : { path: [], closed: false };
  return {
    count,
    shape,
    offset: shape === 'Line' ? vector('offset') : new THREE.Vector3(),
    axis: shape === 'Circle' ? vector('axis') : new THREE.Vector3(0, 1, 0),
    center: shape === 'Circle' ? vector('center') : new THREE.Vector3(),
    angle: shape === 'Circle' ? fields.number('angle', 360) : 0,
    ...along,
    align: shape === 'Along Path' && fields.flag('align'),
  };
}

/**
 * Makes the copies of an Array line and adds them as built by it; every
 * original and copy gets its copy number under .Data.Copy.
 *
 * @param run Running line.
 * @returns The copies placed in the result.
 */
function solidScriptArrayRun(run: SolidScriptBlockRun): SolidScriptShape[] {
  const picked = solidScriptTransformPicked(run, 'Array');
  if (picked.kind !== 'leaves') throw new Error('Array copies objects, not points or paths');
  const numbered = picked.leaves.flatMap((leaf, index) => {
    const count = run.valueWith('count', {
      $Object: run.elements.brush(leaf),
      $Index: index,
      $Count: picked.leaves.length,
    });
    if (typeof count !== 'number') throw new Error('Count needs a number, such as 3');
    return solidScriptArrayCopies(run, leaf, Math.round(count));
  });
  const adopted = run.adopted(numbered.map(({ copy }) => copy));
  const kept = numbered.filter(({ copy }) => adopted.includes(copy));
  for (const leaf of picked.leaves) solidScriptArrayNumber(run, run.leafLatest(leaf), 0);
  for (const { copy, number } of kept) solidScriptArrayNumber(run, copy, number);
  solidScriptFaceWrite(
    run,
    'into',
    kept.map(({ copy }) => run.elements.brush(copy)),
  );
  return adopted;
}

/**
 * Makes the extra copies of one object, numbered from 1.
 *
 * @param run Running line.
 * @param leaf Object to copy.
 * @param count Number including the original.
 * @returns Extra copies with their numbers.
 */
function solidScriptArrayCopies(
  run: SolidScriptBlockRun,
  leaf: SolidScriptGeometryLeaf,
  count: number,
): { copy: SolidScriptGeometryLeaf; number: number }[] {
  return solidScriptArrayMatrices(solidScriptArrayLayoutOf(run, count)).map((matrix, index) => ({
    copy: solidScriptShapeTransform(
      solidScriptShapeClone(run.leafLatest(leaf)),
      solidScriptTransformWorld(run.matrix(), matrix),
    ) as SolidScriptGeometryLeaf,
    number: index + 1,
  }));
}

/**
 * Writes the copy number of an object under .Data.Copy: 0 for the original.
 *
 * @param run Running line.
 * @param leaf Original or copy.
 * @param number Copy number.
 */
function solidScriptArrayNumber(run: SolidScriptBlockRun, leaf: SolidScriptGeometryLeaf, number: number): void {
  const element = run.elements.brush(leaf);
  run.elements.dataWrite(run.elements.data(element), 'copy', 'Copy', number);
}

/** Array: copies of objects along a line, around a circle or along a path. */
export const SOLID_SCRIPT_COMMANDS_ARRAY: readonly SolidScriptCommand[] = [
  new SolidScriptCommand({
    id: 'array',
    edits: true,
    label: 'Array',
    category: 'Transforms',
    description: 'Copy objects along a line, a circle or a path',
    manual:
      'Makes copies of the objects in Of, so there are Count of each, the original first. The 🔁 Count may vary per object, such as [=[$Index] + 2]. Shape Line puts each copy Offset further than the one before. Circle turns the copies evenly around Axis through Center over Angle degrees; a whole turn of 360 leaves no copy on top of the original. Along Path spreads them evenly along a Path by length, the original at its start, and with Align on turns each copy as the Path turns. Of is the objects; empty uses [$Selected.Objects]. The copy number of each object is under [Object.Data.Copy], 0 for the original and 1 on for the copies, so later lines can vary by it, such as Move By [=Vector(0, [$Item.Data.Copy] * 0.2, 0)]. Without Into the copies join the result; with Into they are only in that variable, until Output. Example: a Cube, then Array Count 5 Offset 1.5, 0, 0 makes a row of five, and Array Count 8 Shape Circle around a post at 3, 0, 0 makes a ring of eight.',
    stops: [
      `A Count below 1 or above ${SOLID_SCRIPT_ARRAY_COUNT_MAX}.`,
      'A Shape that is not Line, Circle or Along Path.',
      'An Axis of 0, 0, 0, or a Path with fewer than 2 points.',
      'Points or paths in Of: Array copies objects.',
    ],
    parameters: [
      solidScriptParameterEach(
        solidScriptParameter(
          'count',
          'Count',
          'count',
          '3',
          `How many there are in the end, the original included, 1 to ${SOLID_SCRIPT_ARRAY_COUNT_MAX}, such as 5.`,
        ),
        'Object',
      ),
      solidScriptParameterWords(
        'shape',
        'Shape',
        'text',
        'Line',
        'How the copies are laid out. Type one, such as Circle.',
        [
          { word: 'Line', detail: 'Each copy Offset further than the one before' },
          { word: 'Circle', detail: 'Turned evenly around Axis through Center' },
          { word: 'Along Path', detail: 'Spread evenly along a Path' },
        ],
      ),
      solidScriptParameterWhen(
        solidScriptParameter(
          'offset',
          'Offset',
          'vector3',
          '2, 0, 0',
          'Metres from one copy to the next, such as 1.5, 0, 0.',
        ),
        'shape',
        ['Line'],
      ),
      solidScriptParameterWhen(
        solidScriptParameter(
          'axis',
          'Axis',
          'vector3',
          '0, 1, 0',
          'Direction the circle turns around, such as 0, 1, 0.',
        ),
        'shape',
        ['Circle'],
      ),
      solidScriptParameterWhen(
        solidScriptParameter(
          'center',
          'Center',
          'vector3',
          '0, 0, 0',
          'Point the circle turns around, such as 0, 0, 0.',
        ),
        'shape',
        ['Circle'],
      ),
      solidScriptParameterWhen(
        solidScriptParameter(
          'angle',
          'Angle',
          'number',
          '360',
          'Degrees the copies spread over, such as 180 for half a circle.',
        ),
        'shape',
        ['Circle'],
      ),
      solidScriptParameterWhen(
        solidScriptParameter(
          'path',
          'Path',
          'points3',
          '[0, 0, 0], [4, 0, 0]',
          'The Path the copies follow, or a list of points, such as [Path].',
        ),
        'shape',
        ['Along Path'],
      ),
      solidScriptParameterWhen(
        solidScriptParameter(
          'align',
          'Align',
          'boolean',
          'No',
          'Yes: turn each copy as the Path turns. No: only move them. Type Yes or No, such as Yes.',
        ),
        'shape',
        ['Along Path'],
      ),
      solidScriptParameterOfWhere('Object', '[=[$Object.Center.Y] > 0]'),
      solidScriptParameterOf('objects', '$Selected.Objects', ['Object']),
      solidScriptParameterInto('the copies, an Object list', 'Object List', 'what is made', 'copy'),
    ],
    listing: (read) => [
      'Array',
      read.value('count'),
      ...solidScriptListingOptions([
        read.changed('shape') && ['Shape ', read.value('shape')],
        read.text('shape').trim().toLowerCase() === 'circle'
          ? read.changed('angle') && ['Angle ', read.value('angle')]
          : read.text('shape').trim().toLowerCase() === 'along path'
            ? ['Along ', read.value('path')]
            : ['Offset ', read.value('offset')],
      ]),
      ...solidScriptListingOf(read),
    ],
    execute: (run) => solidScriptArrayRun(run),
  }),
];
