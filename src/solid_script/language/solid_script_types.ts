import { solidScriptFieldBoolean, solidScriptFieldSplit } from './solid_script_field.js';
import {
  SolidScriptElement,
  SOLID_SCRIPT_ELEMENT_TYPES,
  solidScriptValueNumber,
  solidScriptValueNumbers,
  solidScriptValueText,
  solidScriptValueType,
  type SolidScriptValue,
} from './solid_script_value.js';

/** Kinds of value a Set line may declare, Any first. */
export const SOLID_SCRIPT_TYPES: readonly string[] = [
  'Any',
  'Number',
  'Yes/No',
  'Text',
  'Vector',
  'Brush',
  'Face',
  'Edge',
  'Vertex',
  'List',
  'Number List',
  'Text List',
  'Vector List',
  'Brush List',
  'Face List',
  'Edge List',
  'Vertex List',
];

/** Words a Yes/No holds as text. */
const SOLID_SCRIPT_TYPE_YES_NO = new Set(['yes', 'no', 'true', 'false']);

/**
 * Tells whether a value fits a kind; Any fits everything and an empty list fits
 * every list.
 *
 * @param type Kind, one of the Type words.
 * @param value Value.
 * @returns True when it fits.
 */
export function solidScriptTypeFits(type: string, value: SolidScriptValue): boolean {
  if (type === 'Any') return true;
  if (type.endsWith('List')) {
    if (!Array.isArray(value)) return false;
    const item = type.slice(0, -'List'.length).trim();
    return item === '' || value.every((entry) => solidScriptTypeFits(item, entry));
  }
  if (value instanceof SolidScriptElement) return SOLID_SCRIPT_ELEMENT_TYPES[value.kind] === type;
  if (type === 'Vector') return Array.isArray(value) && [2, 3].includes(solidScriptValueNumbers(value)?.length ?? 0);
  if (Array.isArray(value)) return false;
  if (type === 'Number') return solidScriptValueNumber(value) !== undefined;
  if (type === 'Yes/No')
    return typeof value === 'boolean' || SOLID_SCRIPT_TYPE_YES_NO.has(String(value).trim().toLowerCase());
  return type === 'Text' && value !== undefined;
}

/**
 * Explains why a value does not fit the kind a variable was declared as; for a
 * list kind it names the first item that does not fit, and a number typed with
 * extra letters gets a hint such as (Did you mean 78?).
 *
 * @param name Variable as written.
 * @param type Declared kind.
 * @param value Value.
 * @returns Problem, or an empty string when it fits.
 */
export function solidScriptTypeProblem(name: string, type: string, value: SolidScriptValue): string {
  if (solidScriptTypeFits(type, value)) return '';
  const item = solidScriptTypeListItem(type);
  const wrong =
    item !== '' && Array.isArray(value) ? value.find((entry) => !solidScriptTypeFits(item, entry)) : undefined;
  const shown = wrong === undefined ? value : wrong;
  const suffix = wrong === undefined ? '' : ' as an item';
  const hint = solidScriptTypeHint(wrong === undefined ? type : item, shown);
  return `[${name}] is declared ${type}, so it cannot hold ${solidScriptTypeShown(shown)}${suffix}${hint}`;
}

/**
 * Gives the kind of the items of a list kind, such as Number for Number List.
 *
 * @param type Kind, one of the Type words.
 * @returns Item kind, or an empty string for List and every kind that is no
 *   list.
 */
function solidScriptTypeListItem(type: string): string {
  return type.endsWith('List') ? type.slice(0, -'List'.length).trim() : '';
}

/**
 * Writes a value for a message: Text "oak" or Number "2" with the value, else a
 * kind such as a Brush.
 *
 * @param value Value.
 * @returns Words for the message.
 */
function solidScriptTypeShown(value: SolidScriptValue): string {
  const found = solidScriptValueType(value);
  return found === 'Text' || found === 'Number' || found === 'Whole Number'
    ? `${found === 'Text' ? 'Text' : 'Number'} "${solidScriptValueText(value)}"`
    : `a ${found}`;
}

/**
 * Suggests the number a text that starts with one probably meant, for a Number.
 *
 * @param type Kind the value should be.
 * @param value Value that does not fit.
 * @returns Hint such as " (Did you mean 78?)", or an empty string.
 */
function solidScriptTypeHint(type: string, value: SolidScriptValue): string {
  if (type !== 'Number' || typeof value !== 'string') return '';
  const meant = /^\s*(-?\d+(?:\.\d+)?)\s*[^\d\s.]/.exec(value)?.[1];
  return meant === undefined ? '' : ` (Did you mean ${meant}?)`;
}

/**
 * Turns a value written to a variable into the kind it was declared as where
 * the meaning is plain: numbers typed as text become numbers, numbers and
 * Yes/No become text for Text, yes and no become Yes/No, one item becomes a
 * list of it for a list kind, and the items of a list are turned the same way.
 * Anything else is left as it is for the check.
 *
 * @param type Declared kind.
 * @param value Value written.
 * @returns Value of that kind when it could be turned.
 */
