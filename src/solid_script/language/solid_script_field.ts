import type { SolidScriptExpression } from './solid_script_ast.js';
import {
  solidScriptExpressionCompiled,
  solidScriptSlotNode,
  type SolidScriptCompiled,
  type SolidScriptSlotFrame,
} from './solid_script_expression_compile.js';
import { solidScriptNameDotProblem, solidScriptSystemIsVector } from './solid_script_name_rules.js';
import type { SolidScriptValue } from './solid_script_value.js';
import { solidScriptValueText } from './solid_script_value.js';
import { solidScriptNameKey } from './solid_script_name_key.js';

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
   * @param bare Name after local.
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

/** Start of the names that stand for bracketed parts while a formula is parsed. */
const SOLID_SCRIPT_FIELD_SLOT = '__field_slot_';

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

/** A Function's own variable, such as local.n. */
const SOLID_SCRIPT_FIELD_NAME_LOCAL = /^local\.([A-Za-z_]\w*)$/;

/** A part of a vector variable, such as Pos.X. */
const SOLID_SCRIPT_FIELD_NAME_COMPONENT = /^([A-Za-z_]\w*)\.([xyzXYZ])$/;

/** Text before the item number of a list item, such as "points(". */
const SOLID_SCRIPT_FIELD_ITEM_OPEN = /^\s*([A-Za-z_]\w*)\s*\(\s*$/;

/** Text after the item number of a list item. */
const SOLID_SCRIPT_FIELD_ITEM_CLOSE = /^\s*\)\s*$/;

/**
 * Characters a $ keeps as typed: $$, $[, $] and $, for a comma inside a list
 * item. A $ before anything else is itself, as in [$Selected.Faces].
 */
const SOLID_SCRIPT_FIELD_ESCAPED: ReadonlySet<string> = new Set(['$', '[', ']', ',']);

/**
 * Tells whether the character at a place is a $ that keeps the next one as
 * typed: $$, $[, $] or $,.
 *
 * @param text Field text.
 * @param index Place.
 * @returns True for such a $.
 */
export function solidScriptFieldEscapes(text: string, index: number): boolean {
  return text[index] === '$' && SOLID_SCRIPT_FIELD_ESCAPED.has(text[index + 1] ?? '');
}

/**
 * Splits field text into plain characters and bracketed parts; each part knows
 * where its brackets stand in the text.
 *
 * @param text Field text.
 * @returns Pieces.
 */
export function solidScriptFieldPieces(text: string): SolidScriptFieldPiece[] {
  const root: SolidScriptFieldPiece[] = [];
  const open: SolidScriptFieldPiece[][] = [root];
  const groups: SolidScriptFieldGroup[] = [];
  const plain = (character: string): void => {
    const into = open[open.length - 1]!;
    const last = into[into.length - 1];
    if (last?.kind === 'plain') last.text += character;
    else into.push({ kind: 'plain', text: character });
  };
  for (let index = 0; index < text.length; index++) {
    const character = text[index]!;
    if (solidScriptFieldEscapes(text, index)) {
      plain(text[index + 1]!);
      index++;
    } else if (character === '[') {
      groups.push({ kind: 'group', pieces: [], from: index, to: -1 });
      open[open.length - 1]!.push(groups[groups.length - 1]!);
      open.push(groups[groups.length - 1]!.pieces);
    } else if (character === ']') {
      if (open.length === 1) throw new Error('a ] has no [ before it; write $] for a bracket');
      open.pop();
      groups.pop()!.to = index + 1;
    } else plain(character);
  }
  if (open.length > 1) throw new Error('a [ has no ] after it; write $[ for a bracket');
  return root;
}

/**
 * Writes a value so a formula reads it back unchanged.
 *
 * @param value Value.
 * @returns Formula text.
 */
function solidScriptFieldFormulaText(value: SolidScriptValue): string {
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') return value < 0 ? `(${value})` : String(value);
  if (Array.isArray(value)) return `[${value.map(solidScriptFieldFormulaText).join(', ')}]`;
  if (typeof value === 'boolean') return value ? 'True' : 'False';
  return solidScriptValueText(value);
}

/**
 * Puts slot nodes in place of the names that stand for bracketed parts.
 *
 * @param expression Parsed formula.
 * @param frame Frame the slots read their values from.
 * @returns Formula reading slots.
 */
