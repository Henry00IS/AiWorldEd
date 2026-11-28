import { SolidScriptCommand } from './solid_script_command.js';
import { solidScriptParameter, solidScriptParameterWords } from './solid_script_command_parameters.js';
import {
  solidScriptPathField,
  solidScriptPathIntoField,
  solidScriptPathSource,
  solidScriptPathsSource,
  solidScriptPathWrite,
} from './solid_script_commands_path_io.js';
import { solidScriptNoiseWord } from '@/solid_script/language/solid_script_functions_noise.js';
import { SOLID_SCRIPT_MESH_POINTS_MAX } from '@/solid_script/language/solid_script_limits.js';
import type { SolidScriptBlockRun } from '@/solid_script/language/solid_script_machine_types.js';
import { solidScriptPathInsert, solidScriptPathJoin } from '@/solid_script/language/solid_script_path_join.js';
import type { SolidScriptPath } from '@/solid_script/language/solid_script_path_model.js';
import { solidScriptValueNumber } from '@/solid_script/language/solid_script_value.js';

/** The places Join Paths adds the other paths. */
const SOLID_SCRIPT_PATH_JOIN_PLACES = ['End', 'Start'] as const;

/**
 * What Join Paths and Insert Path say about the paths they add and what comes
 * of them.
 */
const SOLID_SCRIPT_PATH_JOIN_MANUAL =
  'Where a path ends at the place the next one starts, that point is kept once; otherwise a straight stretch joins them. Every path to add must be open. Tilts, handle types and Bezier handles stay with their points, and straight and Bezier stretches mix as they are; a Catmull Rom or NURBS path becomes Bezier the way Set Path Type makes it, so a Catmull Rom keeps its shape. The way the up side faces stays when every path has the same kind, else it turns as little as it can. The paths you give stay as they are.';

/** Stops both blocks share. */
const SOLID_SCRIPT_PATH_JOIN_STOPS = [
  'A Path or With that is not a Path, a list of Paths or a list of at least 2 points.',
  'A path to add that is closed. Open it first with Set Path Closed.',
  'A result of more than the most points a path may have.',
] as const;

/**
 * The Path and With fields of both blocks.
 *
 * @param withHint Hover text of With.
 * @returns Fields.
 */
function solidScriptPathJoinFields(withHint: string) {
  return [
    solidScriptPathField(
      'path',
      'Path',
      '[0, 0, 0], [4, 0, 0]',
      'The Path to add to, or a list of points, such as [Rail].',
    ),
    solidScriptPathField('with', 'With', '[4, 0, 0], [4, 0, 4]', withHint),
  ];
}

/**
 * Reads both path fields, makes the new path and writes it to Into.
 *
 * @param run Running line.
 * @param label Command, for messages.
 * @param make Makes the path from the Path and the paths in With.
 */
function solidScriptPathAddRun(
  run: SolidScriptBlockRun,
  label: string,
  make: (base: SolidScriptPath<number[]>, others: SolidScriptPath<number[]>[]) => SolidScriptPath<number[]>,
): void {
  const base = solidScriptPathSource(run, label);
  const made = make(base, solidScriptPathsSource(run, label, 'with', 'With'));
  if (made.points.length > SOLID_SCRIPT_MESH_POINTS_MAX)
    throw new Error(`${label} would make more than ${SOLID_SCRIPT_MESH_POINTS_MAX} points; use shorter paths`);
  solidScriptPathWrite(run, made);
}

/** Join Paths and Insert Path. */
export const SOLID_SCRIPT_COMMANDS_PATH_JOIN: readonly SolidScriptCommand[] = [
  new SolidScriptCommand({
    id: 'join_paths',
    edits: true,
    label: 'Join Paths',
    category: 'Paths',
    description: 'Join paths end to end into one path',
    manual: `Joins other paths onto a Path end to end and writes the one longer Path to Into. With is the path to add, or several separated by commas, such as [Spur], [Tail], or a list of Paths such as Path From Edges makes. Add At End puts them after the last point of Path, one after another in the order given; Start puts them before its first point, still in the order given. ${SOLID_SCRIPT_PATH_JOIN_MANUAL} Path must be open too, and the result is open. Example: Join Paths Of [Rail] With [Spur] Add At End Into [Rail] makes Rail run on through Spur.`,
    stops: [
      ...SOLID_SCRIPT_PATH_JOIN_STOPS,
      'A Path that is closed, since it has no ends. Open it first with Set Path Closed.',
      'An Add At other than End or Start.',
    ],
    parameters: [
      ...solidScriptPathJoinFields('A Path to add, or several Paths separated by commas, such as [Spur], [Tail].'),
      solidScriptParameterWords('add', 'Add At', 'text', 'End', 'End or Start. Type one word, such as End.', [
        { word: 'End', detail: 'After the last point of Path' },
        { word: 'Start', detail: 'Before the first point of Path' },
      ]),
      solidScriptPathIntoField(),
    ],
    listing: (read) => [
      'Join Paths',
      'Of ',
      read.value('path'),
      ' With ',
      read.value('with'),
      ' Add At ',
      read.value('add'),
      ' Into ',
      read.value('into'),
    ],
    execute: (run) => {
      const place = solidScriptNoiseWord(run.text('add').trim(), SOLID_SCRIPT_PATH_JOIN_PLACES, 'Add At');
      solidScriptPathAddRun(run, 'Join Paths', (base, others) =>
        solidScriptPathJoin(base, others, place === 'End', 'Join Paths'),
      );
      return [];
    },
  }),
  new SolidScriptCommand({
    id: 'insert_path',
    edits: true,
    label: 'Insert Path',
    category: 'Paths',
    description: 'Put a path into another path at a point number',
    manual: `Puts other paths into a Path after Position of its points and writes the longer Path to Into. Positions count from 0, so 0 puts them before the first point, the number of points puts them after the last, and 2 puts them between the third and fourth point. With is the path to put in, or several separated by commas, such as [Spur], [Tail], or a list of Paths. The stretch they go into is replaced by straight stretches to and from them. ${SOLID_SCRIPT_PATH_JOIN_MANUAL} Path may be closed: it stays closed, and the stretch back from its last point to its first stays as it was unless the paths go in at 0 or at the end, where a straight stretch closes it. Example: Rail has 4 points. Insert Path Of [Rail] With [Spur] At 2 Into [Rail] gives Rail's first 2 points, then Spur, then its last 2.`,
    stops: [
      ...SOLID_SCRIPT_PATH_JOIN_STOPS,
      'A Position below 0, not a whole number, or past the number of points in Path.',
    ],
    parameters: [
      ...solidScriptPathJoinFields('A Path to put in, or several Paths separated by commas, such as [Spur], [Tail].'),
      solidScriptParameter(
        'at',
        'Position',
        'count',
        '1',
        'How many points of Path come before it, counting from 0, such as 0 to put it first.',
      ),
      solidScriptPathIntoField(),
    ],
    listing: (read) => [
      'Insert Path',
      'Of ',
      read.value('path'),
      ' With ',
      read.value('with'),
      ' At ',
      read.value('at'),
      ' Into ',
      read.value('into'),
    ],
    execute: (run) => {
      const at = solidScriptValueNumber(run.value('at'));
      solidScriptPathAddRun(run, 'Insert Path', (base, others) =>
        solidScriptPathInsert(base, others, at, 'Insert Path'),
      );
      return [];
    },
  }),
];
