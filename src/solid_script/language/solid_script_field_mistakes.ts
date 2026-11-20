import { solidScriptFieldArguments, type SolidScriptFieldKind } from './solid_script_field.js';
import { SOLID_SCRIPT_SYSTEM_VALUES } from './solid_script_name_rules.js';
import { solidScriptSystemFill } from './solid_script_system_names.js';
import { solidScriptNameKey } from './solid_script_name_key.js';
import { solidScriptMistakeBareMembers, solidScriptMistakeUserDollars } from './solid_script_field_bare_members.js';
import { SOLID_SCRIPT_FORMULA_BARE_TOLD } from './solid_script_formula_bare.js';

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
  const headFill = parts.length >= 2 ? solidScriptSystemFill(parts[0] ?? '') : undefined;
  if (headFill) return [headFill.name, ...parts.slice(1)].join('.');
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

/** Tells whether a name is one the script or the line has; by default none. */
type SolidScriptMistakeNames = (name: string) => boolean;

/** Why a variable read with a member in a formula reads nothing. */
const SOLID_SCRIPT_MISTAKE_BARE_WHY = 'in a formula, a variable read with a member needs its own brackets';

/** Why a variable of the script written with a $ reads nothing. */
const SOLID_SCRIPT_MISTAKE_DOLLAR_WHY = 'a $ marks only system values, never a variable of the script';

/** Why a name written without brackets in a formula reads nothing. */
const SOLID_SCRIPT_MISTAKE_PLAIN_WHY = 'a formula reads every variable and system value in brackets';

/**
 * Reasons a running line's error does not tell by itself, so its hint says
 * them; a name without brackets in a formula stops with its own reason.
 */
const SOLID_SCRIPT_MISTAKE_NAME_WHYS = [SOLID_SCRIPT_MISTAKE_BARE_WHY, SOLID_SCRIPT_MISTAKE_DOLLAR_WHY];

/**
 * Writes the names of field text as a line that sees them reads them, the one
 * rule every hint about names uses: [$Width] of a variable Width as [Width],
 * and a member read such as Edge.Start in a formula as [Edge.Start].
 *
 * @param text Field text, trimmed.
 * @param sees Tells whether the line sees a variable of that name.
 * @param plain True also writes a variable read bare in a formula, such as Edge
 *   in [=Edge + 1], as [Edge].
 * @returns Rewritten text, the same when every name is written right.
 */
export function solidScriptMistakeNamesWritten(text: string, sees: SolidScriptMistakeNames, plain = false): string {
  const system = (name: string): boolean => solidScriptMistakeOfficial(name.slice(1)) !== undefined;
  return solidScriptMistakeBareMembers(solidScriptMistakeUserDollars(text, sees, system), sees, plain);
}

/**
 * Tells why field text needs the names it has written another way.
 *
 * @param text Field text, trimmed.
 * @param sees Tells whether the line sees a variable of that name.
 * @returns Reason, or an empty string when its names are written right.
 */
function solidScriptMistakeNamesWhy(text: string, sees: SolidScriptMistakeNames): string {
  const system = (name: string): boolean => solidScriptMistakeOfficial(name.slice(1)) !== undefined;
  if (solidScriptMistakeUserDollars(text, sees, system) !== text) return SOLID_SCRIPT_MISTAKE_DOLLAR_WHY;
  return solidScriptMistakeBareMembers(text, sees) !== text ? SOLID_SCRIPT_MISTAKE_BARE_WHY : '';
}

/**
 * Reads a condition, which is a formula as a whole, as the [= ] formula it
 * works like, and back.
 *
 * @param text Field text, trimmed.
 * @param formula True when the whole text is a formula.
 * @param rewrite Rewrites field text.
 * @returns Rewritten text.
 */
function solidScriptMistakeAsFormula(text: string, formula: boolean, rewrite: (text: string) => string): string {
  if (!formula) return rewrite(text);
  const written = rewrite(`[=${text}]`);
  return written.slice(2, -1);
}

/**
 * Finds a common mistake in field text and writes what was probably meant,
 * built from the text as written: [K]*2 or [[K]_2] or [K_2] becomes [=[K]*2],
 * =[K]*2 becomes [=[K]*2], [=Edge.Start + 1] becomes [=[Edge.Start] + 1] when
 * the line sees a variable Edge, and [Box.Width] becomes [$Box.Width] unless
 * Box is a name of the script.
 *
 * @param text Field text as written.
 * @param math False for fields that may hold text, where only the $ and the
 *   brackets of a member read are checked.
 * @param known Tells whether the script defines a name.
 * @param sees Tells whether the line sees a variable of that name.
 * @param formula True when the whole text is a formula, as a condition is.
 * @returns What was probably meant, or an empty string when nothing looks
 *   wrong.
 */
