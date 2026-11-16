import type { SolidScriptValue } from './solid_script_value.js';

/** Kinds of value a script input takes, as the inspector edits them. */
export const SOLID_SCRIPT_INPUT_TYPES = [
  'number',
  'count',
  'switch',
  'text',
  'choice',
  'button',
  'curve',
  'texture',
] as const;

/** Id of the Input command. */
export const SOLID_SCRIPT_COMMAND_INPUT = 'input';

/** Defaults of an Input line's fields, shared by the command and the inspector. */
export const SOLID_SCRIPT_INPUT_DEFAULTS = { name: 'width', type: 'number', default: '1' } as const;

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
  if (type === 'choice' && choices.length === 0)
    throw new Error('a choice input needs Choices, such as "small, large"');
  return {
    name,
    label: label || name,
    type: type as SolidScriptInputType,
    fallback: values['default'] ?? SOLID_SCRIPT_INPUT_DEFAULTS.default,
    min,
    max,
    choices,
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
  if (input.type === 'text' || input.type === 'curve' || input.type === 'texture') return text;
  // A button has no value; When Button Pressed answers it.
  if (input.type === 'button') return false;
  if (input.type === 'switch') {
    const lower = trimmed.toLowerCase();
    if (['true', 'yes', '1'].includes(lower)) return true;
    if (['false', 'no', '0'].includes(lower)) return false;
    throw new Error(`input "${input.name}" must be Yes or No, not "${text}"`);
  }
  if (input.type === 'choice') {
    if (!input.choices.includes(trimmed))
      throw new Error(`input "${input.name}" must be one of ${input.choices.join(', ')}, not "${text}"`);
    return trimmed;
  }
  const number = Number(trimmed);
  if (trimmed === '' || !Number.isFinite(number))
    throw new Error(`input "${input.name}" must be a number, not "${text}"`);
  if (input.type === 'count' && !Number.isInteger(number))
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
  number: 'Number',
  count: 'Whole Number',
  switch: 'Yes/No',
  text: 'Text',
  choice: 'Text (Choice)',
  button: 'Button',
  curve: 'Curve',
  texture: 'Texture',
};

/**
 * Names the value an Input type holds in plain words, such as Whole Number for
 * count.
 *
 * @param type Input type as typed.
 * @returns Friendly type.
 */
export function solidScriptInputTypeLabel(type: string): string {
  return SOLID_SCRIPT_INPUT_TYPE_LABELS[type.trim() || 'number'] ?? 'Number';
}
