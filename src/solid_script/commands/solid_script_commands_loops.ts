import { SolidScriptCommand } from './solid_script_command.js';
import { solidScriptListingOptions } from './solid_script_command_listing.js';
import { solidScriptParameter, solidScriptParameterWrites } from './solid_script_command_parameters.js';
import type { SolidScriptBlockRun } from '@/solid_script/language/solid_script_machine_types.js';
import { SOLID_SCRIPT_REPEAT_ROUNDS_MAX, solidScriptLimitCount } from '@/solid_script/language/solid_script_limits.js';

/** What tells Stop Loop and Next Round apart. */
interface SolidScriptLoopJumpWords {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly manual: string;
  /** Other words people search for. */
  readonly synonyms: readonly string[];
  /** True for Next Round. */
  readonly next: boolean;
}

/** Mistakes that stop Stop Loop and Next Round. */
const SOLID_SCRIPT_LOOP_JUMP_STOPS: readonly string[] = [
  'A line outside any Repeat, For Each or While of its own Function or part.',
  'Levels that is not a whole number of 1 or more, or more than the loops around the line.',
];

/**
 * Leaves loops around the line, or goes on with the next round, by Levels.
 *
 * @param run Running line.
 * @param next True for Next Round.
 * @returns No shapes.
 */
function solidScriptLoopJumpRun(run: SolidScriptBlockRun, next: boolean): ReturnType<SolidScriptBlockRun['loopJump']> {
  return run.loopJump(run.fields().number('levels', 1), next);
}

/**
 * Builds Stop Loop or Next Round, which differ only in their words and where
 * the run goes on.
 *
 * @param words Their words.
 * @returns Command.
 */
function solidScriptLoopJumpCommand(words: SolidScriptLoopJumpWords): SolidScriptCommand {
  return new SolidScriptCommand({
    id: words.id,
    label: words.label,
    category: 'Logic',
    description: words.description,
    synonyms: words.synonyms,
    manual: words.manual,
    stops: SOLID_SCRIPT_LOOP_JUMP_STOPS,
    parameters: [
      solidScriptParameter(
        'levels',
        'Levels',
        'count',
        '1',
        'How many loops around this line it counts out, such as 2 for a Repeat inside a Repeat.',
      ),
    ],
    listing: (read) => [
      words.label,
      ...solidScriptListingOptions([read.changed('levels') && ['Levels ', read.value('levels')]]),
    ],
    execute: (run) => solidScriptLoopJumpRun(run, words.next),
  });
}

/** While, Stop Loop and Next Round. */
export const SOLID_SCRIPT_COMMANDS_LOOPS: readonly SolidScriptCommand[] = [
  new SolidScriptCommand({
    id: 'while',
    label: 'While',
    category: 'Logic',
    description: 'Run lines again and again while something is True',
    synonyms: ['loop', 'until', 'do while'],
    manual: `Runs the lines inside again and again while the condition is True, checking it before each round, so a condition that is False at the start runs no round. The counter holds the round number, from 0, for the condition and the lines inside. A line inside must change something the condition reads, or end the loop with Stop Loop. Example: Set [Height] to 0, then While [Height] < 3 around Cube and Set [Height] to [=[Height] + 0.5] stacks six cubes.`,
    stops: [
      `More than ${solidScriptLimitCount(SOLID_SCRIPT_REPEAT_ROUNDS_MAX)} rounds.`,
      'A [Name] for a variable not set above this line, or a condition that cannot be read.',
      'A counter name that is not letters, digits and _.',
      'A missing End line.',
    ],
    nesting: 'open',
    flow: { kind: 'loop' },
    parameters: [
      solidScriptParameterWrites(
        solidScriptParameter(
          'variable',
          'Counter',
          'name',
          'Round',
          'Name the condition and the lines inside use for the round number, from 0, such as Round.',
        ),
        { rule: 'kind', kind: 'Number', what: 'round of **{command}**' },
      ),
      solidScriptParameter(
        'condition',
        'Condition',
        'condition',
        '[Round] < 3',
        'A comparison checked before each round, such as [Height] < 3.',
      ),
    ],
    listing: (read) => [
      'While',
      read.value('condition'),
      ...solidScriptListingOptions([read.changed('variable') && [' Counter ', read.value('variable')]]),
    ],
    execute: (run) => run.whileRepeated(run.text('variable'), 'condition'),
  }),
  solidScriptLoopJumpCommand({
    id: 'stop_loop',
    label: 'Stop Loop',
    description: 'Leave the loop it is in',
    synonyms: ['break', 'exit loop', 'leave loop'],
    manual:
      "Leaves the Repeat, For Each or While it is in: the lines after it in that loop do not run, and the script goes on after the loop's End. Levels leaves that many loops at once, so Levels 2 inside a Repeat inside a Repeat goes on after the outer End. It only counts loops of its own Function or part. Example: For Each [Spot] In [Spots] around If [Spot.Y] > 4 around Stop Loop stops at the first high spot.",
    next: false,
  }),
  solidScriptLoopJumpCommand({
    id: 'next_round',
    label: 'Next Round',
    description: 'Skip to the next round of the loop it is in',
    synonyms: ['continue', 'skip round'],
    manual:
      'Skips the rest of this round of the Repeat, For Each or While it is in and goes on with its next round. Levels counts loops out, so Levels 2 inside a Repeat inside a Repeat leaves the inner one and goes on with the next round of the outer one. It only counts loops of its own Function or part. Example: Repeat [I] From 0 To 10 around If [I] == 5 around Next Round, then Cube, leaves a gap at 5.',
    next: true,
  }),
];
