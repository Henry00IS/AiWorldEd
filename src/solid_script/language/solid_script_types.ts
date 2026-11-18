import { solidScriptFieldSplit } from './solid_script_field.js';
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
 * Explains why a value does not fit the kind a variable was declared as.
 *
 * @param name Variable as written.
 * @param type Declared kind.
 * @param value Value.
 * @returns Problem, or an empty string when it fits.
 */
export function solidScriptTypeProblem(name: string, type: string, value: SolidScriptValue): string {
  if (solidScriptTypeFits(type, value)) return '';
  const found = solidScriptValueType(value);
  const shown =
    found === 'Text' || found === 'Number' || found === 'Whole Number'
      ? `${found === 'Text' ? 'Text' : 'Number'} "${solidScriptValueText(value)}"`
      : `a ${found}`;
  return `[${name}] is declared ${type}, so it cannot hold ${shown}`;
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
 * Reads the value of a Set line for its declared kind: a blank gives the
 * default, a list kind splits the text on commas (one bracket alone may give
 * the whole list), and Text keeps numbers as text.
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
  if (type === '' || type === 'Any') return whole();
  if (text.trim() === '') return solidScriptTypeDefault(type);
  if (type.endsWith('List')) {
    const item = type.slice(0, -'List'.length).trim();
    let list: SolidScriptValue[];
    if (solidScriptFieldSplit(text, ',').length === 1) {
      const value = whole();
      const vector = item === 'Vector' && solidScriptTypeFits('Vector', value);
      list = Array.isArray(value) && !vector ? value : [value];
    } else list = items();
    return item === 'Text'
      ? list.map((entry) => (typeof entry === 'string' ? entry : solidScriptValueText(entry)))
      : list;
  }
  const value = whole();
  return type === 'Text' && (typeof value === 'number' || typeof value === 'boolean')
    ? solidScriptValueText(value)
    : value;
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
