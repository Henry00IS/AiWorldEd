import type {
  SolidScriptCommandParameter,
  SolidScriptCommandWord,
} from '@/solid_script/commands/solid_script_command.js';
import type { SolidScriptInput } from './solid_script_input.js';
import { solidScriptNameKey } from './solid_script_name_key.js';
import { SOLID_SCRIPT_GROUP_MODE_WORDS, SOLID_SCRIPT_MODE_WORDS } from './solid_script_mode.js';

/** Official words for Script.Usage. */
export const SOLID_SCRIPT_USAGE_WORDS: readonly SolidScriptCommandWord[] = [
  { word: 'Generator', detail: 'This script is used as a generator.' },
  { word: 'Modifier', detail: 'This script is used as a modifier.' },
];

/**
 * Declared choice lists of members, by kind then singular member name. A list
 * member uses the same list as the singular, such as Brushes.Modes.
 */
export const SOLID_SCRIPT_MEMBER_CHOICES: Readonly<
  Record<string, Readonly<Record<string, readonly SolidScriptCommandWord[]>>>
> = {
  Brush: { Mode: SOLID_SCRIPT_MODE_WORDS },
};

/** Declared choice lists of system values, by name without the $. */
export const SOLID_SCRIPT_SYSTEM_CHOICES: Readonly<Record<string, readonly SolidScriptCommandWord[]>> = {
  'Script.Usage': SOLID_SCRIPT_USAGE_WORDS,
  'Script.Mode': SOLID_SCRIPT_GROUP_MODE_WORDS,
};

/**
 * Finds the declared choice words of a member of a kind, such as Brush.Mode.
 *
 * @param kind Kind, such as Brush or Brush List.
 * @param member Member as written, singular or plural.
 * @returns Words, or undefined when that member is not a declared choice.
 */
export function solidScriptChoiceWordsOfMember(
  kind: string,
  member: string,
): readonly SolidScriptCommandWord[] | undefined {
  const item = kind.endsWith(' List') ? kind.slice(0, -' List'.length) : kind;
  const lists = SOLID_SCRIPT_MEMBER_CHOICES[item];
  if (!lists) return undefined;
  const key = solidScriptNameKey(member);
  for (const [singular, words] of Object.entries(lists)) {
    if (solidScriptNameKey(singular) === key) return words;
    if (solidScriptNameKey(`${singular}s`) === key || key === `${solidScriptNameKey(singular)}s`) return words;
  }
  if (key === 'mode' || key === 'modes') return lists['Mode'];
  return undefined;
}

/**
 * Finds the declared choice words of a system value, such as $Script.Usage.
 *
 * @param name Name as written, with or without $.
 * @returns Words, or undefined when that value is not a declared choice.
 */
export function solidScriptChoiceWordsOfSystem(name: string): readonly SolidScriptCommandWord[] | undefined {
  const key = name
    .trim()
    .replace(/^\$/, '')
    .replace(/^\[(.*)\]$/s, '$1')
    .trim()
    .toLowerCase();
  for (const [listed, words] of Object.entries(SOLID_SCRIPT_SYSTEM_CHOICES)) {
    if (listed.toLowerCase() === key) return words;
  }
  return undefined;
}

/**
 * Finds the declared choice words of a Choice input of the script.
 *
 * @param name Name as written, with or without brackets.
 * @param inputs Input lines of the script.
 * @returns Words, or undefined when the name is not a Choice input.
 */
export function solidScriptChoiceWordsOfInput(
  name: string,
  inputs: readonly SolidScriptInput[],
): readonly SolidScriptCommandWord[] | undefined {
  const key = solidScriptNameKey(
    name
      .trim()
      .replace(/^\$/, '')
      .replace(/^\[(.*)\]$/s, '$1')
      .trim(),
  );
  const input = inputs.find((entry) => entry.type === 'Choice' && solidScriptNameKey(entry.name) === key);
  if (!input) return undefined;
  return input.choices.map((word) => ({ word, detail: `A listed choice of ${input.name}.` }));
}

/**
 * Finds the declared choice words a Set Variable or a name in a condition
 * writes or reads, from member lists, system values and Choice inputs.
 *
 * @param name Name as written, such as Brush.Mode, $Script.Usage or Style.
 * @param inputs Input lines of the script.
 * @returns Words, or an empty list when the name is not a known choice.
 */
export function solidScriptChoiceWordsForTarget(
  name: string,
  inputs: readonly SolidScriptInput[] = [],
): readonly SolidScriptCommandWord[] {
  const text = name
    .trim()
    .replace(/^\[(.*)\]$/s, '$1')
    .trim();
  if (text === '') return [];
  const system = solidScriptChoiceWordsOfSystem(text);
  if (system) return system;
  const input = solidScriptChoiceWordsOfInput(text, inputs);
  if (input) return input;
  const parts = text.replace(/^\$/, '').split('.');
  const member = parts[parts.length - 1] ?? '';
  if (parts.length < 2) return [];
  return solidScriptChoiceWordsOfMember(solidScriptChoiceOwnerKind(parts), member) ?? [];
}

