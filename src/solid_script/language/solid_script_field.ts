import type { SolidScriptExpression } from './solid_script_ast.js';
import type { SolidScriptCompiled } from './solid_script_expression_compile.js';
import { SolidScriptCurveValue } from './solid_script_curve_value.js';
import { solidScriptFieldFormulaCompile } from './solid_script_field_formula_compile.js';
import { solidScriptNameDotProblem, solidScriptSystemIsVector } from './solid_script_name_rules.js';
import type { SolidScriptValue } from './solid_script_value.js';
import { SolidScriptPathElement, solidScriptValueText } from './solid_script_value.js';
import { solidScriptNameKey } from './solid_script_name_key.js';
import { solidScriptFieldVectorRead, solidScriptFormulaListStarts } from './solid_script_formula_list_literal.js';
import { SOLID_SCRIPT_ESCAPED, solidScriptStringEscapes } from './solid_script_lexer.js';
import * as THREE from 'three';
import { solidScriptPathFlat, solidScriptPathLoopOpen } from './solid_script_path_flat.js';
import { solidScriptPathSample } from './solid_script_path_model.js';
import { solidScriptPolygonArea, type SolidScriptPoint2 } from './solid_script_polygon.js';
import { solidScriptVectorOfNumbers } from './solid_script_vector.js';

/**
 * How the text typed into a block field is read. Field text is plain text
 * without quotes: [name] puts in the value of a variable, [=formula] the result
 * of a formula, and $ before a character keeps it as typed, so $[ and $] write
 * brackets, $$ a dollar sign and $, a comma inside a list item. Brackets may
 * nest, so a variable name or a formula can itself be built from variables.
 */
export type SolidScriptFieldKind =
  | 'number'
  | 'count'
  | 'vector2'
  | 'vector3'
  | 'points2'
  | 'points3'
  | 'boolean'
  | 'value'
  | 'condition'
  | 'message'
  | 'name'
  | 'target'
  | 'text';

/** What resolving field text needs from the running script. */
export interface SolidScriptFieldContext {
  /** Returns a variable's value; throws when there is none. */
  variable(name: string): SolidScriptValue;
  /** Returns the value of a plain name such as width, as variable() does. */
  variablePlain(name: string): SolidScriptValue;
  /**
   * Returns a Function's own variable written local.name, as variable() does.
   *
   * @param bare Name after $local.
   * @param name Name as written.
   */
  variableLocal(bare: string, name: string): SolidScriptValue;
  /**
   * Returns one part of a vector variable such as Pos.X, as variable() does.
   *
   * @param base Vector variable name.
   * @param index Position of the part: 0 for x, 1 for y, 2 for z.
   * @param name Name as written.
   */
  variableComponent(base: string, index: number, name: string): SolidScriptValue;
  /**
   * Returns an item of a list variable such as points([i]), as variable() does
   * for the name written with the item number.
   *
   * @param list List variable name.
   * @param index Item number.
   */
  variableItem(list: string, index: SolidScriptValue): SolidScriptValue;
  /** Computes a formula; throws when it cannot be read. */
  formula(text: string): SolidScriptValue;
  /**
   * Parses a formula once, or returns null when it cannot be read, so the
   * caller falls back to formula() for the message.
   */
  formulaParse(text: string): SolidScriptExpression | null;
  /** Computes a compiled formula. */
  formulaRun(formula: SolidScriptCompiled): SolidScriptValue;
}

/** A field compiled once: reading it only runs the closure. */
export type SolidScriptFieldCompiled = (context: SolidScriptFieldContext) => SolidScriptValue;

/** Compiled fields by kind and text; cleared when it grows past its limit. */
const solidScriptFieldCache = new Map<string, SolidScriptFieldCompiled>();

/** Most compiled fields kept before the cache starts over. */
const SOLID_SCRIPT_FIELD_CACHE_LIMIT = 20000;

/** One piece of field text: plain characters or a bracketed part. */
export type SolidScriptFieldPiece =
  { kind: 'plain'; text: string } | { kind: 'group'; pieces: SolidScriptFieldPiece[]; from: number; to: number };

/** A bracketed part of field text, with where its brackets stand. */
type SolidScriptFieldGroup = Extract<SolidScriptFieldPiece, { kind: 'group' }>;

/** A plain variable name, such as width. */
const SOLID_SCRIPT_FIELD_NAME_PLAIN = /^[A-Za-z_]\w*$/;

/** A Function's own variable, such as $local.n. */
const SOLID_SCRIPT_FIELD_NAME_LOCAL = /^\$local\.([A-Za-z_]\w*)$/;

