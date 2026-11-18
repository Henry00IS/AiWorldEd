import { solidScriptFieldArguments, type SolidScriptFieldKind } from './solid_script_field.js';
import { SOLID_SCRIPT_SYSTEM_VALUES } from './solid_script_name_rules.js';
import { solidScriptSystemFill } from './solid_script_system_names.js';
import { solidScriptNameKey } from './solid_script_name_key.js';

/**
 * Fields that take numbers, where math outside a formula is surely a mistake.
 * Conditions are worked out like formulas already, so they are not here.
 */
export const SOLID_SCRIPT_MISTAKE_NUMERIC: ReadonlySet<SolidScriptFieldKind> = new Set([
  'number',
  'count',
  'vector2',
  'vector3',
  'points2',
  'points3',
]);

/** Fields whose text is a name, never read as a value. */
export const SOLID_SCRIPT_MISTAKE_NAMES: ReadonlySet<SolidScriptFieldKind> = new Set(['name', 'target', 'text']);

/** System values by group and member, folded, such as box.width. */
const SOLID_SCRIPT_MISTAKE_SYSTEM: ReadonlySet<string> = new Set(
  Object.entries(SOLID_SCRIPT_SYSTEM_VALUES).flatMap(([group, members]) =>
    members.map((member) => `${group}.${member}`.toLowerCase()),
  ),
);

