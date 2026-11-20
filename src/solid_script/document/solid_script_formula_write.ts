import type { SolidScriptCommand } from '@/solid_script/commands/solid_script_command.js';
import { solidScriptParameterAllowsEmpty } from '@/solid_script/commands/solid_script_parameter_default.js';
import type { SolidScriptCommandCatalog } from '@/solid_script/commands/solid_script_command_catalog_base.js';
import {
  SOLID_SCRIPT_FORMULA_CHECK,
  SOLID_SCRIPT_FORMULA_COMMAND,
  solidScriptFormulaCatalog,
} from '@/solid_script/commands/solid_script_formula_commands.js';
import { SOLID_SCRIPT_COMMAND_BLANK } from '@/solid_script/commands/solid_script_commands_logic.js';
import {
  solidScriptFormulaCheckInputs,
  solidScriptFormulaCheckName,
  type SolidScriptFormulaContext,
} from '@/solid_script/commands/solid_script_formula_inputs.js';
import {
  solidScriptFormulaGroupOf,
  type SolidScriptFormulaGroup,
} from '@/solid_script/commands/solid_script_formula_groups.js';
import { SOLID_SCRIPT_FORMULA_LEAVES } from '@/solid_script/commands/solid_script_formula_commands.js';
import { solidScriptFormulaTyped } from '@/solid_script/language/solid_script_formula_field.js';
import {
  solidScriptFormulaJoin,
  solidScriptFormulaOperandNeed,
  solidScriptFormulaUnwrap,
  solidScriptFormulaWrap,
  SOLID_SCRIPT_FORMULA_LEVEL_UNARY,
} from '@/solid_script/language/solid_script_formula_print.js';
import type { SolidScriptBlock, SolidScriptDocument } from './solid_script_document.js';
import type { SolidScriptFormulaBlocks, SolidScriptFormulaOrigin } from './solid_script_formula_read.js';

/**
 * The formula of blocks with the formula of each block by line, a group's on
 * its Then, Else and End too; or the first line that keeps it from being one.
 */
export type SolidScriptFormulaWritten =
  { text: string; parts: ReadonlyMap<number, string> } | { problem: string; line: number };

/** A block with the blocks inside it, per section. */
interface SolidScriptFormulaNode {
  /** Its line, or null for the formula as a whole. */
  block: SolidScriptBlock | null;
  /** Index of its line. */
  line: number;
  /** Its command, or null for the formula as a whole. */
  command: SolidScriptCommand | null;
  /** Blocks inside, per section. */
  sections: SolidScriptFormulaNode[][];
  /** Indexes of its Then, Else and End lines. */
  ends: number[];
}

/** A problem with the line it is on. */
class SolidScriptFormulaProblem extends Error {
  /**
   * Creates the problem.
   *
   * @param message Problem in plain words.
   * @param line Index of the line.
   */
  constructor(
    message: string,
    readonly line: number,
  ) {
    super(message);
  }
}

/** The formula as a whole, which joins its blocks like an And. */
const SOLID_SCRIPT_FORMULA_ROOT: SolidScriptFormulaGroup = {
  id: '',
  join: { form: 'join', operator: '&&' },
  min: 0,
  max: Number.POSITIVE_INFINITY,
  sections: 1,
};

/**
 * Returns how a group joins its blocks.
 *
 * @param command Group command id, or empty for the formula as a whole.
 * @returns Group.
 */
function solidScriptFormulaGroup(command: string): SolidScriptFormulaGroup {
  return solidScriptFormulaGroupOf(command) ?? SOLID_SCRIPT_FORMULA_ROOT;
}

/**
 * Puts the lines into a tree of groups, checking every group ends and every
 * Then and Else stands in an If.
 *
 * @param blocks Lines.
 * @param catalog Blocks of the formula.
 * @returns The formula as a whole.
 */