/** A part of a vector variable, such as Pos.X. */
const SOLID_SCRIPT_FIELD_NAME_COMPONENT = /^([A-Za-z_]\w*)\.([xyzXYZ])$/;

/** Text before the item number of a list item, such as "points(". */
const SOLID_SCRIPT_FIELD_ITEM_OPEN = /^\s*([A-Za-z_]\w*)\s*\(\s*$/;

/** Text after the item number of a list item. */
const SOLID_SCRIPT_FIELD_ITEM_CLOSE = /^\s*\)\s*$/;

/** Text made of $ and a space, once or more in a row, or of nothing. */
const SOLID_SCRIPT_FIELD_SPACES = /^(\$ )*$/;

/**
 * Tells whether the character at a place is a $ that keeps the next one as
 * typed: $$, $[, $] or $,, and $ and a space at the start or the end of the
 * text, a space that is kept. A $ and a space in the middle are just text.
 *
 * @param text Field text.
 * @param index Place.
 * @returns True for such a $.
 */
export function solidScriptFieldEscapes(text: string, index: number): boolean {
  if (text[index] !== '$') return false;
  if (text[index + 1] !== ' ') return SOLID_SCRIPT_ESCAPED.has(text[index + 1] ?? '');
  return SOLID_SCRIPT_FIELD_SPACES.test(text.slice(0, index)) || SOLID_SCRIPT_FIELD_SPACES.test(text.slice(index + 2));
}

/**
 * How field text reads a $: as an escape of the field, or left for a formula
 * string.
 */
export type SolidScriptFieldEscape = 'field' | 'string';

/**
 * Where a character of field text stands: in how many brackets, and in a
 * formula string or not.
 */
export interface SolidScriptFieldPlace {
  /** Brackets around it. */
  depth: number;
  /** True inside the double quotes of a formula. */
  quoted: boolean;
}

/**
 * Walks field text one character at a time, telling where each stands and who
 * reads each $ escape: inside the double quotes of a formula the formula string
 * reads them, anywhere else the field does, so every escape is read once.
 *
 * @param text Field text.
 * @param formula True when the whole text is a formula, as a condition is.
 * @param visit Called for each character, or once for an escape and the
 *   character it keeps.
 */
export function solidScriptFieldWalk(
  text: string,
  formula: boolean,
  visit: (index: number, place: SolidScriptFieldPlace, escape?: SolidScriptFieldEscape) => void,
): void {
  const modes = [{ formula, quoted: false }];
  for (let index = 0; index < text.length; index++) {
    const mode = modes[modes.length - 1]!;
    const place = { depth: modes.length - 1, quoted: mode.quoted };
    const character = text[index]!;
    if (mode.quoted ? solidScriptStringEscapes(text, index) : solidScriptFieldEscapes(text, index)) {
      visit(index, place, mode.quoted ? 'string' : 'field');
      index++;
      continue;
    }
    visit(index, place);
    if (character === '[') modes.push({ formula: mode.formula || /^\s*=/.test(text.slice(index + 1)), quoted: false });
    else if (character === ']' && modes.length > 1) modes.pop();
    else if (character === '"' && mode.formula) mode.quoted = !mode.quoted;
  }
}

/**
 * Finds the $ escapes of field text and who reads each; see
 * solidScriptFieldWalk.
 *
 * @param text Field text.
 * @param formula True when the whole text is a formula, as a condition is.
 * @returns Who reads the $ at each place that is an escape.
 */
export function solidScriptFieldEscapeReads(text: string, formula = false): Map<number, SolidScriptFieldEscape> {
  const reads = new Map<number, SolidScriptFieldEscape>();
  solidScriptFieldWalk(text, formula, (index, _place, escape) => {
    if (escape) reads.set(index, escape);
  });
  return reads;
}

/**
 * Trims field text as typed, keeping the space a $ at the end keeps: the last
 * of a run of $ before it is a $ of its own when the run is odd.
 *
 * @param text Field text as typed.
 * @returns Trimmed text.
 */
export function solidScriptFieldTrim(text: string): string {
  const trimmed = text.trim();
  const dollars = /\$*$/.exec(trimmed)?.[0].length ?? 0;
  return dollars % 2 === 1 && text.trimStart()[trimmed.length] === ' ' ? `${trimmed} ` : trimmed;
}

/**
 * Writes the spaces at the start and the end of a text as $ and a space each,
 * so trimming the field keeps them.
 *
 * @param text Text.
 * @returns Field text.
 */
export function solidScriptFieldSpacesWrite(text: string): string {
  return text.replace(/^ +| +$/g, (spaces) => '$ '.repeat(spaces.length));
}

