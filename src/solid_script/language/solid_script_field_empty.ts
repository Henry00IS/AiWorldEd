import type { SolidScriptFieldCompiled } from './solid_script_field.js';

/** What the empty-text check needs to know about a field. */
export interface SolidScriptFieldEmptyRule {
  /** Caption, for the message. */
  readonly label: string;
  /** How the field reads its text. */
  readonly type: string;
  /** Text of a new line, shown as the example. */
  readonly default?: string;
  /** The few words the field takes. */
  readonly words?: readonly { readonly word: string }[];
}

/**
 * Tells whether a field with something typed in it must not come out as empty
 * text: a condition, or a field that takes one of a few words. Fields that hold
 * any value, such as a Set value or a message, keep empty text as a value.
 *
 * @param field Field as its command declares it.
 * @param text Field text, or its default.
 * @returns True when empty text stops the line.
 */
export function solidScriptFieldEmptyChecked(field: SolidScriptFieldEmptyRule, text: string): boolean {
  if (text.trim() === '') return false;
  return field.type === 'condition' || (field.words?.length ?? 0) > 0;
}

/**
 * Builds the message of a field whose text came out as empty text, such as
 * Condition needs Yes or No, such as [I] > 2, not "" (Text).
 *
 * @param field Field as its command declares it.
 * @returns Message.
 */
export function solidScriptFieldEmptyMessage(field: SolidScriptFieldEmptyRule): string {
  if (field.type === 'condition') {
    const example = field.default?.trim() || '[I] > 2';
    return `${field.label} needs Yes or No, such as ${example}, not "" (Text)`;
  }
  return `${field.label} needs ${solidScriptFieldEmptyWords(field)}, not "" (Text)`;
}

/** Most words a message lists before it shows one example instead. */
const SOLID_SCRIPT_FIELD_EMPTY_WORDS_LISTED = 6;

/**
 * Names what a word field takes: its few words, such as Additive, Subtractive
 * or Intersecting, or one example when it takes many.
 *
 * @param field Field as its command declares it.
 * @returns Words, or an example.
 */
function solidScriptFieldEmptyWords(field: SolidScriptFieldEmptyRule): string {
  const words = (field.words ?? []).map((entry) => entry.word);
  if (words.length > SOLID_SCRIPT_FIELD_EMPTY_WORDS_LISTED) return `a value, such as ${field.default || words[0]}`;
  if (words.length === 1) return words[0] ?? '';
  return `${words.slice(0, -1).join(', ')} or ${words[words.length - 1]}`;
}

/**
 * Wraps a field reader so that empty text from something typed stops the line
 * instead of reading as if the field were left empty.
 *
 * @param field Field as its command declares it.
 * @param text Field text, or its default.
 * @param compiled Reader of the field.
 * @returns The reader, checked when the field needs it.
 */
export function solidScriptFieldEmptyGuarded(
  field: SolidScriptFieldEmptyRule,
  text: string,
  compiled: SolidScriptFieldCompiled,
): SolidScriptFieldCompiled {
  if (!solidScriptFieldEmptyChecked(field, text)) return compiled;
  return (context) => {
    const value = compiled(context);
    if (value === '') throw new Error(solidScriptFieldEmptyMessage(field));
    return value;
  };
}
