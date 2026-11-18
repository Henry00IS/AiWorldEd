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
