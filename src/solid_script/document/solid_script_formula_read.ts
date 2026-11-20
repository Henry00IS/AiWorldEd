import type { SolidScriptExpression } from '@/solid_script/language/solid_script_ast.js';
import type { SolidScriptCommandCatalog } from '@/solid_script/commands/solid_script_command_catalog_base.js';
import {
  SOLID_SCRIPT_FORMULA_CHECK,
  SOLID_SCRIPT_FORMULA_COMMAND,
  SOLID_SCRIPT_FORMULA_FUNCTION,
  solidScriptFormulaCatalog,
} from '@/solid_script/commands/solid_script_formula_commands.js';
import { SOLID_SCRIPT_COMMAND_END } from '@/solid_script/commands/solid_script_commands_logic.js';
import {
  solidScriptFormulaCheckInputs,
  type SolidScriptFormulaContext,
} from '@/solid_script/commands/solid_script_formula_inputs.js';
import {
  solidScriptFormulaGroupOf,
  solidScriptFormulaOperatorBlock,
} from '@/solid_script/commands/solid_script_formula_groups.js';
import { solidScriptBuiltinFind } from '@/solid_script/language/solid_script_expression_compile.js';
import { SOLID_SCRIPT_FUNCTION_DOCS } from '@/solid_script/language/solid_script_function_docs.js';
import { solidScriptFormulaShown } from '@/solid_script/language/solid_script_formula_field.js';
import {
  SolidScriptFormulaSource,
  type SolidScriptFormulaSpan,
} from '@/solid_script/language/solid_script_formula_source.js';
import {
  SOLID_SCRIPT_DOCUMENT_VERSION,
  solidScriptBlockCreate,
  type SolidScriptBlock,
  type SolidScriptDocument,
} from './solid_script_document.js';

/**
 * Lines inside one part of a group, such as the Then of an If, and where each
 * stood.
 */
export interface SolidScriptFormulaSection {
  /** Ids of the first line of each block inside. */
  ids: string[];
  /** Where each block stood in the group's text. */
  spans: SolidScriptFormulaSpan[];
}

/** How a block was typed, so it is written back exactly while it is unchanged. */
export interface SolidScriptFormulaOrigin {
  /** Command id. */
  command: string;
  /** Text of the block as typed, with its parentheses. */
  text: string;
  /** Values as its fields showed them. */
  values: Record<string, string>;
  /** Formula of each field as typed. */
  formulas: Record<string, string>;
  /** Name of a check or function as typed, such as inbox. */
  name: string;
  /** Blocks inside a group, per part. */
  sections: SolidScriptFormulaSection[];
}

/** Blocks of a formula with how each was typed. */
export interface SolidScriptFormulaBlocks {
  /** Lines in order. */
  document: SolidScriptDocument;
  /** How each block was typed, by the id of its first line. */
  origins: Map<string, SolidScriptFormulaOrigin>;
  /** How the formula as a whole was typed. */
  root: SolidScriptFormulaOrigin;
}

/** What a block that is no group was read as. */
type SolidScriptFormulaLeaf = Pick<SolidScriptFormulaOrigin, 'command' | 'values' | 'formulas' | 'name'>;

/** A group a part was read as, with the parts of each of its sections. */
interface SolidScriptFormulaGrouped {
  /** Group command id. */
  command: string;
  /** Parts of each section. */
  parts: SolidScriptExpression[][];
  /** Name of a function as typed. */
  name: string;
}

/** Value blocks tried in turn, each with how it shows a formula it holds. */
const SOLID_SCRIPT_FORMULA_SHOWN: readonly { command: string; kind: 'vector' | 'variable' }[] = [
  { command: SOLID_SCRIPT_FORMULA_COMMAND.vector, kind: 'vector' },
  { command: SOLID_SCRIPT_FORMULA_COMMAND.variable, kind: 'variable' },
];

/** Turns a read formula into lines. */
class SolidScriptFormulaReader {
  readonly blocks: SolidScriptBlock[] = [];
  readonly origins = new Map<string, SolidScriptFormulaOrigin>();

  /**
   * Creates the reader.
   *
   * @param source Formula read with its spans.
   * @param catalog Blocks of the formula.
   * @param context Where the formula is used.
   */
  constructor(
    private readonly source: SolidScriptFormulaSource,
    private readonly catalog: SolidScriptCommandCatalog,
    private readonly context: SolidScriptFormulaContext,
  ) {}

