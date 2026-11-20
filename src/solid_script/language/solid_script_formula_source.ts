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
   * @param text Formula with its bracketed parts masked.
   * @param marks Spans it fills in.
   * @param slots Where each masked bracketed part starts, after its [.
   * @param escapes Where each escaped character stands, after its $.
   */
  constructor(
    text: string,
    private readonly marks: SolidScriptFormulaMarks,
    private readonly slots: ReadonlySet<number>,
    private readonly escapes: ReadonlySet<number>,
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
    const start = this.tokenAt(first).start;
    const last = this.tokenAt(this.tokenIndex() - 1);
    const span = {
      from: this.slots.has(start) || this.escapes.has(start) ? start - 1 : start,
      to: this.slots.has(last.start) ? last.end + 1 : last.end,
    };
    if (!this.marks.spans.has(expression)) this.marks.spans.set(expression, span);
    this.marks.outers.set(expression, span);
    if (parenthesized) this.marks.parenthesized.add(expression);
    return expression;
  }
}

/**
 * Masks the bracketed parts and escapes of a formula, keeping every character
 * in its place: a part becomes a name of underscores the parser reads as one
 * value, as the running formula reads it.
 *
 * @param text Formula.
 * @returns Masked formula, and where each part starts and each escaped
 *   character stands.
 */
function solidScriptFormulaMask(text: string): { masked: string; slots: Set<number>; escapes: Set<number> } {
  const groups = solidScriptFieldPieces(text).flatMap((piece) => (piece.kind === 'group' ? [piece] : []));
  const slots = new Set<number>();
  const escapes = new Set<number>();
  let masked = '';
  for (let index = 0; index < text.length; index++) {
    const group = groups[0];
    if (group?.from === index) {
      if (group.to - group.from < 3)
        throw new Error('[] is empty; put a variable name inside, or write $[$] for brackets');
      masked += ` ${'_'.repeat(group.to - group.from - 2)} `;
      slots.add(index + 1);
      index = group.to - 1;
      groups.shift();
    } else if (solidScriptFieldEscapes(text, index)) {
      masked += ` ${text[index + 1]}`;
      escapes.add(index + 1);
      index++;
    } else masked += text[index];
  }
  return { masked, slots, escapes };
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
    const { masked, slots, escapes } = solidScriptFormulaMask(text);
    const parser = (value: string) => new SolidScriptFormulaParser(value, marks, slots, escapes);
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
