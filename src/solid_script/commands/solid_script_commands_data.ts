import { solidScriptListingOf } from './solid_script_command_listing.js';
import { SolidScriptCommand } from './solid_script_command.js';
import { solidScriptParameterOfWhere } from './solid_script_command_of_where.js';
import { solidScriptConditionHolds } from '@/solid_script/language/solid_script_condition.js';
import { solidScriptParameter, solidScriptParameterOf } from './solid_script_command_parameters.js';
import type { SolidScriptBlockRun } from '@/solid_script/language/solid_script_machine_types.js';
import { solidScriptDataBlur } from '@/solid_script/language/solid_script_data_blur.js';
import { solidScriptOfEmpty } from '@/solid_script/language/solid_script_select.js';
import { SolidScriptElement } from '@/solid_script/language/solid_script_value.js';

/** Kinds of items the Data lines work on. */
const SOLID_SCRIPT_DATA_BLUR_KINDS: ReadonlySet<string> = new Set(['face', 'edge', 'vertex']);

/**
 * Reads the faces, edges or corners a Data line works on: those of its Of, else
 * of [$Selected.Faces], that pass Where.
 *
 * @param run Running line.
 * @param label Line label, for messages.
 * @returns Items.
 */
export function solidScriptDataItems(run: SolidScriptBlockRun, label: string): SolidScriptElement[] {
  const given = run.ofValues();
  const items = given ?? run.selectedGet('faces');
  if (items.length === 0)
    throw new Error(
      given ? `${label} has nothing in Of; check that Of holds faces` : solidScriptOfEmpty(label, 'faces'),
    );
  const checked = items.map((item) => {
    if (!(item instanceof SolidScriptElement) || !SOLID_SCRIPT_DATA_BLUR_KINDS.has(item.kind))
      throw new Error(`${label} takes faces, edges or corners`);
    return item;
  });
  return checked.filter((item, index) =>
    solidScriptConditionHolds(run, 'where', { $Item: item, $Index: index, $Count: checked.length }),
  );
}

/**
 * Reads Rounds: a whole number of 0 or more.
 *
 * @param run Running line.
 * @returns Rounds.
 */
function solidScriptDataBlurRounds(run: SolidScriptBlockRun): number {
  const rounds = run.value('rounds');
  if (typeof rounds !== 'number' || rounds < 0 || !Number.isInteger(rounds))
    throw new Error('Rounds needs a whole number of 0 or more, such as 3');
  return rounds;
}

/** Commands that work on the .Data values of geometry. */
export const SOLID_SCRIPT_COMMANDS_DATA: readonly SolidScriptCommand[] = [
  new SolidScriptCommand({
    id: 'blur_data',
    label: 'Blur Data',
    category: 'Faces',
    description: 'Smooth a .Data value by averaging it with its neighbors',
    manual:
      'Averages the number or vector under .Data Key of each item in Of with those of its neighbors, Rounds times, as Blur Attribute does. Faces are neighbors when they share an edge, and edges or corners when they share a corner; only items in Of that pass the 🔁 Where count, and the others keep their values. Every round reads the values of the round before, so the result does not depend on the order. Items whose Key holds no number are left as they are. Of gives faces, edges or corners; empty uses [$Selected.Faces]. Example: Set [Box.Faces.Data.Heat] [=[$Item.Normal].Y > 0.5 ? 6 : 0], then Blur Data Key Heat Rounds 3 Of [Box.Faces] spreads the heat of the top over the sides.',
    stops: [
      'No items: an empty Of with nothing in [$Selected.Faces].',
      'Rounds that is not a whole number of 0 or more.',
    ],
    parameters: [
      solidScriptParameter(
        'key',
        'Key',
        'text',
        'Height',
        'The .Data key to smooth, such as Height for [Face.Data.Height].',
      ),
      solidScriptParameter(
        'rounds',
        'Rounds',
        'number',
        '1',
        'How many times to average with the neighbors, such as 3.',
      ),
      solidScriptParameterOfWhere('Item', '[=[$Item.Normal.Y] > 0]'),
      solidScriptParameterOf('faces, edges, vertices', '$Selected.Faces', ['Face', 'Edge', 'Vertex']),
    ],
    listing: (read) => [
      'Blur Data',
      ' Key ',
      read.value('key'),
      ' Rounds ',
      read.value('rounds'),
      ...solidScriptListingOf(read),
    ],
    execute: (run) => {
      const key = run.text('key').trim();
      if (key === '') throw new Error('Blur Data needs a Key, such as Height');
      solidScriptDataBlur(solidScriptDataItems(run, 'Blur Data'), key, solidScriptDataBlurRounds(run), run.elements);
      return [];
    },
  }),
];
