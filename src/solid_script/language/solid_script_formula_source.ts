import type { SolidScriptExpression } from './solid_script_ast.js';
import { solidScriptExpressionParse, SolidScriptValueParser } from './solid_script_expression_parse.js';
import { solidScriptFieldEscapes, solidScriptFieldPieces } from './solid_script_field.js';

/**
 * Where a part of a formula stands in its text: from its first character to
 * after its last.
 */
export interface SolidScriptFormulaSpan {
  /** Index of the first character. */
  from: number;
  /** Index after the last character. */
  to: number;
}

/** Where every part of a formula was read from. */
interface SolidScriptFormulaMarks {
  /** Span of each part without the parentheses around it. */
  spans: Map<SolidScriptExpression, SolidScriptFormulaSpan>;
  /** Span of each part with all the parentheses around it. */
  outers: Map<SolidScriptExpression, SolidScriptFormulaSpan>;
  /** Parts written in parentheses. */
  parenthesized: Set<SolidScriptExpression>;
}

/** Parser of a formula that keeps where every part was read from. */
class SolidScriptFormulaParser extends SolidScriptValueParser {
  /**
   * Creates the parser.
   *
   * @param text Formula with its bracketed parts masked and its escapes read.
   * @param marks Spans it fills in.
   * @param slots Where each masked bracketed part starts, after its [.
   * @param escapes Where each escaped character stands, after its $.
   * @param origins Where each character of the masked formula stands in the
   *   formula as typed.
   */
  constructor(
    text: string,
    private readonly marks: SolidScriptFormulaMarks,
    private readonly slots: ReadonlySet<number>,
    private readonly escapes: ReadonlySet<number>,
    private readonly origins: readonly number[],
  ) {
    super(text);
  }

  /**
   * Notes the span of a part: the first mark is the part itself, a mark with
   * parentheses widens its outer span. A bracketed part keeps its brackets.
   *
   * @param expression Part just read.
   * @param first Index of its first token.
   * @param parenthesized True when read with the parentheses around it.
   * @returns The same part.
   */
  protected override expressionMark(
    expression: SolidScriptExpression,
    first: number,
    parenthesized: boolean,
  ): SolidScriptExpression {
    const start = this.origins[this.tokenAt(first).start]!;
    const last = this.tokenAt(this.tokenIndex() - 1);
    const end = this.origins[last.end - 1]! + 1;
    const span = {
      from: this.slots.has(start) || this.escapes.has(start) ? start - 1 : start,
      to: this.slots.has(this.origins[last.start]!) ? end + 1 : end,
    };
    if (!this.marks.spans.has(expression)) this.marks.spans.set(expression, span);
    this.marks.outers.set(expression, span);
    if (parenthesized) this.marks.parenthesized.add(expression);
    return expression;
  }
}

/**
 * Masks the bracketed parts of a formula and reads its escapes, as the running
 * formula does: a part becomes a name of underscores the parser reads as one
 * value, in its place, and an escape the character it keeps.
 *
 * @param text Formula.
 * @returns Masked formula, where each part starts and each escaped character
 *   stands, and where each masked character stands in the formula.
 */
function solidScriptFormulaMask(text: string): {
  masked: string;
  slots: Set<number>;
  escapes: Set<number>;
  origins: number[];
} {
  const groups = solidScriptFieldPieces(text).flatMap((piece) => (piece.kind === 'group' ? [piece] : []));
  const read = { masked: '', slots: new Set<number>(), escapes: new Set<number>(), origins: [] as number[] };
  for (let index = 0; index < text.length; index++) {
    const group = groups[0];
    if (group?.from === index) {
      if (group.to - group.from < 3)
        throw new Error('[] is empty; put a variable name inside, or write $[$] for brackets');
      solidScriptFormulaMaskAdd(read, ` ${'_'.repeat(group.to - group.from - 2)} `, index);
      read.slots.add(index + 1);
      index = group.to - 1;
      groups.shift();
    } else if (solidScriptFieldEscapes(text, index)) {
      read.escapes.add(++index);
      solidScriptFormulaMaskAdd(read, text[index]!, index);
    } else solidScriptFormulaMaskAdd(read, text[index]!, index);
  }
  return read;
}

/**
 * Adds characters to a masked formula, each standing one after the other from a
 * place of the formula as typed.
 *
 * @param read Masked formula so far, and where its characters stand.
 * @param read.masked Masked text.
 * @param read.origins Where each masked character stands.
 * @param characters Characters to add.
 * @param from Where the first of them stands.
 */
function solidScriptFormulaMaskAdd(
  read: { masked: string; origins: number[] },
  characters: string,
  from: number,
): void {
  read.masked += characters;
  for (let offset = 0; offset < characters.length; offset++) read.origins.push(from + offset);
}

/**
 * A formula read with where each of its parts stands, so a part can be written
 * back exactly as it was typed.
 */
export class SolidScriptFormulaSource {
  /**
   * Creates the reading of a formula.
   *
   * @param text Formula as typed.
   * @param tree Parts of the formula.
   * @param marks Where each part was read from.
   * @param slots Where each bracketed part starts, after its [.
   */
  private constructor(
    readonly text: string,
    readonly tree: SolidScriptExpression,
    private readonly marks: SolidScriptFormulaMarks,
    private readonly slots: ReadonlySet<number>,
  ) {}

  /**
   * Reads a formula, such as the text of a Where.
   *
   * @param text Formula as typed.
   * @returns Reading.
   * @throws Error naming the first problem in plain words.
   */
  static read(text: string): SolidScriptFormulaSource {
    const marks: SolidScriptFormulaMarks = { spans: new Map(), outers: new Map(), parenthesized: new Set() };
    const { masked, slots, escapes, origins } = solidScriptFormulaMask(text);
    const parser = (value: string) => new SolidScriptFormulaParser(value, marks, slots, escapes, origins);
    const tree = solidScriptExpressionParse(masked, parser);
    return new SolidScriptFormulaSource(text, tree, marks, slots);
  }

  /**
   * Returns where a part stands without the parentheses around it.
   *
   * @param node Part.
   * @returns Span.
   */
  span(node: SolidScriptExpression): SolidScriptFormulaSpan {
    return this.marks.spans.get(node) ?? { from: 0, to: this.text.length };
  }

  /**
   * Returns where a part stands with all the parentheses around it.
   *
   * @param node Part.
   * @returns Span.
   */
  outer(node: SolidScriptExpression): SolidScriptFormulaSpan {
    return this.marks.outers.get(node) ?? this.span(node);
  }

  /**
   * Returns a part as typed, without the parentheses around it.
   *
   * @param node Part.
   * @returns Text.
   */
  slice(node: SolidScriptExpression): string {
    const span = this.span(node);
    return this.text.slice(span.from, span.to);
  }

  /**
   * Tells whether a part is written in parentheses.
   *
   * @param node Part.
   * @returns True when it is.
   */
  parenthesized(node: SolidScriptExpression): boolean {
    return this.marks.parenthesized.has(node);
  }

  /**
   * Tells whether a part is a bracketed part, such as [$Face] or [=1 + 2].
   *
   * @param node Part.
   * @returns True when it is.
   */
  slot(node: SolidScriptExpression): boolean {
    return node.kind === 'variable' && this.slots.has(this.span(node).from + 1);
  }
}

/**
 * Checks that a formula can be read, without running it.
 *
 * @param text Formula.
 * @returns Problem in plain words, or an empty string.
 */
export function solidScriptFormulaProblem(text: string): string {
  try {
    SolidScriptFormulaSource.read(text);
    return '';
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}
