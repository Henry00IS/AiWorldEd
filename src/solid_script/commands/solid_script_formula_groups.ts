import { SOLID_SCRIPT_COMMAND_CATALOG } from './solid_script_command_catalog.js';
import { SolidScriptCommand, type SolidScriptCommandCategory } from './solid_script_command.js';
import {
  SOLID_SCRIPT_FUNCTION_DOCS,
  solidScriptFunctionArguments,
} from '@/solid_script/language/solid_script_function_docs.js';
import { solidScriptFormulaCheckName } from './solid_script_formula_inputs.js';

/** How a group block joins the blocks inside it into a formula. */
export type SolidScriptFormulaGroupForm =
  | { readonly form: 'join'; readonly operator: string }
  | { readonly form: 'unary'; readonly operator: string }
  | { readonly form: 'choose' }
  | { readonly form: 'call'; readonly key: string };

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
} as const;

/**
 * Start of the id of a function block, followed by its key, such as
 * formula_fn_abs.
 */
export const SOLID_SCRIPT_FORMULA_FUNCTION = 'formula_fn_';

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
    description: 'Yes when the blocks inside are the same, such as 2 and 2',
    manual:
      'Yes when its blocks are the same. Example: Equals, Variable $Index, Number 0, End Equals keeps the first one.',
  },
  {
    id: 'formula_differs',
    operator: '!=',
    category: 'Operators',
    label: 'Differs',
    description: 'Yes when the blocks inside are different',
    manual: 'Yes when its blocks are not the same. Example: Differs, Variable Name, Text Top, End Differs.',
  },
  {
    id: 'formula_less',
    operator: '<',
    category: 'Operators',
    label: 'Less Than',
    description: 'Yes when the first block is smaller, such as 1 < 2',
    manual:
      'Yes when the first block is smaller than the second. Example: Less Than, Variable $Face.Area, Number 2, End Less Than.',
  },
  {
    id: 'formula_at_most',
    operator: '<=',
    category: 'Operators',
    label: 'At Most',
    description: 'Yes when the first block is smaller or the same',
    manual: 'Yes when the first block is at most the second. Example: At Most, Variable $CY, Number 0, End At Most.',
  },
  {
    id: 'formula_more',
    operator: '>',
    category: 'Operators',
    label: 'More Than',
    description: 'Yes when the first block is bigger, such as 3 > 2',
    manual:
      'Yes when the first block is bigger than the second. Example: More Than, Variable $NY, Number 0.5, End More Than keeps faces that face up.',
  },
  {
    id: 'formula_at_least',
    operator: '>=',
    category: 'Operators',
    label: 'At Least',
    description: 'Yes when the first block is bigger or the same',
    manual:
      'Yes when the first block is at least the second. Example: At Least, Variable $Index, Number 0, End At Least.',
  },
  {
    id: 'formula_plus',
    operator: '+',
    category: 'Operators',
    label: 'Plus',
    description: 'Adds the blocks inside, such as 2 + 3',
    manual: 'Adds its blocks together. Example: Plus, Variable Width, Number 1, End Plus is one more than Width.',
  },
  {
    id: 'formula_minus',
    operator: '-',
    category: 'Operators',
    label: 'Minus',
    description: 'Takes the later blocks off the first, such as 5 - 2',
    manual: 'Takes the second block off the first. Example: Minus, Variable Width, Number 1, End Minus.',
  },
  {
    id: 'formula_times',
    operator: '*',
    category: 'Operators',
    label: 'Times',
    description: 'Multiplies the blocks inside, such as 2 * 3',
    manual: 'Multiplies its blocks. Example: Times, Variable Width, Number 2, End Times is twice Width.',
  },
  {
    id: 'formula_divide',
    operator: '/',
    category: 'Operators',
    label: 'Divided By',
    description: 'Divides the first block by the next, such as 6 / 2',
    manual:
      'Divides the first block by the second. Example: Divided By, Variable Width, Number 2, End Divided By is half Width.',
  },
  {
    id: 'formula_remainder',
    operator: '%',
    category: 'Operators',
    label: 'Remainder',
    description: 'What is left after dividing, such as 7 % 3 is 1',
    manual:
      'What is left when the first block is divided by the second. Example: Remainder, Variable $Index, Number 2, End Remainder is 0 for every other one.',
  },
  {
    id: 'formula_power',
    operator: '^',
    category: 'Operators',
    label: 'Power',
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
    label: 'Negative',
    description: 'The block inside with its sign turned, such as -3',
    manual: 'Turns a number or vector the other way. Example: Negative, Variable Width, End Negative.',
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
    Pick<ConstructorParameters<typeof SolidScriptCommand>[0], 'parameters' | 'nesting' | 'check' | 'listing'>
  > = {},
): SolidScriptCommand {
  return new SolidScriptCommand({
    ...text,
    category,
    parameters: spec.parameters ?? [],
    nesting: spec.nesting ?? 'none',
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
 * @returns Command.
 */
function solidScriptFormulaGroupAdd(
  text: SolidScriptFormulaBlockText,
  category: SolidScriptCommandCategory,
  group: Omit<SolidScriptFormulaGroup, 'id'>,
): SolidScriptCommand {
  SOLID_SCRIPT_FORMULA_GROUPS.set(text.id, { id: text.id, ...group });
  return solidScriptFormulaBlock(text, category, { nesting: 'open' });
}

/**
 * Creates the block of a function, which holds one block per input.
 *
 * @param key Function key, such as abs.
 * @returns Command.
 */
function solidScriptFormulaFunction(key: string): SolidScriptCommand {
  const doc = SOLID_SCRIPT_FUNCTION_DOCS[key];
  const inputs = solidScriptFunctionArguments(key);
  const name = solidScriptFormulaCheckName(key);
  const label = SOLID_SCRIPT_FORMULA_FUNCTION_NAMES[key] ?? name.replace(/([a-z])([A-Z])/g, '$1 $2');
  const summary = doc?.summary ?? label;
  const takes = inputs.map((input) => input.name).join(', ');
  const text = {
    id: `${SOLID_SCRIPT_FORMULA_FUNCTION}${key}`,
    label,
    description: summary.replace(/\.$/, ''),
    manual: `${summary} Put a block inside for each of: ${takes}. Written as ${doc?.usage ?? name}.`,
  };
  const max = inputs.some((input) => input.name === '...') ? Number.POSITIVE_INFINITY : inputs.length;
  return solidScriptFormulaGroupAdd(text, 'Functions', { join: { form: 'call', key }, min: 1, max, sections: 1 });
}

/**
 * Creates every group block: And, Or, Not and If with its Then and Else, the
 * operators and the functions.
 *
 * @returns Commands.
 */
export function solidScriptFormulaGroupCommands(): SolidScriptCommand[] {
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
  const functions = Object.entries(SOLID_SCRIPT_FUNCTION_DOCS)
    .filter(([key, doc]) => doc.group !== 'Checks' && solidScriptFunctionArguments(key).length > 0)
    .map(([key]) => solidScriptFormulaFunction(key));
  return [...joins, ...unary, ...solidScriptFormulaChoose(), ...functions, ...solidScriptFormulaShared()];
}

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
    ...(choose ? [solidScriptFormulaGroupAdd(choose, 'Groups', group)] : []),
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
