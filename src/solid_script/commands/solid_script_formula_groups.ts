import { SOLID_SCRIPT_COMMAND_CATALOG } from './solid_script_command_catalog.js';
import { SolidScriptCommand, type SolidScriptCommandCategory } from './solid_script_command.js';
import {
  SOLID_SCRIPT_FUNCTION_DOCS,
  solidScriptFunctionArguments,
  solidScriptFunctionInputsLeast,
} from '@/solid_script/language/solid_script_function_docs.js';
import { solidScriptFormulaCheckName, type SolidScriptFormulaOwnFunction } from './solid_script_formula_inputs.js';
import { solidScriptFunctionKey } from '@/solid_script/language/solid_script_name_key.js';

/** How a group block joins the blocks inside it into a formula. */
export type SolidScriptFormulaGroupForm =
  | { readonly form: 'join'; readonly operator: string }
  | { readonly form: 'unary'; readonly operator: string }
  | { readonly form: 'choose' }
  | { readonly form: 'list' }
  | { readonly form: 'call'; readonly key: string; readonly name?: string };

/** A block that holds other blocks, such as And, Equals or Absolute. */
export interface SolidScriptFormulaGroup {
  /** Command id. */
  readonly id: string;
  /** How it joins the blocks inside. */
  readonly join: SolidScriptFormulaGroupForm;
  /** Fewest blocks inside each part. */
  readonly min: number;
  /** Most blocks inside each part. */
  readonly max: number;
  /** Parts it has: If has its check, Then and Else. */
  readonly sections: number;
}

/** Texts of one block. */
export interface SolidScriptFormulaBlockText {
  /** Stored id. */
  id: string;
  /** Visible name. */
  label: string;
  /** Short description with an example. */
  description: string;
  /** Longer help with an example. */
  manual: string;
  /** Other words people search for. */
  synonyms?: readonly string[];
}

/** Ids of the blocks that keep the formula together. */
export const SOLID_SCRIPT_FORMULA_COMMAND = {
  and: 'formula_and',
  or: 'formula_or',
  not: 'formula_not',
  negate: 'formula_negate',
  choose: 'formula_if',
  then: 'formula_then',
  otherwise: 'formula_else',
  number: 'formula_number',
  vector: 'formula_vector',
  text: 'formula_text',
  variable: 'formula_variable',
  value: 'formula_value',
  list: 'formula_list',
} as const;

/**
 * Start of the id of a function block, followed by its key, such as
 * formula_fn_abs.
 */
export const SOLID_SCRIPT_FORMULA_FUNCTION = 'formula_fn_';

/**
 * Start of the id of the block of a Function the script defines, followed by
 * the key of its name, such as formula_own_area.
 */
export const SOLID_SCRIPT_FORMULA_OWN = 'formula_own_';

/**
 * Returns the id of the block of a Function the script defines; any case of its
 * name gives the same block.
 *
 * @param name Function name as written, such as Area.
 * @returns Command id.
 */
export function solidScriptFormulaOwnId(name: string): string {
  return `${SOLID_SCRIPT_FORMULA_OWN}${solidScriptFunctionKey(name)}`;
}