function solidScriptFormulaTree(
  blocks: readonly SolidScriptBlock[],
  catalog: SolidScriptCommandCatalog,
): SolidScriptFormulaNode {
  const root: SolidScriptFormulaNode = { block: null, line: -1, command: null, sections: [[]], ends: [] };
  const open = [root];
  blocks.forEach((block, line) => {
    const command = catalog.find(block.command);
    if (!command) throw new SolidScriptFormulaProblem('This line is no formula block; remove it.', line);
    if (block.off) throw new SolidScriptFormulaProblem(`${command.label} is turned off; remove it.`, line);
    const top = open[open.length - 1] ?? root;
    if (command.nesting === 'continue') return solidScriptFormulaBranch(top, command, line);
    if (command.nesting === 'close') return solidScriptFormulaClose(open, line);
    if (command.id !== SOLID_SCRIPT_COMMAND_BLANK) solidScriptFormulaAdd(open, top, block, command, line);
  });
  const left = open[open.length - 1];
  if (left && left !== root)
    throw new SolidScriptFormulaProblem(`${left.command?.label} has no End; add one below its last block.`, left.line);
  solidScriptFormulaEmpty(root);
  return root;
}

/**
 * Adds a block to the innermost open group, opening it as a group when it holds
 * others.
 *
 * @param open Open groups, the formula as a whole first.
 * @param top Innermost open group.
 * @param block Line.
 * @param command Its command.
 * @param line Index of the line.
 */
function solidScriptFormulaAdd(
  open: SolidScriptFormulaNode[],
  top: SolidScriptFormulaNode,
  block: SolidScriptBlock,
  command: SolidScriptCommand,
  line: number,
): void {
  const sections: SolidScriptFormulaNode[][] = command.nesting === 'open' ? [[]] : [];
  const node: SolidScriptFormulaNode = { block, line, command, sections, ends: [] };
  top.sections[top.sections.length - 1]?.push(node);
  if (command.nesting === 'open') open.push(node);
}

/**
 * Starts the next section of an If at a Then or Else.
 *
 * @param top Innermost open group.
 * @param command Then or Else.
 * @param line Index of the line.
 */
function solidScriptFormulaBranch(top: SolidScriptFormulaNode, command: SolidScriptCommand, line: number): void {
  const expected = command.id === SOLID_SCRIPT_FORMULA_COMMAND.then ? 1 : 2;
  if (top.command?.id !== SOLID_SCRIPT_FORMULA_COMMAND.choose || top.sections.length !== expected)
    throw new SolidScriptFormulaProblem(
      `${command.label} belongs inside an If, ${expected === 1 ? 'right after its check' : 'after its Then'}.`,
      line,
    );
  top.sections.push([]);
  top.ends.push(line);
}

/**
 * Ends the innermost open group at an End.
 *
 * @param open Open groups, the formula as a whole first.
 * @param line Index of the line.
 */
function solidScriptFormulaClose(open: SolidScriptFormulaNode[], line: number): void {
  const top = open[open.length - 1];
  if (!top || open.length === 1)
    throw new SolidScriptFormulaProblem('This End has no group above it to end; remove it.', line);
  if (top.sections.length !== solidScriptFormulaGroup(top.command?.id ?? '').sections)
    throw new SolidScriptFormulaProblem(`${top.command?.label} needs a Then and an Else before its End.`, top.line);
  top.ends.push(line);
  open.pop();
}

/** Names of the sections of an If, for problems. */
const SOLID_SCRIPT_FORMULA_SECTION_NAMES = ['', ' under Then', ' under Else'];

/**
 * Checks that every group holds as many blocks as it takes.
 *
 * @param node Group.
 */
function solidScriptFormulaEmpty(node: SolidScriptFormulaNode): void {
  const group = solidScriptFormulaGroup(node.command?.id ?? '');
  node.sections.forEach((section, index) => {
    const label = node.command?.label ?? '';
    const where = group.sections > 1 ? (SOLID_SCRIPT_FORMULA_SECTION_NAMES[index] ?? '') : '';
    if (section.length < group.min) {
      const count = group.min === 1 ? 'a block' : `at least ${group.min} blocks`;
      throw new SolidScriptFormulaProblem(`${label} needs ${count} inside${where}.`, node.line);
    }
    if (section.length > group.max) {
      const count = group.max === 1 ? 'one block' : `${group.max} blocks`;
      throw new SolidScriptFormulaProblem(`${label} holds only ${count}${where}; remove the others.`, node.line);
    }
    section.forEach(solidScriptFormulaEmpty);
  });
}

