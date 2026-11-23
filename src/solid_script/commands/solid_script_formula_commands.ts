import './solid_script_command_catalog.js';
import type {
  SolidScriptCommand,
  SolidScriptCommandWord,
  SolidScriptCommandCategory,
  SolidScriptCommandParameter,
  SolidScriptCommandValues,
} from './solid_script_command.js';
import { SolidScriptCommandCatalog } from './solid_script_command_catalog_base.js';
import { solidScriptParameter } from './solid_script_command_parameters.js';
import {
  solidScriptFormulaCheckInputs,
  solidScriptFormulaCheckKeys,
  solidScriptFormulaCheckLabel,
  type SolidScriptFormulaContext,
  type SolidScriptFormulaInput,
} from './solid_script_formula_inputs.js';
import {
  SOLID_SCRIPT_FORMULA_COMMAND,
  solidScriptFormulaBlock,
  solidScriptFormulaGroupCommands,
  solidScriptFormulaOwn,
  type SolidScriptFormulaBlockText,
} from './solid_script_formula_groups.js';
import {
  SOLID_SCRIPT_FUNCTION_DOCS,
  SOLID_SCRIPT_FUNCTION_GROUPS,
} from '@/solid_script/language/solid_script_function_docs.js';
import { type SolidScriptListingPart, type SolidScriptListingValues } from './solid_script_command_listing.js';
import {
  solidScriptFormulaIsName,
  solidScriptFormulaTextBlock,
  solidScriptFormulaTyped,
  type SolidScriptFormulaInputKind,
} from '@/solid_script/language/solid_script_formula_field.js';
import { solidScriptFormulaProblem } from '@/solid_script/language/solid_script_formula_bare.js';
import { solidScriptWhereHelper } from '@/solid_script/language/solid_script_where_helpers.js';
import { solidScriptFunctionGroups } from '@/solid_script/language/solid_script_function_doc_groups.js';

export { SOLID_SCRIPT_FORMULA_COMMAND, SOLID_SCRIPT_FORMULA_FUNCTION } from './solid_script_formula_groups.js';

/**
 * Start of the id of a check block, followed by its key, such as
 * formula_check_in_box.
 */
export const SOLID_SCRIPT_FORMULA_CHECK = 'formula_check_';

/**
 * Palette groups of the formula editor, in palette order: the Where helpers
 * first, right under Favorites.
 */
export const SOLID_SCRIPT_FORMULA_CATEGORIES: readonly SolidScriptCommandCategory[] = [
  'Where',
  'Values',
  'Groups',
  'Operators',
  'Checks',
  ...SOLID_SCRIPT_FUNCTION_GROUPS.filter((group) => group !== 'Checks'),
];

/**
 * Checks the typed fields of a block: each must be one formula.
 *
 * @param fields Field key, caption and how its text becomes a formula.
 * @param values Typed values.
 * @returns Problem, or an empty string.
 */
function solidScriptFormulaFieldsProblem(
  fields: readonly { key: string; label: string; formula: (text: string) => string }[],
  values: SolidScriptCommandValues,
): string {
  for (const field of fields) {
    const text = values[field.key] ?? '';
    if (text.trim() === '') continue;
    const problem = solidScriptFormulaProblem(field.formula(text));
    if (problem) return `${field.label}: ${problem}.`;
  }
  return '';
}

/**
 * The blocks that hold a value: what each shows and how its text becomes a
 * formula.
 */