/** Operators with their block, loosest first; each holds two or more blocks. */
const SOLID_SCRIPT_FORMULA_OPERATORS: readonly (SolidScriptFormulaBlockText & {
  operator: string;
  category: SolidScriptCommandCategory;
})[] = [
  {
    id: SOLID_SCRIPT_FORMULA_COMMAND.or,
    operator: '||',
    category: 'Groups',
    label: 'Or',
    description: 'Yes when any block inside is Yes',
    manual: 'Yes when at least one block inside it is Yes. Example: Or, Has Tag Top, Has Tag Side, End Or.',
  },
  {
    id: SOLID_SCRIPT_FORMULA_COMMAND.and,
    operator: '&&',
    category: 'Groups',
    label: 'And',
    description: 'Yes when every block inside is Yes',
    manual: 'Yes only when all the blocks inside it are Yes. Example: And, In Box, Facing, End And.',
  },
  {
    id: 'formula_equals',
    operator: '==',
    category: 'Operators',
    label: 'Equals',
    synonyms: ['equal', 'same', 'is', '=='],
    description: 'Yes when the blocks inside are the same, such as 2 and 2',
    manual:
      'Yes when its blocks are the same. Example: Equals, Variable $Index, Number 0, End Equals keeps the first one.',
  },
  {
    id: 'formula_differs',
    operator: '!=',
    category: 'Operators',
    label: 'Not Equal',
    synonyms: ['differs', 'different', 'unequal', 'is not', '!='],
    description: 'Yes when the blocks inside are different',
    manual: 'Yes when its blocks are not the same. Example: Not Equal, Variable Name, Text Top, End Not Equal.',
  },
  {
    id: 'formula_less',
    operator: '<',
    category: 'Operators',
    label: 'Less Than',
    synonyms: ['smaller', 'below', 'fewer', '<'],
    description: 'Yes when the first block is smaller, such as 1 < 2',
    manual:
      'Yes when the first block is smaller than the second. Example: Less Than, Variable $Face.Area, Number 2, End Less Than.',
  },
  {
    id: 'formula_at_most',
    operator: '<=',
    category: 'Operators',
    label: 'At Most',
    synonyms: ['less or equal', 'less than or equal', 'no more than', 'maximum', '<='],
    description: 'Yes when the first block is smaller or the same',
    manual: 'Yes when the first block is at most the second. Example: At Most, Variable $CY, Number 0, End At Most.',
  },
  {
    id: 'formula_more',
    operator: '>',
    category: 'Operators',
    label: 'Greater Than',
    synonyms: ['more than', 'bigger', 'larger', 'above', '>'],
    description: 'Yes when the first block is bigger, such as 3 > 2',
    manual:
      'Yes when the first block is bigger than the second. Example: Greater Than, Variable $NY, Number 0.5, End Greater Than keeps faces that face up.',
  },
  {
    id: 'formula_at_least',
    operator: '>=',
    category: 'Operators',
    label: 'At Least',
    synonyms: ['greater or equal', 'greater than or equal', 'no less than', 'minimum', '>='],
    description: 'Yes when the first block is bigger or the same',
    manual:
      'Yes when the first block is at least the second. Example: At Least, Variable $Index, Number 0, End At Least.',
  },
  {
    id: 'formula_plus',
    operator: '+',
    category: 'Operators',
    label: 'Add',
    synonyms: ['plus', 'sum', 'addition', 'total', '+'],
    description: 'Adds the blocks inside, such as 2 + 3',
    manual: 'Adds its blocks together. Example: Add, Variable Width, Number 1, End Add is one more than Width.',
  },
  {
    id: 'formula_minus',
    operator: '-',
    category: 'Operators',
    label: 'Subtract',
    synonyms: ['minus', 'difference', 'take away', 'subtraction', '-'],
    description: 'Takes the later blocks off the first, such as 5 - 2',
    manual: 'Takes the second block off the first. Example: Subtract, Variable Width, Number 1, End Subtract.',
  },
  {
    id: 'formula_times',
    operator: '*',
    category: 'Operators',
    label: 'Multiply',
    synonyms: ['times', 'product', 'multiplication', '*'],
    description: 'Multiplies the blocks inside, such as 2 * 3',
    manual: 'Multiplies its blocks. Example: Multiply, Variable Width, Number 2, End Multiply is twice Width.',
  },
  {
    id: 'formula_divide',
    operator: '/',
    category: 'Operators',
    label: 'Divide',
    synonyms: ['divided by', 'over', 'quotient', 'division', '/'],
    description: 'Divides the first block by the next, such as 6 / 2',
    manual:
      'Divides the first block by the second. Example: Divide, Variable Width, Number 2, End Divide is half Width.',
  },
  {
    id: 'formula_remainder',
    operator: '%',
    category: 'Operators',
    label: 'Remainder',
    synonyms: ['modulo', 'mod', 'modulus', '%'],
    description: 'What is left after dividing, such as 7 % 3 is 1',
    manual:
      'What is left when the first block is divided by the second. Example: Remainder, Variable $Index, Number 2, End Remainder is 0 for every other one.',
  },
  {
    id: 'formula_power',
    operator: '^',
    category: 'Operators',
    label: 'Power',
    synonyms: ['exponent', 'raise', 'pow', 'squared', '^'],
    description: 'Raises the first block to the next, such as 2 ^ 3 is 8',
    manual:
      'Multiplies the first block by itself as often as the second says. Example: Power, Number 2, Number 3, End Power is 8.',
  },
];