export function solidScriptFieldMistake(
  text: string,
  math = true,
  known: SolidScriptMistakeNames = () => false,
  sees: SolidScriptMistakeNames = () => false,
  formula = false,
): string {
  const trimmed = text.trim();
  const meant = solidScriptMistakeBracketed(solidScriptMistakeUnbracketed(trimmed, math, known, sees), sees, formula);
  return meant === trimmed ? '' : meant;
}

/**
 * Writes what field text probably meant, apart from the brackets a formula
 * needs around names: a $ or the brackets of a member read, math outside a
 * formula and a system value written without its $.
 *
 * @param text Field text, trimmed.
 * @param math False for fields that may hold text.
 * @param known Tells whether the script defines a name.
 * @param sees Tells whether the line sees a variable of that name.
 * @returns Rewritten text.
 */
function solidScriptMistakeUnbracketed(
  text: string,
  math: boolean,
  known: SolidScriptMistakeNames,
  sees: SolidScriptMistakeNames,
): string {
  const bare = solidScriptMistakeNamesWritten(text, sees);
  // Commas inside a call such as Max([A], [B]) stay in their piece.
  const pieces = solidScriptFieldArguments(bare);
  const rewritten = math ? pieces.map(solidScriptMistakeMath).join(', ') : bare;
  const unchanged = math && rewritten === pieces.join(', ') ? bare : rewritten;
  return solidScriptMistakeSystem(unchanged, (name) => known(name) || sees(name));
}

/**
 * Writes brackets around each name a formula writes without them that surely
 * means a variable or a system value: one with a $, or a variable the line
 * sees, such as [=Width + $Box.Width] as [=[Width] + [$Box.Width]].
 *
 * @param text Field text, trimmed.
 * @param sees Tells whether the line sees a variable of that name.
 * @param formula True when the whole text is a formula, as a condition is.
 * @returns Rewritten text.
 */
function solidScriptMistakeBracketed(text: string, sees: SolidScriptMistakeNames, formula: boolean): string {
  const means = (name: string): boolean => name.startsWith('$') || sees(name);
  return solidScriptMistakeAsFormula(text, formula, (written) => solidScriptMistakeNamesWritten(written, means, true));
}

/**
 * Explains a mistake in field text in plain words, with what was probably
 * meant.
 *
 * @param text Field text as written.
 * @param math False for fields that may hold text.
 * @param known Tells whether the script defines a name.
 * @param sees Tells whether the line sees a variable of that name.
 * @param formula True when the whole text is a formula, as a condition is.
 * @returns Explanation, or an empty string when nothing looks wrong.
 */
export function solidScriptFieldMistakeNote(
  text: string,
  math = true,
  known: SolidScriptMistakeNames = () => false,
  sees: SolidScriptMistakeNames = () => false,
  formula = false,
): string {
  const meant = solidScriptFieldMistake(text, math, known, sees, formula);
  if (meant === '') return '';
  const trimmed = text.trim();
  const names = solidScriptMistakeNamesWhy(formula ? `[=${trimmed}]` : trimmed, sees);
  const unbracketed = solidScriptMistakeUnbracketed(trimmed, math, known, sees);
  const why = names
    ? names
    : meant !== unbracketed
      ? SOLID_SCRIPT_MISTAKE_PLAIN_WHY
      : meant.includes('[=') && !text.includes('[=')
        ? 'math outside a formula is not worked out'
        : 'system values start with $';
  return `${why}. Did you mean to write ${meant}?`;
}

/** A field of a line, as the hint reads it. */
interface SolidScriptMistakeField {
  key: string;
  label: string;
  type: SolidScriptFieldKind;
  /** The few words a choice or Yes/No field takes, when it has them. */
  words?: readonly { word: string }[];
}

/**
 * Adds what was probably meant to the error a line stopped with, from the field
 * the error names, or else the only field with a mistake. A member read that
 * needs brackets also says why, since the error alone does not tell.
 *
 * @param error Error the line threw.
 * @param node Line: its fields and their text as written.
 * @param sees Tells whether the running line sees a variable of that name.
 * @param known Tells whether a line of the script writes a name, so it is never
 *   given a $.
 * @returns The error, with the hint when one fits; an error that already says
 *   what was meant is kept as it is.
 */