/**
 * Reads the spaces a $ keeps at the start and the end of field text as spaces;
 * every other escape stays as typed.
 *
 * @param text Field text.
 * @returns Text with those spaces.
 */
export function solidScriptFieldSpacesRead(text: string): string {
  let read = '';
  for (let index = 0; index < text.length; index++) {
    const escaped = solidScriptFieldEscapes(text, index);
    read += escaped && text[index + 1] === ' ' ? ' ' : text.slice(index, escaped ? index + 2 : index + 1);
    if (escaped) index++;
  }
  return read;
}

/** Splits field text into pieces, one character at a time. */
class SolidScriptFieldPiecesReader {
  readonly root: SolidScriptFieldPiece[] = [];
  private readonly open: SolidScriptFieldPiece[][] = [this.root];
  private readonly groups: SolidScriptFieldGroup[] = [];

  /**
   * Adds a plain character to the innermost part.
   *
   * @param character Character.
   */
  plain(character: string): void {
    const into = this.open[this.open.length - 1]!;
    const last = into[into.length - 1];
    if (last?.kind === 'plain') last.text += character;
    else into.push({ kind: 'plain', text: character });
  }

  /**
   * Starts a bracketed part at a [.
   *
   * @param index Place of the [.
   */
  groupOpen(index: number): void {
    const group: SolidScriptFieldGroup = { kind: 'group', pieces: [], from: index, to: -1 };
    this.groups.push(group);
    this.open[this.open.length - 1]!.push(group);
    this.open.push(group.pieces);
  }

  /**
   * Ends the innermost bracketed part at a ].
   *
   * @param index Place of the ].
   * @throws Error when no [ is open.
   */
  groupClose(index: number): void {
    if (this.open.length === 1) throw new Error('a ] has no [ before it; write $] for a bracket');
    this.open.pop();
    this.groups.pop()!.to = index + 1;
  }

  /**
   * Checks every [ has its ].
   *
   * @throws Error when one is left open.
   */
  done(): void {
    if (this.open.length > 1) throw new Error('a [ has no ] after it; write $[ for a bracket');
  }
}

/**
 * Splits field text into plain characters and bracketed parts; each part knows
 * where its brackets stand in the text.
 *
 * @param text Field text.
 * @param formula True when the whole text is a formula, as a condition is.
 * @returns Pieces.
 */
export function solidScriptFieldPieces(text: string, formula = false): SolidScriptFieldPiece[] {
  const reader = new SolidScriptFieldPiecesReader();
  const escapes = solidScriptFieldEscapeReads(text, formula);
  for (let index = 0; index < text.length; index++) {
    const character = text[index]!;
    const escape = escapes.get(index);
    if (escape) {
      // A formula string reads its own escapes, so they stay as typed for it.
      reader.plain(escape === 'string' ? text.slice(index, index + 2) : text[index + 1]!);
      index++;
    } else if (character === '[') reader.groupOpen(index);
    else if (character === ']') reader.groupClose(index);
    else reader.plain(character);
  }
  reader.done();
  return reader.root;
}

/**
 * Compiles a bracketed part: a formula after =, otherwise a variable name.
 * Parts inside a name are read first.
 *
 * @param pieces Contents of the brackets.
 * @returns Compiled part.
 */
function solidScriptFieldGroupCompile(pieces: readonly SolidScriptFieldPiece[]): SolidScriptFieldCompiled {
  const first = pieces[0];
  if (first?.kind === 'plain' && first.text.trimStart().startsWith('='))
    return solidScriptFieldFormulaCompile(pieces, solidScriptFieldGroupCompile);
  const empty = (): never => {
    throw new Error('[] is empty; put a variable name inside, or write $[$] for brackets');
  };
  if (pieces.every((piece) => piece.kind === 'plain')) {
    const name = pieces
      .map((piece) => (piece.kind === 'plain' ? piece.text : ''))
      .join('')
      .trim();
    if (name === '') return empty;
    const vector = solidScriptFieldVectorRead(name);
    if (vector) return () => vector.slice();
    const problem = solidScriptFieldVectorProblem(name);
    if (problem)
      return () => {
        throw new Error(problem);
      };
    return solidScriptFieldVariableCompile(solidScriptNameKey(name));
  }
  const item = solidScriptFieldItemCompile(pieces);
  if (item) return item;
  const parts = pieces.map((piece) =>
    piece.kind === 'plain' ? piece.text : solidScriptFieldGroupCompile(piece.pieces),
  );
  return (context) => {
    let inner = '';
    for (const part of parts) inner += typeof part === 'string' ? part : solidScriptValueText(part(context));
    return solidScriptFieldBracketRead(inner, context);
  };
}