/** Blocks that hold one block and turn it around. */
const SOLID_SCRIPT_FORMULA_UNARY: readonly (SolidScriptFormulaBlockText & {
  operator: string;
  category: SolidScriptCommandCategory;
})[] = [
  {
    id: SOLID_SCRIPT_FORMULA_COMMAND.not,
    operator: '!',
    category: 'Groups',
    label: 'Not',
    description: 'Yes when the block inside is No',
    manual: 'Turns Yes into No and No into Yes. Example: Not, Facing, End Not keeps faces that do not face up.',
  },
  {
    id: SOLID_SCRIPT_FORMULA_COMMAND.negate,
    operator: '-',
    category: 'Operators',
    label: 'Negate',
    synonyms: ['negative', 'minus', 'opposite', 'flip sign'],
    description: 'The block inside with its sign turned, such as -3',
    manual: 'Turns a number or vector the other way. Example: Negate, Variable Width, End Negate.',
  },
];

/** Friendlier names of some functions, by key. */
const SOLID_SCRIPT_FORMULA_FUNCTION_NAMES: Readonly<Record<string, string>> = {
  abs: 'Absolute',
  sqrt: 'Square Root',
  ceil: 'Round Up',
  floor: 'Round Down',
  trunc: 'Whole Part',
  fract: 'Decimals',
  len: 'Length Of',
  ln: 'Natural Log',
  exp: 'E To The',
  pow: 'Power Of',
  lerp: 'Blend',
  str: 'Text Of',
};

/** Every group block, by command id. */
const SOLID_SCRIPT_FORMULA_GROUPS = new Map<string, SolidScriptFormulaGroup>();

/**
 * Returns the group block of a command, if it is one.
 *
 * @param id Command id.
 * @returns Group, or undefined for a block that holds no blocks.
 */
export function solidScriptFormulaGroupOf(id: string): SolidScriptFormulaGroup | undefined {
  if (SOLID_SCRIPT_FORMULA_GROUPS.size === 0) solidScriptFormulaGroupCommands();
  return SOLID_SCRIPT_FORMULA_GROUPS.get(id);
}

/**
 * Returns the id of the block of an operator.
 *
 * @param operator Operator, such as ==.
 * @param unary True for an operator before one value, such as - in -3.
 * @returns Command id, or undefined when no block shows it.
 */
export function solidScriptFormulaOperatorBlock(operator: string, unary: boolean): string | undefined {
  return (unary ? SOLID_SCRIPT_FORMULA_UNARY : SOLID_SCRIPT_FORMULA_OPERATORS).find(
    (entry) => entry.operator === operator,
  )?.id;
}

/**
 * Creates a formula block: it never runs, the formula it stands for does.
 *
 * @param text Id, name and help.
 * @param category Palette group.
 * @param spec Fields, nesting, listing and the check of its fields.
 * @returns Command.
 */
export function solidScriptFormulaBlock(
  text: SolidScriptFormulaBlockText,
  category: SolidScriptCommandCategory,
  spec: Partial<
    Pick<ConstructorParameters<typeof SolidScriptCommand>[0], 'parameters' | 'nesting' | 'parts' | 'check' | 'listing'>
  > = {},
): SolidScriptCommand {
  return new SolidScriptCommand({
    ...text,
    category,
    parameters: spec.parameters ?? [],
    nesting: spec.nesting ?? 'none',
    ...(spec.parts ? { parts: spec.parts } : {}),
    ...(spec.check ? { check: spec.check } : {}),
    named: false,
    runs: false,
    listing: spec.listing ?? (() => [text.label]),
    execute: () => [],
  });
}

/**
 * Adds a group block and remembers how it joins.
 *
 * @param text Id, name and help.
 * @param category Palette group.
 * @param group How it joins, and how many blocks it holds.
 * @param parts Lines added between it and its End, such as Then and Else.
 * @returns Command.
 */
function solidScriptFormulaGroupAdd(
  text: SolidScriptFormulaBlockText,
  category: SolidScriptCommandCategory,
  group: Omit<SolidScriptFormulaGroup, 'id'>,
  parts: readonly string[] = [],
): SolidScriptCommand {
  SOLID_SCRIPT_FORMULA_GROUPS.set(text.id, { id: text.id, ...group });
  return solidScriptFormulaBlock(text, category, { nesting: 'open', parts });
}