function solidScriptFieldSlots(expression: SolidScriptExpression, frame: SolidScriptSlotFrame): SolidScriptExpression {
  const walk = (node: SolidScriptExpression): SolidScriptExpression => {
    switch (node.kind) {
      case 'variable':
        return node.name.startsWith(SOLID_SCRIPT_FIELD_SLOT)
          ? solidScriptSlotNode(Number(node.name.slice(SOLID_SCRIPT_FIELD_SLOT.length)), frame)
          : node;
      case 'vector':
        return { ...node, items: node.items.map(walk) };
      case 'comprehension':
        return {
          ...node,
          bindings: node.bindings.map((binding) => ({ ...binding, value: walk(binding.value) })),
          body: walk(node.body),
        };
      case 'range':
        return { ...node, start: walk(node.start), step: node.step ? walk(node.step) : null, end: walk(node.end) };
      case 'unary':
        return { ...node, operand: walk(node.operand) };
      case 'binary':
        return { ...node, left: walk(node.left), right: walk(node.right) };
      case 'ternary':
        return {
          ...node,
          condition: walk(node.condition),
          whenTrue: walk(node.whenTrue),
          whenFalse: walk(node.whenFalse),
        };
      case 'call':
        return { ...node, args: node.args.map((arg) => ({ ...arg, value: walk(arg.value) })) };
      case 'index':
        return { ...node, target: walk(node.target), index: walk(node.index) };
      case 'member':
        return { ...node, target: walk(node.target) };
      default:
        return node;
    }
  };
  return walk(expression);
}

/**
 * Compiles a formula part, [=...]: the formula is parsed once with a slot for
 * every bracketed part inside it, so running it only reads those parts and
 * evaluates the tree. A formula that cannot be parsed that way is put together
 * as text on every run, like it is written, so its message shows the values.
 *
 * @param pieces Contents of the brackets.
 * @returns Compiled part.
 */
function solidScriptFieldFormulaCompile(pieces: readonly SolidScriptFieldPiece[]): SolidScriptFieldCompiled {
  const groups: SolidScriptFieldCompiled[] = [];
  let written = '';
  for (const piece of pieces) {
    if (piece.kind === 'plain') written += piece.text;
    else {
      written += ` ${SOLID_SCRIPT_FIELD_SLOT}${groups.length} `;
      groups.push(solidScriptFieldGroupCompile(piece.pieces));
    }
  }
  const body = written.trimStart().slice(1).trim();
  if (body === '')
    return () => {
      throw new Error('[=] has no formula after the =; write one, such as [=1 + 2], or leave the field empty');
    };
  const slow: SolidScriptFieldCompiled = (context) => {
    let inner = '';
    let slot = 0;
    for (const piece of pieces)
      inner += piece.kind === 'plain' ? piece.text : solidScriptFieldFormulaText(groups[slot++]!(context));
    return context.formula(inner.trimStart().slice(1).trim());
  };
  const frame: SolidScriptSlotFrame = { values: [] };
  let parsed: SolidScriptCompiled | null | undefined;
  return (context) => {
    if (parsed === undefined) {
      const tree = context.formulaParse(body);
      parsed = tree ? solidScriptExpressionCompiled(solidScriptFieldSlots(tree, frame)) : null;
    }
    if (parsed === null) return slow(context);
    if (groups.length === 0) return context.formulaRun(parsed);
    const slots = new Array<SolidScriptValue>(groups.length);
    for (let index = 0; index < groups.length; index++) slots[index] = groups[index]!(context);
    const outer = frame.values;
    frame.values = slots;
    try {
      return context.formulaRun(parsed);
    } finally {
      frame.values = outer;
    }
  };
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
  if (first?.kind === 'plain' && first.text.trimStart().startsWith('=')) return solidScriptFieldFormulaCompile(pieces);
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

/** Three items separated by commas, such as 20, 30, 10: a vector in brackets. */
const SOLID_SCRIPT_FIELD_VECTOR = /^([^,]+),([^,]+),([^,]+)$/;

/** Start of bracket text no name has: a digit, a minus or a dot. */
const SOLID_SCRIPT_FIELD_NUMBER_START = /^\s*[-.\d]/;

/**
 * Reads the text of a bracket, with its inner brackets already put in, as a
 * vector when it is exactly three numbers, such as [20, 30, 10].
 *
 * @param text Bracket text.
 * @returns Vector, or null when it is not three numbers.
 */
function solidScriptFieldVectorRead(text: string): number[] | null {
  const parts = SOLID_SCRIPT_FIELD_VECTOR.exec(text);
  if (!parts) return null;
  const vector = parts.slice(1).map((part) => (part.trim() === '' ? NaN : Number(part)));
  return vector.every(Number.isFinite) ? vector : null;
}

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
    return `[${inner}] is not a vector: a vector in brackets needs exactly 3 numbers, such as [1, 2, 3]. Did you mean to write ${items.filter((item) => item !== '').join(', ')}?`;
  const written = items.filter((item) => item !== '');
  const numbers = written.every((item) => Number.isFinite(Number(item)));
  // Missing numbers are filled in with 0, so [3,] means [3, 0, 0].
  const padded = [...written, '0', '0', '0'].slice(0, 3);
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
  return `[${inner}] is not a vector: a vector in brackets needs exactly 3 numbers, such as [1, 2, 3]. Did you mean to write ${meant}?`;
}