  /**
   * Lists the parts an operator joins without parentheses, so a && b && c is
   * three parts of one And.
   *
   * @param node Part.
   * @param operator Operator, such as &&.
   * @returns Parts in order.
   */
  parts(node: SolidScriptExpression, operator: string): SolidScriptExpression[] {
    if (node.kind !== 'binary' || node.operator !== operator) return [node];
    const side = (part: SolidScriptExpression): SolidScriptExpression[] =>
      this.source.parenthesized(part) ? [part] : this.parts(part, operator);
    return [...side(node.left), ...side(node.right)];
  }

  /**
   * Adds the lines of the parts of a group.
   *
   * @param nodes Parts.
   * @param base Where the group's text starts.
   * @returns Section.
   */
  section(nodes: readonly SolidScriptExpression[], base: number): SolidScriptFormulaSection {
    const ids = nodes.map((node) => this.node(node));
    const spans = nodes.map((node) => {
      const outer = this.source.outer(node);
      return { from: outer.from - base, to: outer.to - base };
    });
    return { ids, spans };
  }

  /**
   * Adds the lines of one part and remembers how it was typed.
   *
   * @param node Part.
   * @returns Id of its first line.
   */
  node(node: SolidScriptExpression): string {
    const value = this.value(node);
    const group = value ? null : this.group(node);
    if (group) return this.groupAdd(node, group);
    const leaf =
      value ??
      this.check(node) ??
      this.leaf(SOLID_SCRIPT_FORMULA_COMMAND.value, this.text(node), this.source.slice(node));
    const block = this.add(leaf.command, leaf.values);
    this.origins.set(block.id, { ...leaf, text: this.text(node), sections: [] });
    return block.id;
  }

  /**
   * Tells which group block a part is: an operator, Not, Negative, If, a List
   * such as $[1, 2$] or a function with a block per input.
   *
   * @param node Part.
   * @returns Group, or null for a part that is no group.
   */
  group(node: SolidScriptExpression): SolidScriptFormulaGrouped | null {
    if (node.kind === 'binary') {
      const command = solidScriptFormulaOperatorBlock(node.operator, false);
      return command ? { command, parts: [this.parts(node, node.operator)], name: '' } : null;
    }
    if (node.kind === 'unary') {
      const command = solidScriptFormulaOperatorBlock(node.operator, true);
      return command ? { command, parts: [[node.operand]], name: '' } : null;
    }
    if (node.kind === 'ternary') {
      const parts = [[node.condition], [node.whenTrue], [node.whenFalse]];
      return { command: SOLID_SCRIPT_FORMULA_COMMAND.choose, parts, name: '' };
    }
    if (node.kind === 'vector' && node.items.length > 0)
      return { command: SOLID_SCRIPT_FORMULA_COMMAND.list, parts: [node.items], name: '' };
    return this.call(node);
  }

  /**
   * Tells which function block a call is, when it gives each input plainly; a
   * call with too few inputs still is, so the blocks name what is missing.
   *
   * @param node Part.
   * @returns Group, or null when no function block holds the call.
   */
  call(node: SolidScriptExpression): SolidScriptFormulaGrouped | null {
    if (node.kind !== 'call' || node.args.some((arg) => arg.name !== null)) return null;
    const command = `${SOLID_SCRIPT_FORMULA_FUNCTION}${solidScriptBuiltinFind(node.name) ?? ''}`;
    const group = solidScriptFormulaGroupOf(command);
    if (!group || node.args.length === 0 || node.args.length > group.max) return null;
    return { command, parts: [node.args.map((arg) => arg.value)], name: node.name };
  }

  /**
   * Adds the lines of a group: its line, its parts with Then and Else between
   * them, and its End.
   *
   * @param node Part.
   * @param group Group it was read as.
   * @returns Id of its first line.
   */
  groupAdd(node: SolidScriptExpression, group: SolidScriptFormulaGrouped): string {
    const block = this.add(group.command, {});
    const base = this.source.outer(node).from;
    const branches = [SOLID_SCRIPT_FORMULA_COMMAND.then, SOLID_SCRIPT_FORMULA_COMMAND.otherwise];
    const sections = group.parts.map((nodes, index) => {
      if (index > 0) this.add(branches[index - 1] ?? SOLID_SCRIPT_FORMULA_COMMAND.otherwise, {});
      return this.section(nodes, base);
    });
    this.add(SOLID_SCRIPT_COMMAND_END, {});
    const text = this.text(node);
    this.origins.set(block.id, { command: group.command, text, values: {}, formulas: {}, name: group.name, sections });
    return block.id;
  }