/**
 * Creates the block of a function, which holds one block per input.
 *
 * @param key Function key, such as abs.
 * @returns Command.
 */
function solidScriptFormulaFunction(key: string): SolidScriptCommand {
  const doc = SOLID_SCRIPT_FUNCTION_DOCS[key];
  const inputs = solidScriptFunctionArguments(key).map((input) => input.name);
  const name = solidScriptFormulaCheckName(key);
  const label = SOLID_SCRIPT_FORMULA_FUNCTION_NAMES[key] ?? name.replace(/([a-z])([A-Z])/g, '$1 $2');
  const id = `${SOLID_SCRIPT_FORMULA_FUNCTION}${key}`;
  const call = { id, label, summary: doc?.summary ?? label, category: doc?.group ?? 'Functions' };
  const max = inputs.includes('...') ? Number.POSITIVE_INFINITY : inputs.length;
  const min = Math.max(1, solidScriptFunctionInputsLeast(key));
  return solidScriptFormulaCall(call, inputs, doc?.usage ?? name, { join: { form: 'call', key }, min, max });
}

/**
 * Creates the block of a Function the script defines, like the block of a
 * built-in function: one block inside per value it takes.
 *
 * @param own Function, as the names of the script tell it.
 * @returns Command.
 */
export function solidScriptFormulaOwn(own: SolidScriptFormulaOwnFunction): SolidScriptCommand {
  const inputs = own.inputs ?? [];
  const usage = `${own.name}(${inputs.join(', ')}) -> ${own.gives ?? 'Any'}`;
  const summary = own.description ? `${own.description.replace(/\.$/, '')}.` : 'A Function of this script.';
  const call = { id: solidScriptFormulaOwnId(own.name), label: own.name, summary };
  const join = { form: 'call', key: solidScriptFunctionKey(own.name), name: own.name } as const;
  return solidScriptFormulaCall(call, inputs, usage, { join, min: inputs.length, max: inputs.length });
}

/**
 * Creates the group block of a call, which holds one block per input.
 *
 * @param call Id, name, what the function does and its palette group; Functions
 *   when it has none, as the script's own Functions.
 * @param inputs Input names.
 * @param usage How the call is written.
 * @param group How it joins and how many blocks it holds.
 * @returns Command.
 */
function solidScriptFormulaCall(
  call: { id: string; label: string; summary: string; category?: SolidScriptCommandCategory },
  inputs: readonly string[],
  usage: string,
  group: Omit<SolidScriptFormulaGroup, 'id' | 'sections'>,
): SolidScriptCommand {
  const takes = inputs.length > 0 ? ` Put a block inside for each of: ${inputs.join(', ')}.` : '';
  const text = {
    id: call.id,
    label: call.label,
    description: call.summary.replace(/\.$/, ''),
    manual: `${call.summary}${takes} Written as ${usage}.`,
  };
  return solidScriptFormulaGroupAdd(text, call.category ?? 'Functions', { ...group, sections: 1 });
}

/**
 * Creates every group block: And, Or, Not and If with its Then and Else, the
 * operators, List and the functions.
 *
 * @returns Commands.
 */
export function solidScriptFormulaGroupCommands(): SolidScriptCommand[] {
  return [
    ...solidScriptFormulaOperatorGroups(),
    ...solidScriptFormulaChoose(),
    solidScriptFormulaList(),
    ...solidScriptFormulaFunctions(),
    ...solidScriptFormulaShared(),
  ];
}

/**
 * Creates the operator blocks, which hold two or more blocks, and Not and
 * Negate, which hold one.
 *
 * @returns Commands.
 */
function solidScriptFormulaOperatorGroups(): SolidScriptCommand[] {
  const joins = SOLID_SCRIPT_FORMULA_OPERATORS.map((entry) =>
    solidScriptFormulaGroupAdd(entry, entry.category, {
      join: { form: 'join', operator: entry.operator },
      min: entry.category === 'Groups' ? 1 : 2,
      max: Number.POSITIVE_INFINITY,
      sections: 1,
    }),
  );
  const unary = SOLID_SCRIPT_FORMULA_UNARY.map((entry) =>
    solidScriptFormulaGroupAdd(entry, entry.category, {
      join: { form: 'unary', operator: entry.operator },
      min: 1,
      max: 1,
      sections: 1,
    }),
  );
  return [...joins, ...unary];
}