/** A name in a formula, maybe dotted or a system value. */
const SOLID_SCRIPT_MISTAKE_NAME = /\$?[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*/g;

/** Characters that make math in a formula. */
const SOLID_SCRIPT_MISTAKE_OPERATORS = '+-*/%^<>';

/**
 * Tells whether text has a math operator outside square and round brackets.
 *
 * @param text Text.
 * @returns True when it does.
 */
function solidScriptMistakeHasMath(text: string): boolean {
  let depth = 0;
  for (const character of text) {
    if (character === '[' || character === '(') depth++;
    else if (character === ']' || character === ')') depth--;
    else if (depth === 0 && SOLID_SCRIPT_MISTAKE_OPERATORS.includes(character)) return true;
  }
  return false;
}

/**
 * Writes the names in plain math as [Name], leaving function names and numbers
 * such as 1e3 alone: K*2 becomes [K]*2.
 *
 * @param math Math without brackets around names.
 * @returns Math for a formula.
 */
function solidScriptMistakeNamesBracket(math: string): string {
  return math.replace(SOLID_SCRIPT_MISTAKE_NAME, (name: string, at: number) => {
    const before = math[at - 1] ?? '';
    if (/[\d.]/.test(before) || /^\s*\(/.test(math.slice(at + name.length))) return name;
    return `[${name}]`;
  });
}

/**
 * Reads what is inside a piece that is one pair of square brackets, such as K_2
 * in [K_2], but not in [A]+[B].
 *
 * @param piece Piece, trimmed.
 * @returns Text inside, or null.
 */
function solidScriptMistakeInside(piece: string): string | null {
  if (!piece.startsWith('[') || piece.startsWith('[=') || !piece.endsWith(']')) return null;
  let depth = 0;
  for (let index = 0; index < piece.length; index++) {
    if (piece[index] === '[') depth++;
    else if (piece[index] === ']' && --depth === 0) return index === piece.length - 1 ? piece.slice(1, -1) : null;
  }
  return null;
}

/**
 * Rewrites one comma-separated piece: math outside a formula goes into one.
 *
 * @param piece Piece, trimmed.
 * @returns Rewritten piece, the same when nothing is wrong.
 */
function solidScriptMistakeMath(piece: string): string {
  if (piece.startsWith('[=')) return piece;
  if (piece.startsWith('=') && piece.includes('[')) return `[${piece}]`;
  const whole = solidScriptMistakeInside(piece);
  if (whole !== null && solidScriptMistakeHasMath(whole))
    return `[=${whole.includes('[') ? whole : solidScriptMistakeNamesBracket(whole)}]`;
  if (piece.includes('[') && solidScriptMistakeHasMath(piece)) return `[=${piece}]`;
  return piece;
}

/**
 * Gives the official $ spelling a system value written without it should use,
 * such as $Box.Width for Box.Width or $NZ for Nz, keeping any members after
 * it.
 *
 * @param name Name as written, without a leading $.
 * @returns Official spelling, or undefined when it is not a system value.
 */
function solidScriptMistakeOfficial(name: string): string | undefined {
  if (name.startsWith('$') || name === '') return undefined;
  if (solidScriptNameKey(name) === 'pi') return '$Math.Pi';
  const fill = solidScriptSystemFill(name);
  if (fill) return fill.name;
  const parts = name.split('.');
  const head = parts.length >= 2 ? `${parts[0]}.${parts[1]}`.toLowerCase() : '';
  return head && SOLID_SCRIPT_MISTAKE_SYSTEM.has(head) ? `$${name}` : undefined;
}

/**
 * Adds the $ a system value needs, such as [Box.Width] to [$Box.Width] or Nz to
 * $NZ, unless the script already defines that name.
 *
 * @param text Text.
 * @param known Tells whether the script defines a name, so it is no system
 *   value.
 * @returns Rewritten text.
 */
function solidScriptMistakeSystem(text: string, known: (name: string) => boolean): string {
  return text.replace(SOLID_SCRIPT_MISTAKE_NAME, (name: string, at: number) => {
    const official = solidScriptMistakeOfficial(name);
    const group = name.split('.')[0] ?? name;
    const before = text[at - 1] ?? '';
    if (!official || known(group) || /[\d.]/.test(before) || /^\s*\(/.test(text.slice(at + name.length))) return name;
    return official;
  });
}

/**
 * Finds a common mistake in field text and writes what was probably meant,
 * built from the text as written: [K]*2 or [[K]_2] or [K_2] becomes [=[K]*2],
 * =[K]*2 becomes [=[K]*2], and [Box.Width] becomes [$Box.Width].
 *
 * @param text Field text as written.
 * @param math False for fields that may hold text, where only the $ is checked.
 * @param known Tells whether the script defines a name.
 * @returns What was probably meant, or an empty string when nothing looks
 *   wrong.
 */
export function solidScriptFieldMistake(
  text: string,
  math = true,
  known: (name: string) => boolean = () => false,
): string {
  const trimmed = text.trim();
  // Commas inside a call such as Max([A], [B]) stay in their piece.
  const pieces = solidScriptFieldArguments(trimmed);
  const rewritten = math ? pieces.map(solidScriptMistakeMath).join(', ') : trimmed;
  const meant = solidScriptMistakeSystem(math && rewritten === pieces.join(', ') ? trimmed : rewritten, known);
  return meant === trimmed ? '' : meant;
}

/**
 * Explains a mistake in field text in plain words, with what was probably
 * meant.
 *
 * @param text Field text as written.
 * @param math False for fields that may hold text.
 * @param known Tells whether the script defines a name.
 * @returns Explanation, or an empty string when nothing looks wrong.
 */
export function solidScriptFieldMistakeNote(
  text: string,
  math = true,
  known: (name: string) => boolean = () => false,
): string {
  const meant = solidScriptFieldMistake(text, math, known);
  if (meant === '') return '';
  const why =
    meant.includes('[=') && !text.includes('[=')
      ? 'math outside a formula is not worked out'
      : 'system values start with $';
  return `${why}. Did you mean to write ${meant}?`;
}

/** A field of a line, as the hint reads it. */
interface SolidScriptMistakeField {
  key: string;
  label: string;
  type: SolidScriptFieldKind;
}

/**
 * Adds what was probably meant to the error a line stopped with, from the field
 * the error names, or else the only field with a mistake.
 *
 * @param error Error the line threw.
 * @param node Line: its fields and their text as written.
 * @returns The error, with the hint when one fits.
 */
export function solidScriptMistakeHinted(
  error: unknown,
  node: {
    command: { label: string; parameters: readonly SolidScriptMistakeField[] };
    values: Readonly<Record<string, string>>;
  },
): unknown {
  if (!(error instanceof Error)) return error;
  if (solidScriptMistakeEngine(error))
    return new Error(`${node.command.label} cannot be built with these values; try smaller sizes or counts`);
  const fields = node.command.parameters;
  const notes = fields
    .map((field) => ({ field, note: solidScriptFieldMistakeOf(field, node.values[field.key] ?? '') }))
    .filter((entry) => entry.note !== '');
  const names = (field: SolidScriptMistakeField): boolean => error.message.startsWith(field.label);
  // An error about one field never gets the hint of another.
  const named = fields.some(names)
    ? notes.find((entry) => names(entry.field))
    : notes.length === 1
      ? notes[0]
      : undefined;
  if (!named) return error;
  return new Error(`${error.message.replace(/\.?\s*$/, '')}. ${named.note.slice(named.note.indexOf('Did you mean'))}`);
}

/**
 * Tells whether an error is a fault of the engine itself, such as running out
 * of room for a huge count, rather than a mistake a line tells in words.
 *
 * @param error Error.
 * @returns True for a fault of the engine.
 */
function solidScriptMistakeEngine(error: Error): boolean {
  return error instanceof RangeError || error instanceof TypeError || error instanceof ReferenceError;
}

/**
 * Explains a mistake in the text of one field, by the same rule in the editor
 * and in a run: names are never checked, and math outside a formula only in
 * fields that are read as numbers.
 *
 * @param field Field.
 * @param text Field text as written.
 * @param known Tells whether the script defines a name.
 * @returns Explanation, or an empty string when nothing looks wrong.
 */
export function solidScriptFieldMistakeOf(
  field: Pick<SolidScriptMistakeField, 'type'>,
  text: string,
  known: (name: string) => boolean = () => false,
): string {
  if (SOLID_SCRIPT_MISTAKE_NAMES.has(field.type) || text.trim() === '') return '';
  return solidScriptFieldMistakeNote(text, SOLID_SCRIPT_MISTAKE_NUMERIC.has(field.type), known);
}
