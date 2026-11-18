import type { SolidScriptValue } from './solid_script_value.js';

/** Kinds of value a script input takes, as the inspector edits them. */
export const SOLID_SCRIPT_INPUT_TYPES = [
  'Number',
  'Count',
  'Switch',
  'Text',
  'Choice',
  'Button',
  'Curve',
  'Texture',
  'Vector',
] as const;

/**
 * What each kind of input shows in the inspector, beside it while Type is
 * typed.
 */
export const SOLID_SCRIPT_INPUT_TYPE_DETAILS: Readonly<Record<SolidScriptInputType, string>> = {
  Number: 'A number field',
  Count: 'A whole number field',
  Switch: 'A Yes/No switch',
  Text: 'A text field',
  Choice: 'A dropdown of Choices',
  Button: 'A button that runs the script',
  Curve: 'A curve editor',
  Texture: 'A texture picker',
  Vector: 'An X, Y, Z field',
};

/**
 * Kind of value each kind of input holds, as the editor checks name kinds; none
 * where only running tells.
 */
export const SOLID_SCRIPT_INPUT_KINDS: Readonly<Record<SolidScriptInputType, string | undefined>> = {
  Number: 'Number',
  Count: 'Number',
  Switch: 'Yes/No',
  Text: 'Text',
  Choice: 'Text',
  Button: 'Yes/No',
  Curve: 'Text',
  Texture: 'Text',
  Vector: 'Vector',
};

/** Id of the Input command. */
export const SOLID_SCRIPT_COMMAND_INPUT = 'input';

/** Id of the Input Group command, which shows inputs under a heading. */
export const SOLID_SCRIPT_COMMAND_INPUT_GROUP = 'input_group';

/** Id of the Input Note command, which shows text among the inputs. */
export const SOLID_SCRIPT_COMMAND_INPUT_NOTE = 'input_note';

/** Id of the Input Row command, which puts inputs side by side. */
export const SOLID_SCRIPT_COMMAND_INPUT_ROW = 'input_row';

/**
 * Id of the Show Inputs When command, which hides inputs unless another has a
 * value.
 */
export const SOLID_SCRIPT_COMMAND_SHOW_INPUTS_WHEN = 'show_inputs_when';

/** Defaults of an Input line's fields, shared by the command and the inspector. */
export const SOLID_SCRIPT_INPUT_DEFAULTS = { name: 'width', type: 'Number', default: '1' } as const;

/** Kind of value a script input takes. */
export type SolidScriptInputType = (typeof SOLID_SCRIPT_INPUT_TYPES)[number];

/** One Input line of a script, read without running it. */
export interface SolidScriptInput {
  /** Variable name. */
  name: string;
  /** Caption in the inspector. */
  label: string;
  /** Kind of value. */
  type: SolidScriptInputType;
  /** Value as typed when the inspector sets none. */
  fallback: string;
  /** Smallest number, or null for none. */
  min: number | null;
  /** Largest number, or null for none. */
  max: number | null;
  /** Values a choice offers. */
  choices: string[];
  /** Hover text in the inspector, or empty for the default. */
  tooltip: string;
}

/** Stored text of an Input line's fields, by field key. */
type SolidScriptInputValues = Readonly<Record<string, string | undefined>>;

/**
 * Reads an Input line's fields; a mistake names the field.
 *
 * @param values Field text by key.
 * @returns Input.
 */
export function solidScriptInputRead(values: SolidScriptInputValues): SolidScriptInput {
  const type = (values['type'] ?? SOLID_SCRIPT_INPUT_DEFAULTS.type).trim();
  if (!SOLID_SCRIPT_INPUT_TYPES.includes(type as SolidScriptInputType))
    throw new Error(`Type must be one of ${SOLID_SCRIPT_INPUT_TYPES.join(', ')}, not "${type}"`);
  const limit = (key: 'min' | 'max', label: string): number | null => {
    const text = (values[key] ?? '').trim();
    if (text === '') return null;
    const number = Number(text);
    if (!Number.isFinite(number)) throw new Error(`${label} must be a number or empty, not "${text}"`);
    return number;
  };
  const name = (values['name'] ?? SOLID_SCRIPT_INPUT_DEFAULTS.name).trim();
  const label = (values['label'] ?? '').trim();
  const min = limit('min', 'Minimum');
  const max = limit('max', 'Maximum');
  if (min !== null && max !== null && min > max) throw new Error(`Minimum ${min} is above Maximum ${max}`);
  const choices = (values['choices'] ?? '')
    .split(',')
    .map((choice) => choice.trim())
    .filter((choice) => choice !== '');
  if (type === 'Choice' && choices.length === 0)
    throw new Error('a choice input needs Choices, such as "small, large"');
  return {
    name,
    label: label || name,
    type: type as SolidScriptInputType,
    fallback: values['default'] ?? SOLID_SCRIPT_INPUT_DEFAULTS.default,
    min,
    max,
    choices,
    tooltip: (values['tooltip'] ?? '').trim(),
  };
}