export const SOLID_SCRIPT_FORMULA_LEAVES: readonly (SolidScriptFormulaBlockText & {
  kind: SolidScriptFormulaInputKind;
  hint: string;
})[] = [
  {
    id: SOLID_SCRIPT_FORMULA_COMMAND.number,
    kind: 'any',
    label: 'Number',
    description: 'A number, such as 2 or 0.5',
    manual: 'A number. Type 5, 2, 7 and it becomes a Vector. Example: Number 0.5.',
    hint: 'A number, such as 2 or 0.5.',
  },
  {
    id: SOLID_SCRIPT_FORMULA_COMMAND.vector,
    kind: 'vector',
    label: 'Vector',
    description: 'Three numbers, such as 0, 1, 0 for up',
    manual: 'A direction or point of three numbers, X, Y and Z. Example: Vector 0, 1, 0 points up.',
    hint: 'X, Y and Z separated by commas, such as 0, 1, 0.',
  },
  {
    id: SOLID_SCRIPT_FORMULA_COMMAND.text,
    kind: 'text',
    label: 'Text',
    description: 'Words, kept exactly as typed, such as Top',
    manual:
      'Words, kept exactly as typed, spaces, brackets and dollar signs too, such as a tag name. Example: Text Top.',
    hint: 'Words, kept exactly as you type them, such as Top. The $ signs the field needs are added for you: $ and a space keep a space at the start or end, $$ is a dollar sign, $[ and $] are brackets, $, is a comma.',
  },
  {
    id: SOLID_SCRIPT_FORMULA_COMMAND.variable,
    kind: 'variable',
    label: 'Variable',
    description: 'A value the script or the element holds, such as $Face.Area',
    manual:
      'What a variable holds, or a value of the element, such as $Face.Center or $Index. Example: Variable Width.',
    hint: 'A name, such as Width or $Face.Center.',
  },
  {
    id: SOLID_SCRIPT_FORMULA_COMMAND.value,
    kind: 'any',
    label: 'Expression',
    description: 'Any formula as typed, such as [$NY] > 0.5',
    manual: 'Holds a formula as typed, for anything else. Example: Expression [$Face.Area] * 2 > [Limit].',
    hint: 'A formula, such as [$NY] > 0.5 or [Width] * 2.',
  },
];

/**
 * Lists the value of a value block the way the script lists values: a variable
 * name in square brackets, anything else in single quotes, the words of a Text
 * block with the spaces at their ends.
 *
 * @param kind What the block holds.
 * @param read Values of the line.
 * @returns Listing piece.
 */
function solidScriptFormulaLeafListing(
  kind: SolidScriptFormulaInputKind,
  read: SolidScriptListingValues,
): SolidScriptListingPart {
  if (kind === 'text') return { kind: 'value', text: `'${read.raw('value')}'` };
  const name = kind === 'variable' && solidScriptFormulaIsName(read.text('value'));
  return name ? read.variable('value') : read.value('value');
}

/**
 * Creates the value blocks: Number, Vector, Text, Variable and Expression, each
 * holding one value typed in its window; Text offers the words of a choice
 * field and warns about others.
 *
 * @param words Words the field takes, or none.
 * @returns Commands.
 */
function solidScriptFormulaValues(words: readonly SolidScriptCommandWord[] = []): SolidScriptCommand[] {
  return SOLID_SCRIPT_FORMULA_LEAVES.map((leaf) => {
    const field = solidScriptParameter('value', leaf.label, leaf.kind === 'text' ? 'text' : 'value', '', leaf.hint);
    const text = leaf.kind === 'text';
    const offered = text ? { spaces: true, verbatim: true, ...(words.length > 0 ? { words } : {}) } : {};
    const formula = text ? solidScriptFormulaTextBlock : (typed: string) => solidScriptFormulaTyped(leaf.kind, typed);
    const fields = [{ key: 'value', label: leaf.label, formula }];
    return solidScriptFormulaBlock(leaf, 'Values', {
      parameters: [{ ...field, ...offered, ...(leaf.kind === 'variable' ? { reference: true } : {}) }],
      check: (values) => solidScriptFormulaFieldsProblem(fields, values),
      listing: (read) => [leaf.label, ' ', solidScriptFormulaLeafListing(leaf.kind, read)],
    });
  });
}

/** Numbers in brackets, such as [0, 1, 0], as a formula writes a vector. */
const SOLID_SCRIPT_FORMULA_BRACKET_NUMBERS = /\[(-?[\d.]+(?:, -?[\d.]+){1,2})\]/g;

/**
 * The hint of one check input field, its examples in the form the field takes
 * as typed: 0, 1, 0 where the docs of the formula write [0, 1, 0].
 *
 * @param input Input.
 * @returns Hint.
 */
function solidScriptFormulaCheckHint(input: SolidScriptFormulaInput): string {
  if (input.kind === 'text' || input.kind === 'variable') return input.about;
  return input.about.replace(SOLID_SCRIPT_FORMULA_BRACKET_NUMBERS, '$1');
}

/**
 * Describes the field of one check input: an input with a default, or filled in
 * with the element here, shows it greyed and may stay empty, and so does one
 * with a start value, such as 0 and 1 for Min and Max of Random, like the
 * defaults of every other field; one that takes a few words offers them.
 *
 * @param input Input.
 * @returns Field.
 */
