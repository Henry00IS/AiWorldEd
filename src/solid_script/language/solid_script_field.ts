import type { SolidScriptExpression } from './solid_script_ast.js';
import {
  solidScriptExpressionCompiled,
  solidScriptSlotNode,
  type SolidScriptCompiled,
  type SolidScriptSlotFrame,
} from './solid_script_expression_compile.js';
import { solidScriptNameDotProblem } from './solid_script_name_rules.js';
import type { SolidScriptValue } from './solid_script_value.js';
import { solidScriptValueText } from './solid_script_value.js';
import { solidScriptNameKey } from './solid_script_name_key.js';

/**
 * How the text typed into a block field is read. Field text is plain text
 * without quotes: [name] puts in the value of a variable, [=formula] the result
 * of a formula, and $ before a character keeps it as typed, so $[ and $] write
 * brackets and $$ a dollar sign. Brackets may nest, so a variable name or a
 * formula can itself be built from variables.
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
   * Returns one part of a vector variable such as pos.x, as variable() does.
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
type SolidScriptFieldPiece = { kind: 'plain'; text: string } | { kind: 'group'; pieces: SolidScriptFieldPiece[] };

/** A plain variable name, such as width. */
const SOLID_SCRIPT_FIELD_NAME_PLAIN = /^[A-Za-z_]\w*$/;

/** A Function's own variable, such as local.n. */
const SOLID_SCRIPT_FIELD_NAME_LOCAL = /^local\.([A-Za-z_]\w*)$/;

/** A part of a vector variable, such as pos.x. */
const SOLID_SCRIPT_FIELD_NAME_COMPONENT = /^([A-Za-z_]\w*)\.([xyzXYZ])$/;

/** Text before the item number of a list item, such as "points(". */
const SOLID_SCRIPT_FIELD_ITEM_OPEN = /^\s*([A-Za-z_]\w*)\s*\(\s*$/;

/** Text after the item number of a list item. */
const SOLID_SCRIPT_FIELD_ITEM_CLOSE = /^\s*\)\s*$/;

/** Field kinds whose text is used exactly as typed. */
const SOLID_SCRIPT_FIELD_KINDS_RAW: ReadonlySet<SolidScriptFieldKind> = new Set(['name', 'target', 'text']);

/**
 * Splits field text into plain characters and bracketed parts.
 *
 * @param text Field text.
 * @returns Pieces.
 */
function solidScriptFieldPieces(text: string): SolidScriptFieldPiece[] {
  const root: SolidScriptFieldPiece[] = [];
  const open: SolidScriptFieldPiece[][] = [root];
  const plain = (character: string): void => {
    const into = open[open.length - 1]!;
    const last = into[into.length - 1];
    if (last?.kind === 'plain') last.text += character;
    else into.push({ kind: 'plain', text: character });
  };
  for (let index = 0; index < text.length; index++) {
    const character = text[index]!;
    if (character === '$') {
      const next = text[index + 1];
      if (next === undefined) throw new Error('a $ at the end has nothing to keep; write $$ for a dollar sign');
      plain(next);
      index++;
    } else if (character === '[') {
      const group: SolidScriptFieldPiece = { kind: 'group', pieces: [] };
      open[open.length - 1]!.push(group);
      open.push(group.pieces);
    } else if (character === ']') {
      if (open.length === 1) throw new Error('a ] has no [ before it; write $] for a bracket');
      open.pop();
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
      throw new Error('[=] has no formula after the =');
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
    const name = inner.trim();
    return name === '' ? empty() : context.variable(solidScriptNameKey(name));
  };
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
    if (character === '$') index++;
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
 * Reads a switch: Yes or No, or true or false.
 *
 * @param value Resolved value.
 * @returns Value.
 */
function solidScriptFieldBoolean(value: SolidScriptValue): SolidScriptValue {
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
  return (context) => {
    if (list) {
      const values = list.map((item) => solidScriptFieldNumber(item(context)));
      if (values.every((value) => typeof value === 'number')) return values;
    }
    const value = whole(context);
    const number = solidScriptFieldNumber(value);
    if (typeof number === 'number') return number;
    return typeof value === 'string' ? solidScriptFieldBoolean(value) : value;
  };
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
  if (SOLID_SCRIPT_FIELD_KINDS_RAW.has(kind)) return () => text;
  try {
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
        const points = solidScriptFieldSplit(text, ';').map(solidScriptFieldVectorCompile);
        if (points.length === 1) return points[0]!;
        return (context) => points.map((point) => point(context));
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
        const problem = solidScriptNameDotProblem(
          piece.pieces.map((inner) => (inner.kind === 'plain' ? inner.text : '')).join(''),
          'read',
        );
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