/**
 * Reads the value of an input from text: the inspector value, or else the
 * line's default.
 *
 * @param input Input.
 * @param text Value as typed.
 * @returns Value the variable gets.
 */
export function solidScriptInputValue(input: SolidScriptInput, text: string): SolidScriptValue {
  const trimmed = text.trim();
  if (input.type === 'Text' || input.type === 'Curve' || input.type === 'Texture') return text;
  // A button has no value; When Button Pressed answers it.
  if (input.type === 'Button') return false;
  if (input.type === 'Switch') {
    const lower = trimmed.toLowerCase();
    if (['true', 'yes', '1'].includes(lower)) return true;
    if (['false', 'no', '0'].includes(lower)) return false;
    throw new Error(`input "${input.name}" must be Yes or No, not "${text}"`);
  }
  if (input.type === 'Choice') {
    if (!input.choices.includes(trimmed))
      throw new Error(`input "${input.name}" must be one of ${input.choices.join(', ')}, not "${text}"`);
    return trimmed;
  }
  if (input.type === 'Vector') return solidScriptInputVector(input, text);
  return solidScriptInputNumber(input, trimmed);
}

/**
 * Reads a vector input: three numbers with commas, each inside the limits.
 *
 * @param input Vector input.
 * @param text Value as typed.
 * @returns X, Y and Z.
 */
function solidScriptInputVector(input: SolidScriptInput, text: string): number[] {
  const parts = text.split(',').map((part) => part.trim());
  if (parts.length !== 3 || parts.some((part) => part === '' || !Number.isFinite(Number(part))))
    throw new Error(`input "${input.name}" must be three numbers with commas, such as 1, 2, 3, not "${text}"`);
  return parts.map((part) => solidScriptInputNumber(input, part));
}

/**
 * Reads one number of an input and checks its limits.
 *
 * @param input Number, count or vector input.
 * @param trimmed Number as typed, trimmed.
 * @returns Number.
 */
function solidScriptInputNumber(input: SolidScriptInput, trimmed: string): number {
  const number = Number(trimmed);
  if (trimmed === '' || !Number.isFinite(number))
    throw new Error(`input "${input.name}" must be a number, not "${trimmed}"`);
  if (input.type === 'Count' && !Number.isInteger(number))
    throw new Error(`input "${input.name}" must be a whole number, not ${number}`);
  if ((input.min !== null && number < input.min) || (input.max !== null && number > input.max))
    throw new Error(`input "${input.name}" must be from ${input.min ?? 'any'} to ${input.max ?? 'any'}, not ${number}`);
  return number;
}

/**
 * Lists the Input lines of a script in line order, for the inspector. Lines
 * whose fields cannot be read are left out; they show their error when the
 * script runs.
 *
 * @param blocks Script lines.
 * @returns Inputs, one per name.
 */
export function solidScriptInputsList(
  blocks: readonly { command: string; values: SolidScriptInputValues }[],
): SolidScriptInput[] {
  const inputs: SolidScriptInput[] = [];
  for (const block of blocks) {
    if (block.command !== SOLID_SCRIPT_COMMAND_INPUT) continue;
    try {
      const input = solidScriptInputRead(block.values);
      if (input.name !== '' && !inputs.some((known) => known.name === input.name)) inputs.push(input);
    } catch {
      continue;
    }
  }
  return inputs;
}

/** Friendly type of each Input type, as the variable explorer and help show it. */
const SOLID_SCRIPT_INPUT_TYPE_LABELS: Readonly<Record<string, string>> = {
  Number: 'Number',
  Count: 'Whole Number',
  Switch: 'Yes/No',
  Text: 'Text',
  Choice: 'Text (Choice)',
  Button: 'Button',
  Curve: 'Curve',
  Texture: 'Texture',
};

/**
 * Names the value an Input type holds in plain words, such as Whole Number for
 * Count.
 *
 * @param type Input type as typed.
 * @returns Friendly type.
 */
export function solidScriptInputTypeLabel(type: string): string {
  return SOLID_SCRIPT_INPUT_TYPE_LABELS[type.trim() || 'Number'] ?? 'Number';
}
