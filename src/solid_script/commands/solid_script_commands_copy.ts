import { SolidScriptCommand } from './solid_script_command.js';
import {
  solidScriptParameter,
  solidScriptParameterOptional,
  solidScriptParameterWrites,
} from './solid_script_command_parameters.js';
import { solidScriptIntoName } from '@/solid_script/language/solid_script_into.js';

/** Copy: gives a name a second thing, not a second name for the same one. */
export const SOLID_SCRIPT_COMMANDS_COPY: readonly SolidScriptCommand[] = [
  new SolidScriptCommand({
    id: 'copy',
    label: 'Copy',
    category: 'Logic',
    description: 'Make a second, independent copy of anything',
    synonyms: ['duplicate', 'clone'],
    manual:
      'Writes a copy of Value to Into, so changing one leaves the other as it was. Set gives a second name, Copy gives a second thing. It copies lists and Dictionaries all the way down, Paths, and solids and meshes as new objects with everything on them: shape, Mode, textures, UVs, tags and Name, and the Data of the object and of every face, edge, corner and face corner, nested Dictionaries and lists included. Nothing is shared with the original. A new object is only in Into until Output, and Output places it where the original was built. A number or a text is already its own value. Example: Set [B] to [A] and then Add Item 4 to B changes A too, but Copy [A] Into [B] and then Add Item 4 to B leaves A as it was. Copy [Box] Into [Spare], then Move By 2, 0, 0 Of [Spare] and Output [Spare], makes a second box beside the first.',
    stops: [
      'The Data of an object or a part of one, such as [Box.Data]: it belongs to its object. Copy the object, or make your own Dictionary with Merge Dictionary.',
      'A face, edge, corner or face corner on its own: copy its object instead.',
    ],
    parameters: [
      solidScriptParameterOptional(
        'value',
        'Value',
        'value',
        'What to copy, such as [Points], [Rail] or [Box]; it may hold lists, Dictionaries, Paths and objects.',
      ),
      solidScriptParameterWrites(
        solidScriptParameter('into', 'Into', 'name', 'Spare', 'Variable that gets the copy, such as Spare.'),
        { rule: 'value', field: 'value', what: 'copy of {value}' },
      ),
    ],
    listing: (read) => ['Copy', read.value('value'), ' Into ', read.value('into')],
    execute: (run) => {
      const copy = run.valueCopy(run.valueItems('value'), solidScriptIntoName(run.source('value')));
      run.variableSet(solidScriptIntoName(run.text('into')), copy);
      return [];
    },
  }),
];