/**
 * Reads bracket text once its inner brackets are put in: three numbers are a
 * vector, anything else names a variable.
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
      items.push(text.slice(start, index).trim());
      start = index + 1;
    }
  }
  items.push(text.slice(start).trim());
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
      pieces.push(text.slice(start, index).trim());
      start = index + 1;
    }
  }
  pieces.push(text.slice(start).trim());
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
 * a list of them such as [Path], or one point as plain numbers. Flat outlines
 * take x and y and ignore z.
 *
 * @param values Items of the field, each read.
 * @param size 2 for x, y outlines, 3 for x, y, z points.
 * @returns Points.
 */
export function solidScriptFieldPoints(values: readonly SolidScriptValue[], size: 2 | 3): number[][] {
  const example = size === 3 ? '[0, 0, 0], [1, 0, 0]' : '[0, 0, 0], [1, 0, 0] (z is ignored)';
  const wrong = (found: SolidScriptValue): Error =>
    new Error(`${solidScriptValueText(found)} is no point; write points as vectors in brackets, such as ${example}`);
  const fit = (numbers: readonly number[], found: SolidScriptValue): number[] => {
    if (numbers.length === size || (size === 2 && numbers.length === 3)) return numbers.slice(0, size);
    throw wrong(found);
  };
  const numeric = (value: SolidScriptValue): value is number[] =>
    Array.isArray(value) && value.length > 0 && value.every((entry) => typeof entry === 'number');
  if (values.every((value) => typeof value === 'number')) return [fit(values as number[], [...values])];
  const points: number[][] = [];
  for (const value of values) {
    if (numeric(value)) points.push(fit(value, value));
    else if (Array.isArray(value))
      for (const entry of value) {
        if (!numeric(entry)) throw wrong(entry);
        points.push(fit(entry, entry));
      }
    else throw wrong(value);
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
        return solidScriptFieldGroupCompile([{ kind: 'plain', text: '=' }, ...solidScriptFieldPieces(text)]);
      case 'message': {
        const template = solidScriptFieldTemplateCompile(text);
        return (context) => solidScriptValueText(template(context));
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
 * @returns Problem, or an empty string.
 */
export function solidScriptFieldCheck(text: string): string {
  const known = SOLID_SCRIPT_FIELD_CHECKED.get(text);
  if (known !== undefined) return known;
  const problem = solidScriptFieldCheckRead(text);
  if (SOLID_SCRIPT_FIELD_CHECKED.size >= 20000) SOLID_SCRIPT_FIELD_CHECKED.clear();
  SOLID_SCRIPT_FIELD_CHECKED.set(text, problem);
  return problem;
}

/** Problems of field texts already checked, by text. */
const SOLID_SCRIPT_FIELD_CHECKED = new Map<string, string>();

/**
 * Checks a field text without the cache.
 *
 * @param text Field text.
 * @returns Problem, or an empty string.
 */
function solidScriptFieldCheckRead(text: string): string {
  let pieces: SolidScriptFieldPiece[];
  try {
    pieces = solidScriptFieldPieces(text);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  const walk = (list: readonly SolidScriptFieldPiece[]): string => {
    for (const piece of list) {
      if (piece.kind === 'plain') continue;
      const first = piece.pieces[0];
      const formula = first?.kind === 'plain' && first.text.trimStart().startsWith('=');
      if (!formula && piece.pieces.every((inner) => inner.kind === 'plain')) {
        const text = piece.pieces.map((inner) => (inner.kind === 'plain' ? inner.text : '')).join('');
        if (solidScriptFieldVectorRead(text)) continue;
        const problem = solidScriptFieldVectorProblem(text) || solidScriptNameDotProblem(text, 'read');
        if (problem) return problem;
      }
      const inner = walk(piece.pieces);
      if (inner) return inner;
    }
    return '';
  };
  return walk(pieces);
}

/**
 * Returns whether field text is one variable alone, such as [width].
 *
 * @param text Field text.
 * @returns True for a lone variable.
 */
export function solidScriptFieldIsVariable(text: string): boolean {
  return /^\[\s*(local\.|persistent\.)?[A-Za-z_]\w*(\.[A-Za-z_]\w*)?(\.[xyzXYZ])?(\s*\([^[\]]*\)(\s*\.\s*\w+)?)?\s*\]$/.test(
    text.trim(),
  );
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
 * Tells whether a field is used exactly as typed: only a field that declares
 * `writes`, because it names a variable a line writes or defines a name or a
 * setting read before the run. Every other field reads its [names] and
 * [=formulas]; the runtime, the checks, the squiggles and the suggestions all
 * ask this one question, so no field can skip resolution by its type.
 *
 * @param field Field as its command declares it.
 * @returns True when the field is used as typed.
 */
export function solidScriptFieldAsTyped(field: { readonly writes?: object }): boolean {
  return field.writes !== undefined;
}