export function solidScriptMistakeHinted(
  error: unknown,
  node: {
    command: { label: string; parameters: readonly SolidScriptMistakeField[] };
    values: Readonly<Record<string, string>>;
  },
  sees: SolidScriptMistakeNames,
  known: SolidScriptMistakeNames,
): unknown {
  if (!(error instanceof Error)) return error;
  if (solidScriptMistakeEngine(error))
    return new Error(`${node.command.label} cannot be built with these values; try smaller sizes or counts`);
  const notes = node.command.parameters
    .map((field) => ({ field, note: solidScriptFieldMistakeOf(field, node.values[field.key] ?? '', known, sees) }))
    .filter((entry) => entry.note !== '');
  const note = solidScriptMistakeNamed(error, node.command.parameters, notes);
  return note === undefined ? error : new Error(solidScriptMistakeJoined(error.message, note));
}

/**
 * Puts a hint after an error, in place of what the error itself guessed was
 * meant; a name written the wrong way also says why, unless the error says
 * already that a name needs brackets.
 *
 * @param message Error message.
 * @param note Hint of the field.
 * @returns Message with the hint.
 */
function solidScriptMistakeJoined(message: string, note: string): string {
  const told = message.includes(SOLID_SCRIPT_FORMULA_BARE_TOLD);
  const says = !told && SOLID_SCRIPT_MISTAKE_NAME_WHYS.some((why) => note.startsWith(why));
  const hint = note.slice(says ? 0 : note.indexOf('Did you mean'));
  const said = message.replace(/\s*Did you mean[\s\S]*$/, '').replace(/\.?\s*$/, '');
  return `${said}. ${hint.charAt(0).toUpperCase()}${hint.slice(1)}`;
}

/**
 * Picks the note of the field an error names, or else of the only field with a
 * mistake; an error about one field never gets the hint of another.
 *
 * @param error Error the line threw.
 * @param fields Fields of the line.
 * @param notes Fields with a mistake, with their notes.
 * @returns Note, or undefined when none fits.
 */
function solidScriptMistakeNamed(
  error: Error,
  fields: readonly SolidScriptMistakeField[],
  notes: readonly { field: SolidScriptMistakeField; note: string }[],
): string | undefined {
  const names = (field: SolidScriptMistakeField): boolean => error.message.startsWith(field.label);
  if (fields.some(names)) return notes.find((entry) => names(entry.field))?.note;
  return notes.length === 1 ? notes[0]?.note : undefined;
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
 * Tells whether field text is one of the words a choice or Yes/No field takes,
 * so a bare X in a listed choice such as Along X is not treated as $X.
 *
 * @param field Field, with its words when it takes a few.
 * @param text Field text as written.
 * @returns True when the text is a listed choice.
 */
function solidScriptFieldListedChoice(field: Pick<SolidScriptMistakeField, 'type' | 'words'>, text: string): boolean {
  const words = field.type === 'boolean' ? ['Yes', 'No'] : (field.words ?? []).map((entry) => entry.word);
  if (words.length === 0) return false;
  const written = text.trim().toLowerCase();
  return words.some((word) => word.toLowerCase() === written);
}

/**
 * Explains a mistake in the text of one field, by the same rule in the editor
 * and in a run: names are never checked, math outside a formula only in fields
 * that are read as numbers, and listed choices are left as they are.
 *
 * @param field Field.
 * @param text Field text as written.
 * @param known Tells whether the script defines a name.
 * @param sees Tells whether the line sees a variable of that name.
 * @returns Explanation, or an empty string when nothing looks wrong.
 */
export function solidScriptFieldMistakeOf(
  field: Pick<SolidScriptMistakeField, 'type' | 'words'>,
  text: string,
  known: SolidScriptMistakeNames = () => false,
  sees: SolidScriptMistakeNames = () => false,
): string {
  if (SOLID_SCRIPT_MISTAKE_NAMES.has(field.type) || text.trim() === '') return '';
  if (solidScriptFieldListedChoice(field, text)) return '';
  const numeric = SOLID_SCRIPT_MISTAKE_NUMERIC.has(field.type);
  return solidScriptFieldMistakeNote(text, numeric, known, sees, field.type === 'condition');
}