/** What a vector in brackets is, for messages. */
const SOLID_SCRIPT_FIELD_VECTOR_RULE = 'a vector in brackets needs 2 or 3 numbers, such as [1, 2] or [1, 2, 3]';

/** Start of bracket text no name has: a digit, a minus or a dot. */
const SOLID_SCRIPT_FIELD_NUMBER_START = /^\s*[-.\d]/;

/**
 * Explains bracket text that starts like a number, so it is no name, but is not
 * a vector either, with what was likely meant.
 *
 * @param text Bracket text.
 * @returns Problem, or an empty string when the text is a vector or may be a
 *   name.
 */
function solidScriptFieldVectorProblem(text: string): string {
  const inner = text.trim();
  if (!SOLID_SCRIPT_FIELD_NUMBER_START.test(inner) || solidScriptFieldVectorRead(inner)) return '';
  const items = solidScriptFieldSplit(inner, ',');
  // More than three items or brackets inside: a list written in brackets, such as pasted Echo output.
  if (items.length > 3 || items.some((item) => item.includes('[')))
    return `[${inner}] is not a vector: ${SOLID_SCRIPT_FIELD_VECTOR_RULE}. Did you mean to write ${items.filter((item) => item !== '').join(', ')}?`;
  const written = items.filter((item) => item !== '');
  const numbers = written.every((item) => Number.isFinite(Number(item)));
  const padded = [...written, '0', '0', '0'].slice(0, Math.max(2, items.length));
  const meant =
    items.length === 1
      ? numbers
        ? inner
        : `[=${inner}]`
      : !numbers
        ? `[=Vector(${written.join(', ')})]`
        : written.length <= 3
          ? `[${padded.join(', ')}]`
          : written.join(', ');
  return `[${inner}] is not a vector: ${SOLID_SCRIPT_FIELD_VECTOR_RULE}. Did you mean to write ${meant}?`;
}

/**
 * Reads bracket text once its inner brackets are put in: two or three numbers
 * are a vector, anything else names a variable.
 *
 * @param inner Bracket text.
 * @param context Running script.
 * @returns Value.
 */
function solidScriptFieldBracketRead(inner: string, context: SolidScriptFieldContext): SolidScriptValue {
  const vector = solidScriptFieldVectorRead(inner);
  if (vector) return vector;
  const problem = solidScriptFieldVectorProblem(inner);
  if (problem) throw new Error(problem);
  const name = inner.trim();
  if (name === '') throw new Error('[] is empty; put a variable name inside, or write $[$] for brackets');
  return context.variable(solidScriptNameKey(name));
}

/**
 * Compiles the read of a variable named in brackets, picking the read that fits
 * the shape of the name once, so running it skips looking at the name again.
 *
 * @param name Key of the variable name, folded as stored.
 * @returns Compiled part.
 */
function solidScriptFieldVariableCompile(name: string): SolidScriptFieldCompiled {
  if (SOLID_SCRIPT_FIELD_NAME_PLAIN.test(name)) return (context) => context.variablePlain(name);
  const local = SOLID_SCRIPT_FIELD_NAME_LOCAL.exec(name);
  if (local) {
    const bare = local[1] ?? '';
    return (context) => context.variableLocal(bare, name);
  }
  const component = SOLID_SCRIPT_FIELD_NAME_COMPONENT.exec(name);
  if (component) {
    const base = component[1] ?? '';
    const index = 'xyz'.indexOf((component[2] ?? '').toLowerCase());
    return (context) => context.variableComponent(base, index, name);
  }
  return (context) => context.variable(name);
}

/**
 * Compiles a list item whose number is one bracketed part, such as points([i]),
 * so running it reads the item without writing its name as text.
 *
 * @param pieces Contents of the brackets.
 * @returns Compiled part, or null when the pieces are not such an item.
 */
function solidScriptFieldItemCompile(pieces: readonly SolidScriptFieldPiece[]): SolidScriptFieldCompiled | null {
  const [open, index, close] = pieces;
  if (pieces.length !== 3 || open?.kind !== 'plain' || index?.kind !== 'group' || close?.kind !== 'plain') return null;
  const written = SOLID_SCRIPT_FIELD_ITEM_OPEN.exec(open.text)?.[1];
  if (written === undefined || !SOLID_SCRIPT_FIELD_ITEM_CLOSE.test(close.text)) return null;
  const list = solidScriptNameKey(written);
  const position = solidScriptFieldGroupCompile(index.pieces);
  return (context) => context.variableItem(list, position(context));
}

