import type { SolidScriptCommand } from './solid_script_command.js';
import { SolidScriptCommandModule } from './solid_script_command_module.js';
import { SolidScriptCommandStatement } from './solid_script_command_statement.js';
import { solidScriptParameter } from './solid_script_command_parameters.js';

/** Id of the command that closes a block. */
export const SOLID_SCRIPT_COMMAND_END = 'end';

/** Id of the command of an empty line, which inserting a command fills. */
export const SOLID_SCRIPT_COMMAND_BLANK = 'blank';

/** Commands for values, loops, conditions and notes. */
export const SOLID_SCRIPT_COMMANDS_LOGIC: readonly SolidScriptCommand[] = [
  new SolidScriptCommandStatement({
    id: 'variable',
    label: 'Variable',
    description: 'Names a value that later lines can use instead of a number.',
    parameters: [
      solidScriptParameter('name', 'Name', 'name', 'width', 'Letters, digits and _; must not start with a digit.'),
      solidScriptParameter('value', 'Value', 'expression', '2', 'A number, a list such as [1, 2, 3], or a formula.'),
    ],
    write: (value) => `${value('name')} = ${value('value')};`,
  }),
  new SolidScriptCommandStatement({
    id: 'repeat',
    label: 'Repeat',
    description: 'Runs the lines up to its End once per value, counting from Start to End Value.',
    nesting: 'open',
    parameters: [
      solidScriptParameter('variable', 'Counter', 'name', 'i', 'Name of the counter that the repeated lines can use.'),
      solidScriptParameter('from', 'Start', 'number', '0', 'First counter value.'),
      solidScriptParameter('to', 'End Value', 'number', '3', 'Last counter value.'),
      solidScriptParameter('step', 'Step', 'number', '1', 'Added to the counter each time.'),
    ],
    write: (value) => `for (${value('variable')} = [${value('from')} : ${value('step')} : ${value('to')}]) {`,
  }),
  new SolidScriptCommandStatement({
    id: 'if',
    label: 'If',
    description: 'Runs the lines up to its Else or End only when the condition holds.',
    nesting: 'open',
    parameters: [
      solidScriptParameter('condition', 'Condition', 'expression', 'i % 2 == 0', 'A comparison such as width > 2.'),
    ],
    write: (value) => `if (${value('condition')}) {`,
  }),
  new SolidScriptCommandStatement({
    id: 'else',
    label: 'Else',
    description: 'Inside an If: runs the following lines when the condition does not hold.',
    nesting: 'continue',
    parameters: [],
    write: () => '} else {',
  }),
  new SolidScriptCommandStatement({
    id: SOLID_SCRIPT_COMMAND_END,
    label: 'End',
    description: 'Closes the block opened above it.',
    nesting: 'close',
    parameters: [],
    inPalette: false,
    write: () => '}',
  }),
  new SolidScriptCommandStatement({
    id: 'detail',
    label: 'Detail',
    description: 'Sets how many facets later spheres, cylinders and circles get.',
    parameters: [solidScriptParameter('segments', 'Segments', 'number', '24', 'Facets around a full circle.')],
    write: (value) => `$fn = ${value('segments')};`,
  }),
  new SolidScriptCommandModule({
    module: 'echo',
    label: 'Echo',
    category: 'Logic',
    description: 'Writes a value to the output list, to check what a formula gives.',
    parameters: [
      {
        ...solidScriptParameter('value', 'Value', 'expression', '"Hello"', 'Text in quotes, a number or a formula.'),
        positional: true,
      },
    ],
  }),
  new SolidScriptCommandStatement({
    id: 'note',
    label: 'Note',
    description: 'A comment for people reading the script; it does nothing.',
    parameters: [solidScriptParameter('text', 'Text', 'text', 'Describe this part', 'Any text.')],
    write: (value) => `// ${value('text')}`,
  }),
  new SolidScriptCommandStatement({
    id: SOLID_SCRIPT_COMMAND_BLANK,
    label: 'Blank Line',
    description: 'An empty line that keeps parts of a script apart; a new command fills it.',
    parameters: [],
    inPalette: false,
    write: () => '',
  }),
  new SolidScriptCommandStatement({
    id: 'part',
    label: 'Define Part',
    category: 'Parts',
    description: 'Names the lines up to its End as a part. They build nothing here, only where Use Part asks.',
    nesting: 'open',
    parameters: [
      solidScriptParameter('name', 'Name', 'name', 'part', 'Name Use Part refers to; it also names the brushes.'),
    ],
    write: (value) => `module ${value('name')}() {`,
  }),
  new SolidScriptCommandStatement({
    id: 'use_part',
    label: 'Use Part',
    category: 'Parts',
    description: 'Builds a part defined with Define Part, here and moved by the blocks around this line.',
    parameters: [solidScriptParameter('name', 'Name', 'name', 'part', 'Name of a part defined in this script.')],
    write: (value) => `${value('name')}();`,
  }),
];