/** Writes the tree of blocks as a formula. */
class SolidScriptFormulaWriter {
  /** Formula of each block written, by line. */
  readonly parts = new Map<number, string>();

  /**
   * Creates the writer.
   *
   * @param origins How each block was typed, by the id of its first line.
   * @param context Where the formula is used.
   */
  constructor(
    private readonly origins: ReadonlyMap<string, SolidScriptFormulaOrigin>,
    private readonly context: SolidScriptFormulaContext,
  ) {}

  /**
   * Writes one block and keeps its formula on its lines.
   *
   * @param node Block.
   * @param origin How it was typed, if it was.
   * @returns Formula.
   */
  write(node: SolidScriptFormulaNode, origin: SolidScriptFormulaOrigin | undefined): string {
    const text = this.block(node, origin);
    const part = solidScriptFormulaUnwrap(text);
    for (const line of [node.line, ...node.ends]) this.parts.set(line, part);
    return text;
  }

  /**
   * Writes one block: unchanged blocks as typed, groups with the same blocks
   * inside with only those changed, anything else neatly.
   *
   * @param node Block.
   * @param origin How it was typed, if it was.
   * @returns Formula.
   */
  block(node: SolidScriptFormulaNode, origin: SolidScriptFormulaOrigin | undefined): string {
    const command = node.command?.id ?? '';
    const known = origin?.command === command ? origin : undefined;
    if (node.command && node.command.nesting !== 'open') return this.leaf(node, known);
    const texts = node.sections.map((section) =>
      section.map((child) => this.write(child, this.origins.get(child.block?.id ?? ''))),
    );
    const same =
      known?.sections.length === node.sections.length &&
      known.sections.every(
        (section, index) => section.ids.join() === (node.sections[index] ?? []).map((child) => child.block?.id).join(),
      );
    return same && known ? this.splice(command, known, texts) : this.group(command, texts, known?.name ?? '');
  }

  /**
   * Writes a group whose blocks inside are the same, changing only their text.
   *
   * @param command Group command id, or empty for the formula as a whole.
   * @param origin How it was typed.
   * @param texts Formulas of the blocks inside, per section.
   * @returns Formula.
   */
  splice(command: string, origin: SolidScriptFormulaOrigin, texts: readonly string[][]): string {
    const edits = origin.sections.flatMap((section, index) =>
      section.spans.map((span, position) => {
        const text = texts[index]?.[position] ?? '';
        return {
          span,
          text: solidScriptFormulaWrap(text, solidScriptFormulaNeed(command, index, section.spans.length, position)),
        };
      }),
    );
    let text = origin.text;
    for (const edit of edits.sort((left, right) => right.span.from - left.span.from))
      text = text.slice(0, edit.span.from) + edit.text + text.slice(edit.span.to);
    return text;
  }

  /**
   * Writes a group neatly.
   *
   * @param command Group command id, or empty for the formula as a whole.
   * @param texts Formulas of the blocks inside, per section.
   * @param name Name of a function as typed, or empty.
   * @returns Formula.
   */
  group(command: string, texts: readonly string[][], name: string): string {
    const { join } = solidScriptFormulaGroup(command);
    const [first = [], second = [], third = []] = texts;
    const wrap = (parts: readonly string[], need: number): string => solidScriptFormulaWrap(parts[0] ?? '', need);
    if (join.form === 'join') return solidScriptFormulaJoin(join.operator, first);
    if (join.form === 'choose') return `${wrap(first, 1)} ? ${wrap(second, 0)} : ${wrap(third, 0)}`;
    if (join.form === 'call') {
      const args = first.map((part) => solidScriptFormulaWrap(part, 0)).join(', ');
      return `${name || solidScriptFormulaCheckName(join.key)}(${args})`;
    }
    const operand = wrap(first, SOLID_SCRIPT_FORMULA_LEVEL_UNARY);
    const twice = join.operator === '-' && /^[-+]/.test(operand) ? `(${operand})` : operand;
    return `${join.operator}${twice}`;
  }

