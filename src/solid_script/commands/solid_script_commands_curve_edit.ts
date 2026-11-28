import { SolidScriptCommand } from './solid_script_command.js';
import { solidScriptListingOptions } from './solid_script_command_listing.js';
import {
  solidScriptParameter,
  solidScriptParameterOptional,
  solidScriptParameterWords,
  solidScriptParameterWrites,
} from './solid_script_command_parameters.js';
import {
  solidScriptCurveField,
  solidScriptCurveIntoField,
  solidScriptCurvePlace,
  solidScriptCurveSource,
  solidScriptCurveWrite,
} from './solid_script_commands_curve_io.js';
import { solidScriptPathSource, solidScriptPathWrite } from './solid_script_commands_path_io.js';
import { CURVE_SEGMENT_MODES, type CurveSegmentMode } from '@/curve/model/curve_model.js';
import {
  solidScriptCurveInsert,
  solidScriptCurveRemove,
  solidScriptCurveSet,
} from '@/solid_script/language/solid_script_curve_edit.js';
import { SOLID_SCRIPT_CURVE_SEGMENT_KINDS } from '@/solid_script/language/solid_script_curve_members.js';
import { SolidScriptCurveValue } from '@/solid_script/language/solid_script_curve_value.js';
import { solidScriptNoiseWord } from '@/solid_script/language/solid_script_functions_noise.js';
import type { SolidScriptBlockRun } from '@/solid_script/language/solid_script_machine_types.js';
import { solidScriptPathSegmentRemove } from '@/solid_script/language/solid_script_path_segments.js';
import { solidScriptValueNumber } from '@/solid_script/language/solid_script_value.js';

/** Words of Kind: the bend modes, the way the curve editor names them. */
const SOLID_SCRIPT_CURVE_KIND_WORDS = Object.values(SOLID_SCRIPT_CURVE_SEGMENT_KINDS);

/**
 * Reads Kind: Linear, Quadratic or Bezier, in any case, Linear when empty.
 *
 * @param run Running line.
 * @returns Bend mode.
 */
function solidScriptCurveKindRead(run: SolidScriptBlockRun): CurveSegmentMode {
  const word = solidScriptNoiseWord(run.text('kind').trim() || 'Linear', SOLID_SCRIPT_CURVE_KIND_WORDS, 'Kind');
  return CURVE_SEGMENT_MODES.find((mode) => SOLID_SCRIPT_CURVE_SEGMENT_KINDS[mode] === word) ?? 'linear';
}

/**
 * Reads an optional number field: left off is undefined.
 *
 * @param run Running line.
 * @param key Key of the field.
 * @param label Command, for messages.
 * @param field Caption of the field, for messages.
 * @returns Number, or undefined when the field is empty.
 */
function solidScriptCurveOptional(
  run: SolidScriptBlockRun,
  key: string,
  label: string,
  field: string,
): number | undefined {
  if (run.source(key).trim() === '') return undefined;
  const number = solidScriptValueNumber(run.value(key));
  if (number === undefined || !Number.isFinite(number))
    throw new Error(`${label} needs a number in ${field}, such as 0.5`);
  return number;
}

/**
 * The Into field of Remove Segment: it gives a Path or a Curve, whichever From
 * held.
 *
 * @returns Field.
 */
function solidScriptSegmentIntoField() {
  return {
    ...solidScriptParameterWrites(
      solidScriptParameterOptional(
        'into',
        'Into',
        'name',
        'Variable to write the result to, such as Rail to replace it.',
      ),
      { rule: 'kind', kind: 'Path', also: ['Curve'], what: 'with the segment removed by **{command}**' },
    ),
    into: 'label' as const,
    optional: false,
    default: 'Result',
  };
}

/**
 * Removes the segment from the Path or Curve in Of and writes the result.
 *
 * @param run Running line.
 */
