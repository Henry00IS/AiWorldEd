import type { SolidScriptExpression } from './solid_script_ast.js';
import {
  solidScriptExpressionCompiled,
  solidScriptSlotNode,
  type SolidScriptCompiled,
  type SolidScriptSlotFrame,
} from './solid_script_expression_compile.js';
import type { SolidScriptFieldCompiled, SolidScriptFieldContext, SolidScriptFieldPiece } from './solid_script_field.js';
import {
  solidScriptFormulaBareMessage,
  solidScriptFormulaBareReads,
  type SolidScriptFormulaBareRead,
} from './solid_script_formula_bare.js';
import { solidScriptFormulaListInline } from './solid_script_formula_list_literal.js';
import { solidScriptStringEscapes, solidScriptStringWrite } from './solid_script_lexer.js';
import { solidScriptNameKey } from './solid_script_name_key.js';
import { solidScriptValueText, type SolidScriptValue } from './solid_script_value.js';

/** Start of the names that stand for bracketed parts while a formula is parsed. */
const SOLID_SCRIPT_FIELD_SLOT = '__field_slot_';

/** A bracketed part of field text, with where its brackets stand. */
type SolidScriptFieldGroup = Extract<SolidScriptFieldPiece, { kind: 'group' }>;

/**
 * Writes a value so a formula reads it back unchanged.
 *
 * @param value Value.
 * @returns Formula text.
 */