/**
 * Compiles field text: one bracketed part alone keeps its value, anything else
 * becomes text with every bracketed part put in.
 *
 * @param text Field text.
 * @returns Compiled text.
 */
function solidScriptFieldTemplateCompile(text: string): SolidScriptFieldCompiled {
  const pieces = solidScriptFieldPieces(text);
  const meaningful = pieces.filter((piece) => piece.kind === 'group' || piece.text.trim() !== '');
  if (meaningful.length === 1 && meaningful[0]!.kind === 'group')
    return solidScriptFieldGroupCompile(meaningful[0]!.pieces);
  if (pieces.every((piece) => piece.kind === 'plain')) {
    const plain = pieces.map((piece) => (piece.kind === 'plain' ? piece.text : '')).join('');
    return () => plain;
  }
  const parts = pieces.map((piece) =>
    piece.kind === 'plain' ? piece.text : solidScriptFieldGroupCompile(piece.pieces),
  );
  return (context) => {
    let out = '';
    for (const part of parts) out += typeof part === 'string' ? part : solidScriptValueText(part(context));
    return out;
  };
}

/**
 * Splits field text at a separator outside brackets, keeping escapes as typed.
 *
 * @param text Field text.
 * @param separator Separator character.
 * @returns Items, trimmed.
 */
export function solidScriptFieldSplit(text: string, separator: string): string[] {
  const items: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (solidScriptFieldEscapes(text, index)) index++;
    else if (character === '[') depth++;
    else if (character === ']') depth--;
    else if (character === separator && depth === 0) {
      items.push(solidScriptFieldTrim(text.slice(start, index)));
      start = index + 1;
    }
  }
  items.push(solidScriptFieldTrim(text.slice(start)));
  return items;
}

/**
 * Splits a field of values at the commas outside brackets and parentheses, so
 * [=max(1, 2)], 3 is two values.
 *
 * @param text Field text.
 * @returns Trimmed pieces; none for an empty field.
 */
export function solidScriptFieldArguments(text: string): string[] {
  if (text.trim() === '') return [];
  const pieces: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (solidScriptFieldEscapes(text, index)) index++;
    else if (character === '[' || character === '(') depth++;
    else if (character === ']' || character === ')') depth = Math.max(0, depth - 1);
    else if (character === ',' && depth === 0) {
      pieces.push(solidScriptFieldTrim(text.slice(start, index)));
      start = index + 1;
    }
  }
  pieces.push(solidScriptFieldTrim(text.slice(start)));
  return pieces;
}

/**
 * Reads the items of a list field: only the commas typed in the field separate
 * items, and $, keeps a comma inside one. A value is never split again, so
 * [Text], 23 is two items whatever Text holds. A single bracket that gives a
 * list gives its items.
 *
 * @param text Field text.
 * @param read Reads one item.
 * @returns Items.
 */
export function solidScriptFieldList(text: string, read: (item: string) => SolidScriptValue): SolidScriptValue[] {
  if (text.trim() === '') return [];
  const items = solidScriptFieldSplit(text, ',');
  if (items.length === 1) {
    const value = read(items[0]!);
    return Array.isArray(value) ? [...value] : [value];
  }
  return items.map((item) => read(item));
}

/**
 * Reads plain text as a number when it is one.
 *
 * @param value Resolved value.
 * @returns Number, or the value unchanged.
 */
function solidScriptFieldNumber(value: SolidScriptValue): SolidScriptValue {
  if (typeof value !== 'string') return value;
  const text = value.trim();
  const number = text === '' ? NaN : Number(text);
  return Number.isFinite(number) ? number : value;
}

/**
 * Compiles a list field: items separated by commas, each a number, a variable
 * or a formula. A single bracketed part may also give the whole list.
 *
 * @param text Field text.
 * @returns Compiled field.
 */
function solidScriptFieldVectorCompile(text: string): SolidScriptFieldCompiled {
  const items = solidScriptFieldSplit(text, ',').map(solidScriptFieldTemplateCompile);
  if (items.length === 1) {
    const only = items[0]!;
    return (context) => solidScriptFieldNumber(only(context));
  }
  return (context) => {
    const values = new Array<SolidScriptValue>(items.length);
    for (let index = 0; index < items.length; index++) values[index] = solidScriptFieldNumber(items[index]!(context));
    return values;
  };
}

/**
 * Keeps the first value of a field whose text has no brackets, since such text
 * reads the same every time; a list is handed out as a copy.
 *
 * @param text Field text.
 * @param compiled Closure that reads it.
 * @returns Closure that reads it once.
 */