/**
 * Creates the block of every function that takes inputs, except the checks.
 *
 * @returns Commands.
 */
function solidScriptFormulaFunctions(): SolidScriptCommand[] {
  return Object.entries(SOLID_SCRIPT_FUNCTION_DOCS)
    .filter(([key, doc]) => doc.group !== 'Checks' && solidScriptFunctionArguments(key).length > 0)
    .map(([key]) => solidScriptFormulaFunction(key));
}

/**
 * Creates List, which holds one or more blocks as the items of a list.
 *
 * @returns Command.
 */
function solidScriptFormulaList(): SolidScriptCommand {
  return solidScriptFormulaGroupAdd(SOLID_SCRIPT_FORMULA_LIST, 'Values', SOLID_SCRIPT_FORMULA_LIST_GROUP);
}

/** How List holds its blocks: one or more, as items. */
const SOLID_SCRIPT_FORMULA_LIST_GROUP: Omit<SolidScriptFormulaGroup, 'id'> = {
  join: { form: 'list' },
  min: 1,
  max: Number.POSITIVE_INFINITY,
  sections: 1,
};

/** List, which holds its blocks as the items of a list. */
const SOLID_SCRIPT_FORMULA_LIST: SolidScriptFormulaBlockText = {
  id: SOLID_SCRIPT_FORMULA_COMMAND.list,
  label: 'List',
  description: 'The blocks inside as a list, such as 1, 2, 3',
  manual:
    'Holds its blocks as the items of a list, in order. Example: List, Text Center, Text Bottom, Text Back, End List is the Anchor Center, Bottom, Back.',
};

/** Example shared by If, Then and Else. */
const SOLID_SCRIPT_FORMULA_CHOOSE_EXAMPLE =
  'Example: If, Equals, Variable $Index, Number 0, End Equals, Then, Number 1, Else, Number 2, End If.';

/** If with its Then and Else. */
const SOLID_SCRIPT_FORMULA_CHOOSE: readonly SolidScriptFormulaBlockText[] = [
  {
    id: SOLID_SCRIPT_FORMULA_COMMAND.choose,
    label: 'If',
    description: 'Gives one of two blocks, such as 1 or 2',
    manual: `Gives the block under Then when the block under If is Yes, otherwise the block under Else. ${SOLID_SCRIPT_FORMULA_CHOOSE_EXAMPLE}`,
  },
  {
    id: SOLID_SCRIPT_FORMULA_COMMAND.then,
    label: 'Then',
    description: 'Start what an If gives when it is Yes',
    manual: `Inside an If, ends its check and starts what it gives when the check is Yes. ${SOLID_SCRIPT_FORMULA_CHOOSE_EXAMPLE}`,
  },
  {
    id: SOLID_SCRIPT_FORMULA_COMMAND.otherwise,
    label: 'Else',
    description: 'Start what an If gives when it is No',
    manual: `Inside an If, after Then, starts what it gives when the check is No. ${SOLID_SCRIPT_FORMULA_CHOOSE_EXAMPLE}`,
  },
];

/**
 * Creates If with its Then and Else, which give one of two blocks.
 *
 * @returns Commands.
 */
function solidScriptFormulaChoose(): SolidScriptCommand[] {
  const [choose, ...branches] = SOLID_SCRIPT_FORMULA_CHOOSE;
  const group = { join: { form: 'choose' }, min: 1, max: 1, sections: 3 } as const;
  return [
    ...(choose
      ? [
          solidScriptFormulaGroupAdd(
            choose,
            'Groups',
            group,
            branches.map((text) => text.id),
          ),
        ]
      : []),
    ...branches.map((text) => solidScriptFormulaBlock(text, 'Groups', { nesting: 'continue' })),
  ];
}

/**
 * Returns the End and Blank Line of the script editor, which the formula blocks
 * share.
 *
 * @returns Commands.
 */
function solidScriptFormulaShared(): SolidScriptCommand[] {
  return ['end', 'blank'].flatMap((id) => SOLID_SCRIPT_COMMAND_CATALOG.find(id) ?? []);
}