  /**
   * Tells which simple value block a part is: Text for words in quotes, Number
   * for a number, Vector for three numbers and Variable for a variable.
   *
   * @param node Part.
   * @returns Block, or null for any other part.
   */
  value(node: SolidScriptExpression): SolidScriptFormulaLeaf | null {
    const text = this.text(node);
    const inner = this.source.slice(node);
    if (node.kind === 'string')
      return this.leaf(SOLID_SCRIPT_FORMULA_COMMAND.text, text, solidScriptFormulaShown('text', inner));
    const negative = node.kind === 'unary' && node.operator === '-' && node.operand.kind === 'number';
    if (negative) return this.leaf(SOLID_SCRIPT_FORMULA_COMMAND.number, text, `-${this.source.slice(node.operand)}`);
    if (node.kind === 'number') return this.leaf(SOLID_SCRIPT_FORMULA_COMMAND.number, text, inner);
    for (const entry of SOLID_SCRIPT_FORMULA_SHOWN) {
      const shown = solidScriptFormulaShown(entry.kind, inner);
      if (shown !== inner.trim()) return this.leaf(entry.command, text, shown);
    }
    return null;
  }

  /**
   * Describes a block holding one value.
   *
   * @param command Command id.
   * @param formula Formula as typed.
   * @param shown Value as its field shows it.
   * @returns Block.
   */
  leaf(command: string, formula: string, shown: string = formula): SolidScriptFormulaLeaf {
    return { command, values: { value: shown }, formulas: { value: formula }, name: '' };
  }

  /**
   * Reads a call of a check, such as InBox([$Face.Center], [0, 0, 0], 2), as
   * its block: inputs that hold the default here show empty.
   *
   * @param node Part.
   * @returns Block, or null when the part is no such call.
   */
  check(node: SolidScriptExpression): SolidScriptFormulaLeaf | null {
    if (node.kind !== 'call') return null;
    const key = solidScriptBuiltinFind(node.name) ?? '';
    const inputs = solidScriptFormulaCheckInputs(key, this.context);
    const command = `${SOLID_SCRIPT_FORMULA_CHECK}${key}`;
    if (SOLID_SCRIPT_FUNCTION_DOCS[key]?.group !== 'Checks' || !this.catalog.find(command)) return null;
    if (node.args.length > inputs.length || node.args.some((arg) => arg.name !== null)) return null;
    const formulas: Record<string, string> = {};
    const values: Record<string, string> = {};
    inputs.forEach((input, index) => {
      const arg = node.args[index];
      formulas[input.name] = arg ? this.text(arg.value) : '';
      const inner = arg ? this.source.slice(arg.value) : '';
      const same = input.fallback !== '' && inner.replace(/\s+/g, '') === input.fallback.replace(/\s+/g, '');
      values[input.name] = same ? '' : solidScriptFormulaShown(input.kind, inner);
    });
    return { command, values, formulas, name: node.name };
  }

  /**
   * Returns a part as typed, with the parentheses around it.
   *
   * @param node Part.
   * @returns Text.
   */
  text(node: SolidScriptExpression): string {
    const outer = this.source.outer(node);
    return this.source.text.slice(outer.from, outer.to);
  }

  /**
   * Adds one line.
   *
   * @param command Command id.
   * @param values Values.
   * @returns Line.
   */
  add(command: string, values: Record<string, string>): SolidScriptBlock {
    const block = solidScriptBlockCreate(command, values, false, this.catalog);
    this.blocks.push(block);
    return block;
  }
}

/**
 * Turns a formula into blocks: && joins the blocks of the formula itself,
 * operators, Not, If ? : and functions become groups closed by End holding a
 * block per part, numbers, vectors, words and variables become their value
 * block, calls of a check become that check, and anything else an Expression
 * block that holds it as typed, so nothing is lost.
 *
 * @param text Formula, such as the text of a Where.
 * @param context Where the formula is used.
 * @returns Blocks.
 * @throws Error naming the first problem when the formula cannot be read.
 */
export function solidScriptFormulaRead(
  text: string,
  context: SolidScriptFormulaContext = {},
): SolidScriptFormulaBlocks {
  const catalog = solidScriptFormulaCatalog(context);
  const empty = text.trim() === '';
  const source = SolidScriptFormulaSource.read(empty ? '0' : text);
  const reader = new SolidScriptFormulaReader(source, catalog, context);
  const sections = empty ? [{ ids: [], spans: [] }] : [reader.section(reader.parts(source.tree, '&&'), 0)];
  const root: SolidScriptFormulaOrigin = { command: '', text, values: {}, formulas: {}, name: '', sections };
  const document: SolidScriptDocument = {
    version: SOLID_SCRIPT_DOCUMENT_VERSION,
    name: 'Formula',
    blocks: reader.blocks,
  };
  return { document, origins: reader.origins, root };
}