export function solidScriptTypeConvert(type: string, value: SolidScriptValue): SolidScriptValue {
  if (!type.endsWith('List')) return solidScriptTypeConvertOne(type, value);
  const item = solidScriptTypeListItem(type);
  if (item === '') return Array.isArray(value) ? value : [value];
  if (!Array.isArray(value)) return solidScriptTypeFits(item, value) ? [solidScriptTypeConvertOne(item, value)] : value;
  if (item === 'Text') return value.map((entry) => (typeof entry === 'string' ? entry : solidScriptValueText(entry)));
  return value.map((entry) => solidScriptTypeConvertOne(item, entry));
}

/**
 * Turns one value into a kind that is no list where the meaning is plain.
 *
 * @param type Kind.
 * @param value Value.
 * @returns Value of that kind when it could be turned.
 */
function solidScriptTypeConvertOne(type: string, value: SolidScriptValue): SolidScriptValue {
  if (type === 'Number' && typeof value === 'string') return solidScriptValueNumber(value) ?? value;
  if (type === 'Text' && (typeof value === 'number' || typeof value === 'boolean')) return solidScriptValueText(value);
  if (type === 'Yes/No' && typeof value === 'string') return solidScriptFieldBoolean(value);
  return value;
}

/**
 * Explains, without running, why a variable declared as a kind cannot get what
 * a line surely writes to it, such as a Brush from Into: the kind itself, or a
 * list of it, fits.
 *
 * @param name Variable as written.
 * @param type Declared kind.
 * @param kind Kind the line writes, such as Brush or Face List.
 * @returns Problem, or an empty string when it fits.
 */
export function solidScriptTypeKindProblem(name: string, type: string, kind: string): string {
  const fits = [kind, `${kind} List`, 'Any', 'List'];
  return fits.includes(type) ? '' : `[${name}] is declared ${type}, so it cannot hold a ${kind}`;
}

/**
 * Reads a Set value written without brackets as the value it surely gives, for
 * checks without running: a number, numbers or text.
 *
 * @param text Value as written.
 * @returns Value, or undefined when only running tells, such as for [Name].
 */
export function solidScriptTypeLiteral(text: string): SolidScriptValue {
  const trimmed = text.trim();
  if (trimmed === '' || /[[\]$]/.test(trimmed)) return undefined;
  const pieces = solidScriptFieldSplit(trimmed, ',').map((piece) => piece.trim());
  if (pieces.length > 1 && pieces.every((piece) => solidScriptValueNumber(piece) !== undefined))
    return pieces.map((piece) => solidScriptValueNumber(piece)!);
  return solidScriptValueNumber(trimmed) ?? trimmed;
}

/**
 * Gives the value a blank Set of a kind holds: 0, empty text, 0, 0, 0, No or a
 * new empty list. Any keeps the blank as empty text.
 *
 * @param type Kind, one of the Type words.
 * @returns Value.
 */
export function solidScriptTypeDefault(type: string): SolidScriptValue {
  if (type.endsWith('List')) return [];
  if (type === 'Number') return 0;
  if (type === 'Vector') return [0, 0, 0];
  if (type === 'Yes/No') return false;
  return type === 'Any' || type === '' || type === 'Text' ? '' : undefined;
}

/**
 * Reads the value of a Set line for its declared kind: without a kind, commas
 * typed outside brackets make a list of the items, each read the way a list
 * item is, and one item stays one value; a blank gives the default, a list kind
 * splits the text on commas (one bracket alone may give the whole list, one
 * vector a Vector List of it), and the value is turned into the kind where the
 * meaning is plain.
 *
 * @param type Declared kind, empty for none.
 * @param text Value as written.
 * @param whole Reads the value as written.
 * @param items Reads each comma-separated item.
 * @returns Value.
 */
export function solidScriptTypeValue(
  type: string,
  text: string,
  whole: () => SolidScriptValue,
  items: () => SolidScriptValue[],
): SolidScriptValue {
  const typed = solidScriptFieldSplit(text, ',').length;
  if (type === '' || type === 'Any') return typed > 1 ? items() : whole();
  if (text.trim() === '') return solidScriptTypeDefault(type);
  if (!type.endsWith('List')) return solidScriptTypeConvert(type, whole());
  const list = items();
  const vectorAlone = type === 'Vector List' && typed === 1 && solidScriptTypeFits('Vector', list);
  return solidScriptTypeConvert(type, vectorAlone ? [list] : list);
}

/**
 * Lists the words a value of a kind may be written as, offered in its field:
 * Yes and No for Yes/No.
 *
 * @param type Kind, one of the Type words.
 * @returns Words with their meaning.
 */
export function solidScriptTypeWords(type: string): { word: string; detail: string }[] {
  return type.trim().toLowerCase() === 'yes/no'
    ? [
        { word: 'Yes', detail: 'On' },
        { word: 'No', detail: 'Off; also what an empty Value gives' },
      ]
    : [];
}

/**
 * Writes the value a blank Set of a kind gives, as its Value field shows it
 * greyed: nothing for Any, Text and lists, 0, No or 0, 0, 0.
 *
 * @param type Kind, one of the Type words, or empty.
 * @returns Text.
 */
export function solidScriptTypePlaceholder(type: string): string {
  const known = SOLID_SCRIPT_TYPES.find((entry) => entry.toLowerCase() === type.trim().toLowerCase()) ?? '';
  const value = solidScriptTypeDefault(known);
  if (Array.isArray(value)) return value.length === 0 ? '' : value.join(', ');
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return value === undefined ? '' : String(value);
}