/**
 * Tells the kind the last member of a path is read from, such as Brush for
 * Box.Mode, $Selected.Brushes.Modes or $Input.Brushes.Modes.
 *
 * @param parts Name parts without brackets, $ already stripped from the first.
 * @returns Kind of the owner of the last member.
 */
function solidScriptChoiceOwnerKind(parts: readonly string[]): string {
  const owner = parts[parts.length - 2]?.toLowerCase() ?? '';
  if (owner === 'brushes' || owner === 'brush') return owner === 'brushes' ? 'Brush List' : 'Brush';
  if (parts[0]?.toLowerCase() === 'selected' && owner === 'brushes') return 'Brush List';
  if (parts[0]?.toLowerCase() === 'input' && owner === 'brushes') return 'Brush List';
  return 'Brush';
}

/**
 * Lists the declared choice words a field should offer: its own words, else the
 * target of a Set, else the choice-typed names already written in the field,
 * such as [$Script.Usage] in an If condition.
 *
 * @param parameter Field.
 * @param values Stored or current values of the line.
 * @param text Field text, for names already written in it.
 * @param inputs Input lines of the script.
 * @returns Words, maybe empty.
 */
export function solidScriptChoiceWordsForField(
  parameter: SolidScriptCommandParameter,
  values: Readonly<Record<string, string>>,
  text: string,
  inputs: readonly SolidScriptInput[] = [],
): readonly SolidScriptCommandWord[] {
  if (parameter.words && parameter.words.length > 0) return parameter.words;
  if (parameter.key === 'value' && values['name'] !== undefined)
    return solidScriptChoiceWordsForTarget(values['name'] ?? '', inputs);
  return solidScriptChoiceWordsFromText(text, inputs);
}

/**
 * Collects declared choice words of every name written in a field, so an If or
 * Where condition can offer the words of [$Script.Usage] or [Brush.Mode].
 *
 * @param text Field text.
 * @param inputs Input lines of the script.
 * @returns Words, each name once.
 */
export function solidScriptChoiceWordsFromText(
  text: string,
  inputs: readonly SolidScriptInput[] = [],
): readonly SolidScriptCommandWord[] {
  const words = new Map<string, SolidScriptCommandWord>();
  for (const match of text.matchAll(/\[(\$?[A-Za-z_][\w.$]*)\]/g)) {
    for (const word of solidScriptChoiceWordsForTarget(match[1] ?? '', inputs)) {
      if (!words.has(word.word.toLowerCase())) words.set(word.word.toLowerCase(), word);
    }
  }
  return [...words.values()];
}

/**
 * Explains a typable word that is not in a declared choice list. Empty text,
 * names and formulas are left alone.
 *
 * @param text Field text as written.
 * @param words Declared choice words.
 * @returns Warning, or an empty string when the text is fine or not typable as
 *   one word.
 */
export function solidScriptChoiceWordProblem(text: string, words: readonly SolidScriptCommandWord[]): string {
  const written = text.trim();
  if (words.length === 0 || written === '' || written.includes('[') || written.includes('=')) return '';
  if (words.some((entry) => entry.word.toLowerCase() === written.toLowerCase())) return '';
  const listed = words.map((entry) => entry.word);
  const last = listed[listed.length - 1];
  const head = listed.slice(0, -1).join(', ');
  const allowed = head === '' ? (last ?? '') : `${head} or ${last}`;
  return `must be ${allowed}, not "${written}"`;
}

/**
 * Finds typable words compared to a choice-typed name that are not in its list,
 * such as [$Script.Usage] == "World".
 *
 * @param text Field text.
 * @param inputs Input lines of the script.
 * @returns Warnings.
 */
export function solidScriptChoiceLiteralProblems(text: string, inputs: readonly SolidScriptInput[] = []): string[] {
  const problems: string[] = [];
  const pattern = /\[(\$?[A-Za-z_][\w.$]*)\]\s*==\s*(?:"([^"]*)"|'([^']*)'|([A-Za-z][A-Za-z0-9-]*))/g;
  for (const match of text.matchAll(pattern)) {
    const words = solidScriptChoiceWordsForTarget(match[1] ?? '', inputs);
    const literal = match[2] ?? match[3] ?? match[4] ?? '';
    const problem = solidScriptChoiceWordProblem(literal, words);
    if (problem) problems.push(`[${match[1]}] ${problem}`);
  }
  return problems;
}
