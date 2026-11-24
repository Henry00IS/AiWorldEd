import { SolidScriptCommand, type SolidScriptCommandParameter } from './solid_script_command.js';
import {
  solidScriptListingOptions,
  type SolidScriptListingPiece,
  type SolidScriptListingValues,
} from './solid_script_command_listing.js';
import { solidScriptParameter } from './solid_script_command_parameters.js';
import { solidScriptColorRead, solidScriptParameterColor } from './solid_script_color_field.js';
import {
  solidScriptWidgetAtParameter,
  solidScriptWidgetLabel,
  solidScriptWidgetLabelParameter,
  solidScriptWidgetPoint,
  solidScriptWidgetWritesParameter,
} from './solid_script_widget_fields.js';
import { SOLID_SCRIPT_WIDGET_COMMAND_PREFIX } from '@/solid_script/language/solid_script_widget.js';
import type { SolidScriptBlockRun } from '@/solid_script/language/solid_script_machine_types.js';

/**
 * Adds the button of a Widget Button or Widget Toggle line.
 *
 * @param run The running line.
 * @param kind Button, or Toggle, which shows whether it is on.
 * @returns No shapes.
 */
function solidScriptWidgetButtonRun(run: SolidScriptBlockRun, kind: 'Button' | 'Toggle'): [] {
  run.widgetAdd({
    kind,
    label: solidScriptWidgetLabel(run, kind),
    writes: run.text('writes').trim(),
    at: solidScriptWidgetPoint(run, 'at', [0, 0, 0]).toArray(),
    on: kind === 'Toggle' && run.fields().flag('shows'),
    color: solidScriptColorRead(run),
  });
  return [];
}

/**
 * Returns the fields both buttons share after their first ones.
 *
 * @param what Button or toggle, for the hover texts.
 * @returns Fields.
 */
function solidScriptWidgetButtonFields(what: string): SolidScriptCommandParameter[] {
  return [
    solidScriptWidgetAtParameter(`Point the ${what} floats at, such as 0, 2, 0.`),
    solidScriptWidgetLabelParameter(
      `Text on the ${what}, such as Reset. Left off, the name in Writes is shown in words, so ResetAll shows Reset All.`,
    ),
    solidScriptParameterColor(`Colour of the ${what}'s edge, a name such as Blue or a hex colour such as #3d8fd6.`),
  ];
}

/**
 * Lists the options a button line shows when they differ from their defaults.
 *
 * @param read Reads the line's fields.
 * @returns Listing parts.
 */
function solidScriptWidgetButtonListing(read: SolidScriptListingValues): SolidScriptListingPiece[] {
  return solidScriptListingOptions([
    read.changed('at') && ['At ', read.value('at')],
    read.text('label') !== '' && ['Label ', read.value('label')],
    read.text('color') !== '' && ['Color ', read.value('color')],
  ]);
}

/** Widget Button and Widget Toggle. */
export const SOLID_SCRIPT_COMMANDS_WIDGET_BUTTONS: readonly SolidScriptCommand[] = [
  new SolidScriptCommand({
    id: `${SOLID_SCRIPT_WIDGET_COMMAND_PREFIX}button`,
    label: 'Widget Button',
    category: 'Widgets',
    description: 'Click a button in the scene to run When Button Pressed',
    manual:
      'Puts a button in the scene while editing the generator (select it with Bounds, then click Edit). It floats at At, placed by the Transform around the line, and a click presses the Button Input named by Writes: its When Button Pressed lines run, as when the button in the inspector is clicked, and the press is one undo step. Use it for actions such as Reset, or to store a choice that stays between runs in a Persistent value. Example: Input ResetAll with Type Button, then When Button Pressed ResetAll holds Set Input Width to 2, and Widget Button Writes ResetAll At 0, 2, 0 shows a Reset All button above the object.',
    stops: ['A Writes that names no Input above the line.', 'A Color that is not a colour.'],
    parameters: [
      solidScriptWidgetWritesParameter('Name of the Button Input a click presses, such as ResetAll.'),
      ...solidScriptWidgetButtonFields('button'),
    ],
    listing: (read) => ['Widget Button', read.value('writes'), ...solidScriptWidgetButtonListing(read)],
    execute: (run) => solidScriptWidgetButtonRun(run, 'Button'),
  }),
  new SolidScriptCommand({
    id: `${SOLID_SCRIPT_WIDGET_COMMAND_PREFIX}toggle`,
    label: 'Widget Toggle',
    category: 'Widgets',
    description: 'A button in the scene that shows on or off',
    manual:
      'Puts a button in the scene while editing that shows as on while Shows is Yes. A click on a Switch Input named by Writes flips it, and its When Input Changes lines run; a click on a Button Input presses it, and its When Button Pressed lines decide what changes. So the script decides what on means: Shows is often the Switch itself, or a check of a Persistent value such as [=[$Persistent.Page] == "Paths"], which makes a row of toggles act as a menu with one picked. Example: Input ShowRails with Type Switch, then Widget Toggle Shows [ShowRails] Writes ShowRails Label Rails.',
    stops: ['A Writes that names no Input above the line.', 'A Color that is not a colour.'],
    parameters: [
      solidScriptParameter('shows', 'Shows', 'boolean', 'No', 'Yes while the toggle shows as on, such as [ShowRails].'),
      solidScriptWidgetWritesParameter(
        'Name of the Switch Input a click flips, or of the Button Input it presses, such as ShowRails.',
      ),
      ...solidScriptWidgetButtonFields('toggle'),
    ],
    listing: (read) => [
      'Widget Toggle',
      read.value('shows'),
      ' Writes ',
      read.value('writes'),
      ...solidScriptWidgetButtonListing(read),
    ],
    execute: (run) => solidScriptWidgetButtonRun(run, 'Toggle'),
  }),
];
