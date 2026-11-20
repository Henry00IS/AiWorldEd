import type { SolidScriptCommandEach } from './solid_script_command_each.js';
import type { SolidScriptCommandWord } from './solid_script_command.js';
import { SOLID_SCRIPT_CONDITION_HELPERS } from '@/solid_script/language/solid_script_condition_helpers.js';
import {
  SOLID_SCRIPT_FUNCTION_DOCS,
  solidScriptFunctionArguments,
  solidScriptFunctionInputsLeast,
  type SolidScriptFunctionKinds,
} from '@/solid_script/language/solid_script_function_docs.js';
import { solidScriptFunctionSpelling } from '@/solid_script/language/solid_script_name_key.js';
import type { SolidScriptFormulaInputKind } from '@/solid_script/language/solid_script_formula_field.js';

/**
 * Where the blocks of a formula are used: the element a field is worked out
 * for, and the words a choice field takes, if any.
 */
export interface SolidScriptFormulaContext {
  /** Element the formula is worked out for, such as Face in a Where. */
  each?: SolidScriptCommandEach;
  /**
   * Words the field takes, such as Additive and Subtractive for a Mode, offered
   * by Text blocks.
   */
  words?: readonly SolidScriptCommandWord[];
  /** Functions the script defines, which the formula may call. */
  functions?: readonly SolidScriptFormulaOwnFunction[];
}

/** A Function the script defines, as the names of the script tell it. */
export interface SolidScriptFormulaOwnFunction {
  /** Name, such as Area. */
  readonly name: string;
  /** Names of the values it takes, in order, such as W and D. */
  readonly inputs?: readonly string[];
  /** What it gives back in words, such as Vector or Any. */
  readonly gives?: string;
  /** What it does, from the Note lines right above it. */
  readonly description?: string;
}

/** One input of a check block. */
export interface SolidScriptFormulaInput {
  /** Name of the input in the call, such as point. */
  name: string;
  /** Caption, such as Point. */
  label: string;
  /** What it is for. */
  about: string;
  /** How the input shows what it holds. */
  kind: SolidScriptFormulaInputKind;
  /** True when it may be left off. */
  optional: boolean;
  /** Value it stands for when left off, as typed, such as 30; empty for none. */
  default: string;
  /** Words it takes, when it takes one of a few. */
  choices: readonly string[];
  /**
   * Formula an empty input stands for here, such as [$Face.Center]; empty for
   * none.
   */
  fallback: string;
}

/**
 * Inputs filled with the current element by default, by element, check and
 * input.
 */
const SOLID_SCRIPT_FORMULA_ELEMENT_INPUTS: Readonly<
  Partial<Record<SolidScriptCommandEach, Readonly<Record<string, Readonly<Record<string, string>>>>>>
> = {
  Face: {
    facing: { normal: '[$Face.Normal]' },
    in_box: { point: '[$Face.Center]' },
    near: { point: '[$Face.Center]' },
    has_tag: { tags: '[$Face.Tags]' },
  },
  Edge: {
    facing: { normal: '[$Edge.Direction]' },
    in_box: { point: '[$Edge.Center]' },
    near: { point: '[$Edge.Center]' },
  },
  Vertex: {
    facing: { normal: '[$Vertex.Normal]' },
    in_box: { point: '[$Vertex.Position]' },
    near: { point: '[$Vertex.Position]' },
  },
  Brush: { in_box: { point: '[$Brush.Center]' }, near: { point: '[$Brush.Center]' } },
  Point: {
    facing: { normal: '[$Point.Normal]' },
    in_box: { point: '[$Point.Position]' },
    near: { point: '[$Point.Position]' },
  },
};

/**
 * Returns the formula an empty check input stands for where the formula is
 * worked out per element: the element for an element input, such as [$Face],
 * $Index for every_nth, or the element's own value, such as [$Face.Center].
 *
 * @param context Where the formula is used.
 * @param key Check key, such as in_box.
 * @param name Input name, such as point.
 * @returns Formula, or an empty string when the input has no default here.
 */
export function solidScriptFormulaInputFallback(context: SolidScriptFormulaContext, key: string, name: string): string {
  const each = context.each;
  if (!each) return '';
  const own = SOLID_SCRIPT_FORMULA_ELEMENT_INPUTS[each]?.[key]?.[name];
  if (own) return own;
  if (key === 'every_nth' && name === 'index') return '[$Index]';
  const element = name === 'element' || (key.startsWith('is_') && name === 'value');
  return element ? `[$${each}]` : '';
}

/**
 * Tells how an input of a given kind shows what it holds.
 *
 * @param type Kinds the input takes.
 * @returns Vector, text or any.
 */
function solidScriptFormulaInputKind(type: SolidScriptFunctionKinds): SolidScriptFormulaInputKind {
  if (type === 'Any') return 'any';
  if (type.length === 1 && type[0] === 'Text') return 'text';
  return type.includes('Vector') && !type.some((kind) => kind === 'Brush' || kind === 'List') ? 'vector' : 'any';
}

/**
 * Lists the keys of every check a formula block can be, such as in_box.
 *
 * @returns Keys.
 */
export function solidScriptFormulaCheckKeys(): string[] {
  return Object.entries(SOLID_SCRIPT_FUNCTION_DOCS)
    .filter(([, doc]) => doc.group === 'Checks')
    .map(([key]) => key);
}

/**
 * Returns the name of a check as the docs teach it, such as InBox.
 *
 * @param key Check key, such as in_box.
 * @returns Name.
 */
export function solidScriptFormulaCheckName(key: string): string {
  return /^(\w+)\(/.exec(SOLID_SCRIPT_FUNCTION_DOCS[key]?.usage ?? '')?.[1] ?? solidScriptFunctionSpelling(key);
}

/**
 * Returns the block name of a check, such as In Box or Is Num.
 *
 * @param key Check key.
 * @returns Name.
 */
export function solidScriptFormulaCheckLabel(key: string): string {
  const helper = SOLID_SCRIPT_CONDITION_HELPERS.find((entry) => entry.key === key);
  return helper?.display ?? solidScriptFormulaCheckName(key).replace(/([a-z])([A-Z])/g, '$1 $2');
}

/**
 * Lists the inputs of a check block where the formula is used.
 *
 * @param key Check key.
 * @param context Where the formula is used.
 * @returns Inputs in call order.
 */
export function solidScriptFormulaCheckInputs(
  key: string,
  context: SolidScriptFormulaContext,
): SolidScriptFormulaInput[] {
  const helper = SOLID_SCRIPT_CONDITION_HELPERS.find((entry) => entry.key === key);
  const least = solidScriptFunctionInputsLeast(key);
  return solidScriptFunctionArguments(key).map((argument, index) => {
    const declared = helper?.inputs.find((input) => input.name === argument.name);
    const label = declared?.label ?? argument.name.charAt(0).toUpperCase() + argument.name.slice(1);
    const fallback = declared?.optional ?? argument.default;
    return {
      name: argument.name,
      label,
      about: declared?.about ?? argument.about,
      kind: solidScriptFormulaInputKind(argument.type),
      optional: fallback !== undefined || index >= least,
      default: fallback ?? '',
      choices: argument.choices ?? [],
      fallback: solidScriptFormulaInputFallback(context, key, argument.name),
    };
  });
}