function solidScriptRemoveSegmentRun(run: SolidScriptBlockRun): void {
  const index = solidScriptValueNumber(run.value('segment'));
  const raw = run.values('from');
  const given = raw.length === 1 ? raw[0] : undefined;
  if (given instanceof SolidScriptCurveValue)
    return solidScriptCurveWrite(run, solidScriptCurveRemove(given.curve, index));
  solidScriptPathWrite(
    run,
    solidScriptPathSegmentRemove(solidScriptPathSource(run, 'Remove Segment', 'from', 'From'), index, 'Remove Segment'),
  );
}

/** Insert Segment, Set Curve Point and Remove Segment. */
export const SOLID_SCRIPT_COMMANDS_CURVE_EDIT: readonly SolidScriptCommand[] = [
  new SolidScriptCommand({
    id: 'insert_segment',
    edits: true,
    label: 'Insert Segment',
    category: 'Curves',
    description: 'Put a new point and segment into a curve',
    manual:
      'Puts a new point into a Curve as point number Position and writes the longer Curve to Into. Points count from 0. In the middle the new point goes between the two points around it, at Point, with its x kept between them; it splits their segment, the part before keeps its Kind and the new segment from the point to the next one gets Kind. At 0 the new point becomes the first point, and at the number of points the last, so it sits at X 0 or 1 and Point x is where the point that was there moves to; the new segment joins the two. The new segment starts out straight along its chord, so Set Curve Point shapes it. Example: Linear Curve From 0, 0 To 1, 0 Into [Ramp], then Insert Segment Of [Ramp] At 1 Point 0.5, 1 Into [Ramp] makes a tent.',
    stops: [
      'A Curve that is not a Curve.',
      'A Position below 0, not a whole number, or past the number of points in Curve.',
      'A Point that is not two numbers.',
      'A Kind other than Linear, Quadratic or Bezier.',
      'A curve that already has the most points a curve may hold.',
    ],
    parameters: [
      solidScriptCurveField('curve', 'Curve', 'The Curve to add to, such as [Profile].'),
      solidScriptParameter(
        'at',
        'Position',
        'count',
        '1',
        'The number the new point gets, counting from 0, such as 0 to put it first.',
      ),
      solidScriptParameter(
        'point',
        'Point',
        'vector2',
        '0.5, 0.5',
        'Where the new point goes, x then height from 0 to 1, such as 0.5, 1.',
      ),
      solidScriptParameterWords(
        'kind',
        'Kind',
        'text',
        'Linear',
        'Linear, Quadratic or Bezier. Type one word, such as Linear.',
        [
          { word: 'Linear', detail: 'A straight segment' },
          { word: 'Quadratic', detail: 'A segment pulled toward one handle' },
          { word: 'Bezier', detail: 'A segment bent by two handles' },
        ],
      ),
      solidScriptCurveIntoField(),
    ],
    listing: (read) => [
      'Insert Segment',
      'Of ',
      read.value('curve'),
      ' At ',
      read.value('at'),
      ' Point ',
      read.value('point'),
      ' Kind ',
      read.value('kind'),
      ' Into ',
      read.value('into'),
    ],
    execute: (run) => {
      const curve = solidScriptCurveSource(run, 'Insert Segment');
      const at = solidScriptValueNumber(run.value('at'));
      const place = solidScriptCurvePlace(run, 'Insert Segment', 'point', 'Point');
      solidScriptCurveWrite(run, solidScriptCurveInsert(curve, at, place, solidScriptCurveKindRead(run)));
      return [];
    },
  }),
  new SolidScriptCommand({
    id: 'set_curve_point',
    edits: true,
    label: 'Set Curve Point',
    category: 'Curves',
    description: 'Move a point of a curve',
    manual:
      'Moves point number Point of a Curve to X and Y and writes the Curve to Into. Points count from 0. A point stays in order: X is kept between the points on either side, so it can reach them but never pass them, and the first and last point keep X 0 and 1 and move only up and down; Y is kept from 0 to 1. The handles move with the point and stay between their points. Leave X or Y empty to keep it. Example: Set Curve Point Of [Ramp] Point 1 X 0.3 Y 0.9 Into [Ramp].',
    stops: [
      'A Curve that is not a Curve.',
      'A Point below 0, not a whole number, or past the last point of Curve.',
      'An X or Y that is not a number.',
    ],
    parameters: [
      solidScriptCurveField('curve', 'Curve', 'The Curve to change, such as [Profile].'),
      solidScriptParameter('at', 'Point', 'count', '1', 'The number of the point to move, counting from 0, such as 1.'),
      solidScriptParameterOptional(
        'x',
        'X',
        'number',
        'Where along the curve the point goes, from 0 to 1, such as 0.5. Left off keeps it.',
      ),
      solidScriptParameterOptional(
        'y',
        'Y',
        'number',
        'How high the point goes, from 0 to 1, such as 0.8. Left off keeps it.',
      ),
      solidScriptCurveIntoField(),
    ],
    listing: (read) => [
      'Set Curve Point',
      'Of ',
      read.value('curve'),
      ' Point ',
      read.value('at'),
      ...solidScriptListingOptions([
        read.text('x').trim() !== '' && ['X ', read.value('x')],
        read.text('y').trim() !== '' && ['Y ', read.value('y')],
      ]),
      ' Into ',
      read.value('into'),
    ],
    execute: (run) => {
      const curve = solidScriptCurveSource(run, 'Set Curve Point');
      const at = solidScriptValueNumber(run.value('at'));
      const x = solidScriptCurveOptional(run, 'x', 'Set Curve Point', 'X');
      const y = solidScriptCurveOptional(run, 'y', 'Set Curve Point', 'Y');
      solidScriptCurveWrite(run, solidScriptCurveSet(curve, at, x, y));
      return [];
    },
  }),
  new SolidScriptCommand({
    id: 'remove_segment',
    edits: true,
    label: 'Remove Segment',
    category: 'Curves',
    description: 'Take a segment out of a path or a curve',
    synonyms: ['delete segment', 'remove path segment', 'remove curve segment'],
    manual:
      'Takes segment number Segment out of a Path or a Curve and writes the result to Into; the original stays as it is. Segments count from 0, and segment 0 runs from point 0 to point 1. An open path or a curve loses the segment and the point it ends at, so the points on either side join up and the next segment runs on from the point before with its own curve; the last segment takes the point it starts at instead, so both ends stay, and a curve always keeps its ends since it runs from X 0 to 1. A closed path is opened at the segment and keeps every point, starting at the point the segment ended at. Tilts, handle types and handles stay with their points; a Catmull Rom or NURBS path first becomes Bezier as Set Path Type makes it. Example: a path of points a, b, c, d: Remove Segment 1 leaves a, b, d.',
    stops: [
      'A From that is not a Path, a list of points or a Curve.',
      'A Segment below 0, not a whole number, or past the last segment.',
      'An open path of fewer than 3 points, or a curve of one segment, which would be left with too few points.',
    ],
    parameters: [
      {
        ...solidScriptParameter(
          'from',
          'From',
          'points3',
          '[0, 0, 0], [2, 0, 0], [4, 0, 0]',
          'The Path or Curve to take a segment out of, such as [Rail].',
        ),
        accepts: ['Path', 'Curve', 'Vector List', 'Number List'],
      },
      solidScriptParameter(
        'segment',
        'Segment',
        'count',
        '0',
        'The number of the segment, counting from 0, such as 1.',
      ),
      solidScriptSegmentIntoField(),
    ],
    listing: (read) => [
      'Remove Segment',
      'From ',
      read.value('from'),
      ' Segment ',
      read.value('segment'),
      ' Into ',
      read.value('into'),
    ],
    execute: (run) => {
      solidScriptRemoveSegmentRun(run);
      return [];
    },
  }),
];