function solidScriptFieldFolded(text: string, compiled: SolidScriptFieldCompiled): SolidScriptFieldCompiled {
  if (text.includes('[')) return compiled;
  let known = false;
  let value: SolidScriptValue;
  return (context) => {
    if (!known) {
      value = compiled(context);
      known = true;
    }
    return Array.isArray(value) ? value.slice() : value;
  };
}

/**
 * Reads the points of a points field: vectors in brackets separated by commas,
 * a list of them such as [Path], or one point as plain numbers. A point of two
 * numbers has a Z of 0; flat outlines take x and y and ignore z.
 *
 * @param values Items of the field, each read.
 * @param size 2 for x, y outlines, 3 for x, y, z points.
 * @returns Points.
 */
export function solidScriptFieldPoints(values: readonly SolidScriptValue[], size: 2 | 3): number[][] {
  const example = size === 3 ? '[0, 0, 0], [1, 0, 0]' : '[0, 0], [1, 0]';
  const wrong = (found: SolidScriptValue): Error =>
    new Error(`${solidScriptValueText(found)} is no point; write points as vectors in brackets, such as ${example}`);
  const fit = (numbers: readonly number[], found: SolidScriptValue): number[] => {
    const vector = solidScriptVectorOfNumbers(numbers);
    if (!vector) throw wrong(found);
    return vector.slice(0, size);
  };
  const numeric = (value: SolidScriptValue): value is number[] =>
    Array.isArray(value) && value.length > 0 && value.every((entry) => typeof entry === 'number');
  if (values.every((value) => typeof value === 'number')) return [fit(values as number[], [...values])];
  const points: number[][] = [];
  const three: THREE.Vector3[] = [];
  for (const value of values) {
    if (value instanceof SolidScriptPathElement) {
      if (size === 2) {
        if (!value.path.closed) throw new Error('this Path is open; turn on Closed to use it as a 2D shape');
        const sampled = solidScriptPathLoopOpen(
          solidScriptPathSample(value.path).map(([x = 0, y = 0, z = 0]) => new THREE.Vector3(x, y, z)),
        );
        for (const point of solidScriptPathFlat(sampled)) points.push(point);
      } else {
        for (const point of solidScriptPathSample(value.path)) points.push(fit(point, value));
      }
    } else if (numeric(value)) {
      if (value.length === 3) three.push(new THREE.Vector3(value[0], value[1], value[2]));
      points.push(fit(value, value));
    } else if (Array.isArray(value))
      for (const entry of value) {
        if (!numeric(entry)) throw wrong(entry);
        if (entry.length === 3) three.push(new THREE.Vector3(entry[0], entry[1], entry[2]));
        points.push(fit(entry, entry));
      }
    else throw wrong(value);
  }
  if (
    size === 2 &&
    points.length >= 3 &&
    three.length === points.length &&
    Math.abs(solidScriptPolygonArea(points as SolidScriptPoint2[])) <= 1e-12
  ) {
    const clean = solidScriptPathLoopOpen(three);
    if (clean.length >= 3) {
      const normal = new THREE.Vector3();
      clean.forEach((point, index) => {
        const next = clean[(index + 1) % clean.length]!;
        normal.x += (point.y - next.y) * (point.z + next.z);
        normal.y += (point.z - next.z) * (point.x + next.x);
        normal.z += (point.x - next.x) * (point.y + next.y);
      });
      if (normal.length() >= 1e-12) return solidScriptPathFlat(clean);
    }
  }
  return points;
}

/**
 * Reads a switch: Yes or No, or true or false.
 *
 * @param value Resolved value.
 * @returns Value.
 */
export function solidScriptFieldBoolean(value: SolidScriptValue): SolidScriptValue {
  if (typeof value !== 'string') return value;
  const text = value.trim().toLowerCase();
  if (text === 'yes' || text === 'true') return true;
  if (text === 'no' || text === 'false') return false;
  return value;
}

/**
 * Compiles the value of a Set line: a number, a list of numbers separated by
 * commas, Yes/No, or else the text as typed.
 *
 * @param text Field text.
 * @returns Compiled field.
 */