function solidScriptFieldFormulaText(value: SolidScriptValue): string {
  if (typeof value === 'string') return solidScriptStringWrite(value);
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
 * A quoted text being written into a formula: where its quote stands and
 * whether it holds a bracketed part.
 */
interface SolidScriptFieldQuote {
  open: number;
  joined: boolean;
}

/**
 * A formula being written: the text so far and the quoted text it is in, if
 * any.
 */
interface SolidScriptFieldWriting {
  written: string;
  quote: SolidScriptFieldQuote | null;
}

/**
 * Writes the pieces of a formula part as the formula reads them: each list in
 * brackets as written, with the parts inside it written the same way, and each
 * other bracketed part as what a callback gives for it. A bracketed part inside
 * quoted text is read into the text, so "Width [W]" is written Str("Width ", W,
 * "").
 *
 * @param pieces Contents of the brackets.
 * @param part Writes one bracketed part that is no list, in the order they
 *   stand.
 * @returns Formula text.
 */
function solidScriptFieldFormulaWrite(
  pieces: readonly SolidScriptFieldPiece[],
  part: (group: SolidScriptFieldGroup) => string,
): string {
  const writing: SolidScriptFieldWriting = { written: '', quote: null };
  solidScriptFieldFormulaWriteInto(pieces, part, writing);
  return writing.written;
}

/**
 * Writes pieces of a formula part onto a formula being written.
 *
 * @param pieces Pieces.
 * @param part Writes one bracketed part that is no list.
 * @param writing Formula being written.
 */
function solidScriptFieldFormulaWriteInto(
  pieces: readonly SolidScriptFieldPiece[],
  part: (group: SolidScriptFieldGroup) => string,
  writing: SolidScriptFieldWriting,
): void {
  for (const piece of pieces) {
    if (piece.kind === 'plain') solidScriptFieldFormulaPlain(piece.text, writing);
    else if (writing.quote) solidScriptFieldFormulaQuoted(part(piece), writing);
    else if (!solidScriptFormulaListInline(piece)) writing.written += part(piece);
    else {
      writing.written += '[';
      solidScriptFieldFormulaWriteInto(piece.pieces, part, writing);
      writing.written += ']';
    }
  }
}

/**
 * Writes plain formula text, following where quoted text opens and closes; an
 * escape inside quoted text, such as $" or $$, stays for the formula string.
 *
 * @param text Plain text.
 * @param writing Formula being written.
 */
function solidScriptFieldFormulaPlain(text: string, writing: SolidScriptFieldWriting): void {
  for (let index = 0; index < text.length; index++) {
    const character = text[index]!;
    const next = text[index + 1];
    if (writing.quote && solidScriptStringEscapes(text, index)) {
      writing.written += character + next;
      index++;
      continue;
    }
    writing.written += character;
    if (character !== '"') continue;
    if (!writing.quote) writing.quote = { open: writing.written.length - 1, joined: false };
    else {
      if (writing.quote.joined) writing.written += ')';
      writing.quote = null;
    }
  }
}

/**
 * Writes a bracketed part that stands inside quoted text: the text is ended
 * there and goes on after the part, all joined by Str.
 *
 * @param text The part as the formula reads it.
 * @param writing Formula being written, inside quoted text.
 */
function solidScriptFieldFormulaQuoted(text: string, writing: SolidScriptFieldWriting): void {
  const quote = writing.quote!;
  if (!quote.joined) {
    writing.written = `${writing.written.slice(0, quote.open)}Str(${writing.written.slice(quote.open)}`;
    quote.open += 4;
    quote.joined = true;
  }
  writing.written += `", ${text}, "`;
}

/**
 * Compiles a formula part, [=...]: the formula is parsed once with a slot for
 * every bracketed part inside it, so running it only reads those parts and
 * evaluates the tree. A formula that cannot be parsed that way is put together
 * as text on every run, like it is written, so its message shows the values.
 *
 * @param pieces Contents of the brackets.
 * @param compileGroup Compiles one bracketed part inside it.
 * @returns Compiled part.
 */
export function solidScriptFieldFormulaCompile(
  pieces: readonly SolidScriptFieldPiece[],
  compileGroup: (pieces: readonly SolidScriptFieldPiece[]) => SolidScriptFieldCompiled,
): SolidScriptFieldCompiled {
  const groups: SolidScriptFieldCompiled[] = [];
  const written = solidScriptFieldFormulaWrite(pieces, (group) => {
    groups.push(compileGroup(group.pieces));
    return ` ${SOLID_SCRIPT_FIELD_SLOT}${groups.length - 1} `;
  });
  const body = written.trimStart().slice(1).trim();
  if (body === '')
    return () => {
      throw new Error('[=] has no formula after the =; write one, such as [=1 + 2], or leave the field empty');
    };
  const slow: SolidScriptFieldCompiled = (context) => {
    let slot = 0;
    const inner = solidScriptFieldFormulaWrite(pieces, () => solidScriptFieldFormulaText(groups[slot++]!(context)));
    return context.formula(inner.trimStart().slice(1).trim());
  };
  return solidScriptFieldFormulaRun(body, groups, slow);
}

/**
 * Runs a formula part: parses it on its first run, stops on a name written
 * without brackets, and then reads its bracketed parts into their slots and
 * evaluates the tree, or puts it together as text when it cannot be parsed.
 *
 * @param body Formula with a slot name for each bracketed part.
 * @param groups Compiled bracketed parts, by slot.
 * @param slow Puts the formula together as text and computes it.
 * @returns Compiled part.
 */
function solidScriptFieldFormulaRun(
  body: string,
  groups: readonly SolidScriptFieldCompiled[],
  slow: SolidScriptFieldCompiled,
): SolidScriptFieldCompiled {
  const frame: SolidScriptSlotFrame = { values: [] };
  let parsed: SolidScriptCompiled | null | undefined;
  let bare: SolidScriptFormulaBareRead | undefined;
  return (context) => {
    if (parsed === undefined) {
      const tree = context.formulaParse(body);
      bare = tree ? solidScriptFormulaBareReads(tree, solidScriptFieldSlotIs)[0] : undefined;
      parsed = tree ? solidScriptExpressionCompiled(solidScriptFieldSlots(tree, frame)) : null;
    }
    if (bare) throw new Error(solidScriptFormulaBareMessage(bare, solidScriptFieldKnown(context)));
    if (parsed === null) return slow(context);
    return solidScriptFieldSlotsRun(parsed, groups, frame, context);
  };
}

/**
 * Tells whether a name of a parsed formula stands for a bracketed part.
 *
 * @param node Part of the formula.
 * @returns True for such a name.
 */
function solidScriptFieldSlotIs(node: SolidScriptExpression): boolean {
  return node.kind === 'variable' && node.name.startsWith(SOLID_SCRIPT_FIELD_SLOT);
}

/**
 * Tells whether the running script has a variable of a name.
 *
 * @param context Running script.
 * @returns Test of one name.
 */
function solidScriptFieldKnown(context: SolidScriptFieldContext): (name: string) => boolean {
  return (name) => {
    try {
      context.variable(solidScriptNameKey(name));
      return true;
    } catch {
      return false;
    }
  };
}

/**
 * Reads the bracketed parts of a formula into its slots and evaluates it.
 *
 * @param parsed Compiled formula.
 * @param groups Compiled bracketed parts, by slot.
 * @param frame Frame the slots read their values from.
 * @param context Running script.
 * @returns Value.
 */
function solidScriptFieldSlotsRun(
  parsed: SolidScriptCompiled,
  groups: readonly SolidScriptFieldCompiled[],
  frame: SolidScriptSlotFrame,
  context: SolidScriptFieldContext,
): SolidScriptValue {
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
}