  /**
   * Writes a block that is no group: as typed while its values are unchanged.
   *
   * @param node Block.
   * @param origin How it was typed, if it was.
   * @returns Formula.
   */
  leaf(node: SolidScriptFormulaNode, origin: SolidScriptFormulaOrigin | undefined): string {
    const values = node.block?.values ?? {};
    const command = node.command;
    if (!command) return '';
    const changed =
      !origin || command.parameters.some((field) => (values[field.key] ?? '') !== (origin.values[field.key] ?? ''));
    if (origin && !changed) return origin.text;
    const problem = solidScriptFormulaLeafProblem(command, values);
    if (problem) throw new SolidScriptFormulaProblem(problem, node.line);
    const formula = (key: string, typed: (shown: string) => string): string => {
      const shown = values[key] ?? '';
      return origin && shown === origin.values[key] ? (origin.formulas[key] ?? '') : typed(shown);
    };
    const leaf = SOLID_SCRIPT_FORMULA_LEAVES.find((entry) => entry.id === command.id);
    if (leaf) return formula('value', (shown) => solidScriptFormulaTyped(leaf.kind, shown));
    return this.check(command.id.slice(SOLID_SCRIPT_FORMULA_CHECK.length), formula, origin?.name ?? '');
  }

  /**
   * Writes the call of a check: an empty input with a default here gets it, and
   * empty inputs at the end are left off.
   *
   * @param key Check key.
   * @param formula Formula of a field.
   * @param name Name as typed, or empty for the name the docs teach.
   * @returns Formula.
   */
  check(key: string, formula: (key: string, typed: (shown: string) => string) => string, name: string): string {
    const inputs = solidScriptFormulaCheckInputs(key, this.context);
    const args = inputs.map(
      (input) => formula(input.name, (shown) => solidScriptFormulaTyped(input.kind, shown)) || input.fallback,
    );
    while (args.length > 0 && args[args.length - 1] === '') args.pop();
    return `${name || solidScriptFormulaCheckName(key)}(${args.join(', ')})`;
  }
}

/**
 * Returns the lowest level a block inside a group keeps without parentheses.
 *
 * @param command Group command id, or empty for the formula as a whole.
 * @param section Index of the section.
 * @param count Blocks in the section.
 * @param position Index of the block in it.
 * @returns Level.
 */
function solidScriptFormulaNeed(command: string, section: number, count: number, position: number): number {
  const { join } = solidScriptFormulaGroup(command);
  if (join.form === 'join') return solidScriptFormulaOperandNeed(join.operator, count, position);
  if (join.form === 'unary') return SOLID_SCRIPT_FORMULA_LEVEL_UNARY;
  return join.form === 'choose' && section === 0 ? 1 : 0;
}

/**
 * Checks the fields of a changed block.
 *
 * @param command Command.
 * @param values Values.
 * @returns Problem, or an empty string.
 */
function solidScriptFormulaLeafProblem(command: SolidScriptCommand, values: Readonly<Record<string, string>>): string {
  const missing = command.parameters.find(
    (field) => !solidScriptParameterAllowsEmpty(field) && (values[field.key] ?? '').trim() === '',
  );
  if (missing) return `${command.label}: ${missing.label} needs a value.`;
  const problem = command.check?.(values) ?? '';
  return problem;
}

/**
 * Writes blocks as a formula: blocks left as they were come back exactly as
 * typed, changed blocks are written neatly with only the parentheses needed.
 *
 * @param document Lines.
 * @param read The blocks as read, with how each was typed.
 * @param context Where the formula is used.
 * @returns Formula, or the first problem with its line.
 */
export function solidScriptFormulaWrite(
  document: SolidScriptDocument,
  read: Pick<SolidScriptFormulaBlocks, 'origins' | 'root'>,
  context: SolidScriptFormulaContext = {},
): SolidScriptFormulaWritten {
  try {
    const tree = solidScriptFormulaTree(document.blocks, solidScriptFormulaCatalog(context));
    const writer = new SolidScriptFormulaWriter(read.origins, context);
    const text = writer.write(tree, read.root);
    writer.parts.delete(-1);
    return { text, parts: writer.parts };
  } catch (error) {
    if (error instanceof SolidScriptFormulaProblem) return { problem: error.message, line: error.line };
    throw error;
  }
}