function solidScriptFieldAnyCompile(text: string): SolidScriptFieldCompiled {
  const whole = solidScriptFieldTemplateCompile(text);
  const items = solidScriptFieldSplit(text, ',');
  const list = items.length > 1 ? items.map(solidScriptFieldTemplateCompile) : null;
  return solidScriptFieldFolded(text, (context) => {
    if (list) {
      const values = list.map((item) => solidScriptFieldNumber(item(context)));
      // Numbers, or vectors such as [1, 2, 3], [4, 5, 6], make a list.
      const numeric = (value: SolidScriptValue): boolean =>
        typeof value === 'number' || (Array.isArray(value) && value.every((entry) => typeof entry === 'number'));
      if (values.every(numeric)) return values;
    }
    const value = whole(context);
    const number = solidScriptFieldNumber(value);
    if (typeof number === 'number') return number;
    return typeof value === 'string' ? solidScriptFieldBoolean(value) : value;
  });
}

/**
 * Compiles the text of one block field into a closure that reads its value.
 * Mistakes in the brackets are reported when the field is read.
 *
 * @param kind How the field reads its text.
 * @param text Field text.
 * @returns Compiled field.
 */
function solidScriptFieldCompile(kind: SolidScriptFieldKind, text: string): SolidScriptFieldCompiled {
  try {
    if (text.startsWith('\u0001')) return solidScriptFieldTemplateCompile(text.slice(1));
    switch (kind) {
      case 'number':
      case 'count': {
        const template = solidScriptFieldTemplateCompile(text);
        const constant = solidScriptFieldNumber(text);
        if (typeof constant === 'number' && !text.includes('[')) return () => constant;
        return (context) => solidScriptFieldNumber(template(context));
      }
      case 'vector2':
      case 'vector3':
        return solidScriptFieldVectorCompile(text);
      case 'points2':
      case 'points3': {
        if (text.trim() === '') return () => [];
        const size = kind === 'points2' ? 2 : 3;
        const items = solidScriptFieldSplit(text, ',').map(solidScriptFieldTemplateCompile);
        return (context) =>
          solidScriptFieldPoints(
            items.map((item) => solidScriptFieldNumber(item(context))),
            size,
          );
      }
      case 'boolean': {
        const template = solidScriptFieldTemplateCompile(text);
        return (context) => solidScriptFieldBoolean(template(context));
      }
      case 'condition':
        return solidScriptFieldGroupCompile([{ kind: 'plain', text: '=' }, ...solidScriptFieldPieces(text, true)]);
      case 'message': {
        const template = solidScriptFieldTemplateCompile(text);
        return (context) => solidScriptFieldMessage(template(context));
      }
      default:
        return solidScriptFieldAnyCompile(text);
    }
  } catch (error) {
    return () => {
      throw error;
    };
  }
}

/**
 * Turns the value of a message field into its text, keeping a Curve whole so a
 * Curve field gets the curve itself.
 *
 * @param value Resolved value.
 * @returns Text, or the Curve.
 */
export function solidScriptFieldMessage(value: SolidScriptValue): SolidScriptValue {
  return value instanceof SolidScriptCurveValue ? value : solidScriptValueText(value);
}

/**
 * Resolves the text of one block field into the value the block uses. Each kind
 * and text is compiled once and kept, so loops only run closures.
 *
 * @param kind How the field reads its text.
 * @param text Field text.
 * @param context Running script.
 * @returns Value.
 */
export function solidScriptFieldResolve(
  kind: SolidScriptFieldKind,
  text: string,
  context: SolidScriptFieldContext,
): SolidScriptValue {
  return solidScriptFieldCompiled(kind, text)(context);
}

/**
 * Returns the compiled closure of field text, compiling it on first use. A
 * running script keeps it per line, so a loop does not even look it up.
 *
 * @param kind How the field reads its text.
 * @param text Field text.
 * @returns Compiled field.
 */
export function solidScriptFieldCompiled(kind: SolidScriptFieldKind, text: string): SolidScriptFieldCompiled {
  const key = `${kind}\u0000${text}`;
  let compiled = solidScriptFieldCache.get(key);
  if (!compiled) {
    if (solidScriptFieldCache.size >= SOLID_SCRIPT_FIELD_CACHE_LIMIT) solidScriptFieldCache.clear();
    compiled = solidScriptFieldCompile(kind, text);
    solidScriptFieldCache.set(key, compiled);
  }
  return compiled;
}

/**
 * Compiles field text the way a lone bracketed part keeps its value and any
 * other text becomes text, before a field kind turns it into a number, a text
 * or points; cached like solidScriptFieldCompiled.
 *
 * @param text Field text.
 * @returns Compiled field.
 */
export function solidScriptFieldTemplate(text: string): SolidScriptFieldCompiled {
  return solidScriptFieldCompiled('value', `\u0001${text}`);
}

/**
 * Tells whether field text is one bracketed part alone, such as [Width] or
 * [=[A] + 1], whose value a field reads whole.
 *
 * @param text Field text.
 * @returns True when it is.
 */