function solidScriptFormulaCheckField(input: SolidScriptFormulaInput): SolidScriptCommandParameter {
  const type = input.kind === 'text' ? 'text' : 'value';
  const field = solidScriptParameter(input.name, input.label, type, input.start, solidScriptFormulaCheckHint(input));
  const optional = input.optional || input.fallback !== '';
  const placeholder = input.fallback || input.default;
  const words = input.choices.map((word) => ({ word, detail: `${input.label}.` }));
  return {
    ...field,
    ...(optional ? { optional } : {}),
    ...(placeholder ? { placeholder } : {}),
    ...(words.length > 0 ? { words } : {}),
    ...(input.kind === 'variable' ? { reference: true } : {}),
  };
}

/**
 * Checks the inputs of a check block: each a formula, and none left off before
 * one that is given.
 *
 * @param inputs Inputs.
 * @param values Typed values.
 * @returns Problem, or an empty string.
 */
function solidScriptFormulaCheckProblem(
  inputs: readonly SolidScriptFormulaInput[],
  values: SolidScriptCommandValues,
): string {
  const given = inputs.map(
    (input) => (values[input.name] ?? '').trim() !== '' || input.fallback !== '' || input.start !== '',
  );
  const gap = inputs.findIndex((_input, index) => !given[index] && given.slice(index + 1).includes(true));
  if (gap >= 0) return `${inputs[gap]?.label} needs a value when a later input has one.`;
  const fields = inputs.map((input) => ({
    key: input.name,
    label: input.label,
    formula: (text: string) => solidScriptFormulaTyped(input.kind, text),
  }));
  return solidScriptFormulaFieldsProblem(fields, values);
}

/**
 * Creates the block of one check or Where helper, such as In Box, with a field
 * per input; Where helpers go in the Where group, and a check is also listed in
 * the other groups of its function, such as IsDictionary under Dictionary.
 *
 * @param key Check key, such as in_box.
 * @param context Where the formula is used.
 * @returns Command.
 */
function solidScriptFormulaCheck(key: string, context: SolidScriptFormulaContext): SolidScriptCommand {
  const inputs = solidScriptFormulaCheckInputs(key, context);
  const label = solidScriptFormulaCheckLabel(key);
  const summary = SOLID_SCRIPT_FUNCTION_DOCS[key]?.summary ?? label;
  const alsoIn = solidScriptFunctionGroups(key).slice(1);
  const id = `${SOLID_SCRIPT_FORMULA_CHECK}${key}`;
  return solidScriptFormulaBlock(
    { id, label, description: summary.replace(/\.$/, ''), manual: summary, ...(alsoIn.length > 0 ? { alsoIn } : {}) },
    solidScriptWhereHelper(key) ? 'Where' : 'Checks',
    {
      parameters: inputs.map(solidScriptFormulaCheckField),
      check: (values) => solidScriptFormulaCheckProblem(inputs, values),
      listing: (read) => [
        label,
        ...inputs.flatMap((input) =>
          read.text(input.name).trim() === '' ? [] : [` ${input.label} `, read.value(input.name)],
        ),
      ],
    },
  );
}

/**
 * Formula catalogs made so far, by the element they are for and the words they
 * offer.
 */
const SOLID_SCRIPT_FORMULA_CATALOGS = new Map<string, SolidScriptCommandCatalog>();

/**
 * Returns the blocks of a formula where it is used: an element field fills in
 * its element by default, and each Function of the script has its block among
 * the functions.
 *
 * @param context Where the formula is used.
 * @returns Catalog.
 */
export function solidScriptFormulaCatalog(context: SolidScriptFormulaContext = {}): SolidScriptCommandCatalog {
  const own = (context.functions ?? []).map(solidScriptFormulaOwn);
  const functions = (context.functions ?? []).map((entry) =>
    JSON.stringify([entry.name, entry.inputs, entry.gives, entry.description]),
  );
  const key = [context.each ?? '', ...(context.words ?? []).map((entry) => entry.word), ...functions].join('|');
  const known = SOLID_SCRIPT_FORMULA_CATALOGS.get(key);
  if (known) return known;
  const checks = solidScriptFormulaCheckKeys().map((check) => solidScriptFormulaCheck(check, context));
  const groups = solidScriptFormulaGroupCommands();
  const commands = [...solidScriptFormulaValues(context.words), ...groups, ...own, ...checks];
  const catalog = new SolidScriptCommandCatalog('formula', SOLID_SCRIPT_FORMULA_CATEGORIES, commands, [
    SOLID_SCRIPT_FORMULA_COMMAND.and,
    SOLID_SCRIPT_FORMULA_COMMAND.number,
    SOLID_SCRIPT_FORMULA_COMMAND.variable,
  ]);
  SOLID_SCRIPT_FORMULA_CATALOGS.set(key, catalog);
  return catalog;
}