export function solidScriptFieldLone(text: string): boolean {
  try {
    const pieces = solidScriptFieldPieces(text).filter((piece) => piece.kind === 'group' || piece.text.trim() !== '');
    return pieces.length === 1 && pieces[0]!.kind === 'group';
  } catch {
    return false;
  }
}

/**
 * Checks the brackets and escapes of field text without running it.
 *
 * @param text Field text.
 * @param formula True when the whole text is a formula, as a condition is.
 * @returns Problem, or an empty string.
 */
export function solidScriptFieldCheck(text: string, formula = false): string {
  const key = formula ? `=${text}` : text;
  const known = SOLID_SCRIPT_FIELD_CHECKED.get(key);
  if (known !== undefined) return known;
  const problem = solidScriptFieldCheckRead(text, formula);
  if (SOLID_SCRIPT_FIELD_CHECKED.size >= 20000) SOLID_SCRIPT_FIELD_CHECKED.clear();
  SOLID_SCRIPT_FIELD_CHECKED.set(key, problem);
  return problem;
}

/** Problems of field texts already checked, by text, with = before a formula. */
const SOLID_SCRIPT_FIELD_CHECKED = new Map<string, string>();

/**
 * Checks a field text without the cache.
 *
 * @param text Field text.
 * @param formula True when the whole text is a formula.
 * @returns Problem, or an empty string.
 */
function solidScriptFieldCheckRead(text: string, formula: boolean): string {
  let pieces: SolidScriptFieldPiece[];
  try {
    pieces = solidScriptFieldPieces(text);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  const lists = solidScriptFormulaListStarts(pieces, formula);
  const walk = (list: readonly SolidScriptFieldPiece[]): string => {
    for (const piece of list) {
      if (piece.kind === 'plain') continue;
      const problem = lists.has(piece.from) ? '' : solidScriptFieldNameProblem(piece.pieces);
      if (problem) return problem;
      const inner = walk(piece.pieces);
      if (inner) return inner;
    }
    return '';
  };
  return walk(pieces);
}

/**
 * Checks the contents of a bracketed part that names a variable: two or three
 * numbers are a vector, text that starts like a number must be one, and a
 * dotted name must read a member.
 *
 * @param pieces Contents of the brackets.
 * @returns Problem, or an empty string.
 */
function solidScriptFieldNameProblem(pieces: readonly SolidScriptFieldPiece[]): string {
  const first = pieces[0];
  const formula = first?.kind === 'plain' && first.text.trimStart().startsWith('=');
  if (formula || !pieces.every((inner) => inner.kind === 'plain')) return '';
  const text = pieces.map((inner) => (inner.kind === 'plain' ? inner.text : '')).join('');
  if (solidScriptFieldVectorRead(text)) return '';
  return solidScriptFieldVectorProblem(text) || solidScriptNameDotProblem(text, 'read');
}

/**
 * Returns whether field text is one variable alone, such as [width].
 *
 * @param text Field text.
 * @returns True for a lone variable.
 */
export function solidScriptFieldIsVariable(text: string): boolean {
  return /^\[\s*\$?[A-Za-z_]\w*(\.[A-Za-z_]\w*)*(\s*\([^[\]]*\)(\s*\.\s*\w+)*)?\s*\]$/.test(text.trim());
}

/**
 * Points out a vector field that reads a built-in number such as [$Box.Width]:
 * it works, every axis gets the number, but it is often meant as a vector.
 *
 * @param text Field text.
 * @returns Note, or an empty string.
 */
export function solidScriptFieldVectorNote(text: string): string {
  const named = /^\[\s*(\$?[A-Za-z_][\w.]*)\s*\]$/.exec(text.trim())?.[1];
  if (named === undefined || solidScriptSystemIsVector(named) !== false) return '';
  return `[${named}] is a number, not a vector; every axis gets it`;
}

/**
 * Tells whether a field is used exactly as typed: a field that declares
 * `writes`, because it names a variable a line writes or defines a name or a
 * setting read before the run, and a verbatim field, such as the text of a
 * Note, which is plain words. Every other field reads its [names] and
 * [=formulas]; the runtime, the checks, the squiggles and the suggestions all
 * ask this one question, so no field can skip resolution by its type.
 *
 * @param field Field as its command declares it.
 * @returns True when the field is used as typed.
 */
export function solidScriptFieldAsTyped(field: { readonly writes?: object; readonly verbatim?: boolean }): boolean {
  return field.writes !== undefined || field.verbatim === true;
}
