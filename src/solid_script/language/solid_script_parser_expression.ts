import type { SolidScriptArgument, SolidScriptBinding, SolidScriptExpression } from './solid_script_ast.js';
import type { SolidScriptToken } from './solid_script_lexer.js';
import { solidScriptNumberSafe } from './solid_script_number_safe.js';

/** Binary operators by precedence level, loosest first. */
const SOLID_SCRIPT_BINARY_LEVELS: readonly (readonly string[])[] = [
  ['||'],
  ['&&'],
  ['==', '!='],
  ['<', '<=', '>', '>='],
  ['+', '-'],
  ['*', '/', '%'],
];

/** Token cursor and expression grammar shared by the statement parser. */
export class SolidScriptParserExpression {
  private readonly tokens: SolidScriptToken[];
  private index = 0;

  /**
   * Creates a parser over tokens.
   *
   * @param tokens Tokens ending with an end token.
   */
  constructor(tokens: SolidScriptToken[]) {
    this.tokens = tokens;
  }

  /**
   * Returns the current token without consuming it.
   *
   * @returns Token.
   */
  protected peek(): SolidScriptToken {
    return this.tokens[this.index] ?? { kind: 'end', text: '', line: 0, start: 0, end: 0 };
  }

  /**
   * Consumes and returns the current token.
   *
   * @returns Token.
   */
  protected next(): SolidScriptToken {
    const token = this.peek();
    if (token.kind !== 'end') this.index += 1;
    return token;
  }

  /**
   * Consumes the current token when it is the given symbol.
   *
   * @param symbol Symbol text.
   * @returns True when consumed.
   */
  protected accept(symbol: string): boolean {
    const token = this.peek();
    if (token.kind !== 'symbol' || token.text !== symbol) return false;
    this.index += 1;
    return true;
  }

  /**
   * Consumes a required symbol.
   *
   * @param symbol Symbol text.
   */
  protected expect(symbol: string): void {
    if (this.accept(symbol)) return;
    const found = this.peek().text;
    throw this.error(
      found ? `a "${symbol}" is needed before "${found}"` : `a closing "${symbol}" is missing at the end`,
    );
  }

  /**
   * Consumes a required identifier.
   *
   * @returns Identifier text.
   */
  protected expectIdentifier(): string {
    const token = this.next();
    if (token.kind !== 'identifier')
      throw this.error(`a name is needed here, not "${token.text || 'the end'}"; names use letters, digits and _`);
    return token.text;
  }

  /**
   * Notes the tokens an expression was read from. The script parser keeps no
   * positions; a reader that needs them overrides this.
   *
   * @param expression Expression just read.
   * @param _first Index of its first token.
   * @param _parenthesized True when it was read with the parentheses around it.
   * @returns The same expression.
   */
  protected expressionMark(
    expression: SolidScriptExpression,
    _first: number,
    _parenthesized: boolean,
  ): SolidScriptExpression {
    return expression;
  }

  /**
   * Returns the token at an index, or the end token past the last one.
   *
   * @param index Token index.
   * @returns Token.
   */
  protected tokenAt(index: number): SolidScriptToken {
    return this.tokens[index] ?? this.peek();
  }

  /**
   * Returns the index of the token after the last one read.
   *
   * @returns Token index.
   */
  protected tokenIndex(): number {
    return this.index;
  }

  /**
   * Builds a parse error naming the current line.
   *
   * @param message Problem.
   * @returns Error.
   */
  protected error(message: string): Error {
    return new Error(`line ${this.peek().line}: ${message}`);
  }

  /**
   * Parses call arguments after the opening parenthesis.
   *
   * @returns Arguments.
   */
  protected parseArguments(): SolidScriptArgument[] {
    const args: SolidScriptArgument[] = [];
    while (!this.accept(')')) {
      args.push(this.parseArgument());
      if (!this.accept(',')) {
        this.expect(')');
        break;
      }
    }
    return args;
  }

  /**
   * Parses one positional or named argument.
   *
   * @returns Argument.
   */
  private parseArgument(): SolidScriptArgument {
    const token = this.peek();
    const following = this.tokens[this.index + 1];
    if (token.kind === 'identifier' && following?.text === '=' && following.kind === 'symbol') {
      this.index += 2;
      return { name: token.text, value: this.parseExpression() };
    }
    return { name: null, value: this.parseExpression() };
  }

  /**
   * Parses loop bindings including both parentheses.
   *
   * @returns Bindings.
   */
  protected parseBindings(): SolidScriptBinding[] {
    this.expect('(');
    const bindings: SolidScriptBinding[] = [];
    do {
      const name = this.expectIdentifier();
      this.expect('=');
      bindings.push({ name, value: this.parseExpression() });
    } while (this.accept(','));
    this.expect(')');
    return bindings;
  }

  /**
   * Parses a full expression.
   *
   * @returns Expression.
   */
  protected parseExpression(): SolidScriptExpression {
    const first = this.index;
    const condition = this.parseBinary(0);
    if (!this.accept('?')) return condition;
    const whenTrue = this.parseExpression();
    this.expect(':');
    return this.expressionMark(
      { kind: 'ternary', condition, whenTrue, whenFalse: this.parseExpression() },
      first,
      false,
    );
  }

  /**
   * Parses binary operators from one precedence level down.
   *
   * @param level Precedence level index.
   * @returns Expression.
   */
  private parseBinary(level: number): SolidScriptExpression {
    const operators = SOLID_SCRIPT_BINARY_LEVELS[level];
    if (!operators) return this.parseUnary();
    const first = this.index;
    let left = this.parseBinary(level + 1);
    for (;;) {
      const token = this.peek();
      if (token.kind !== 'symbol' || !operators.includes(token.text)) return left;
      this.next();
      const right = this.parseBinary(level + 1);
      left = this.expressionMark({ kind: 'binary', operator: token.text, left, right }, first, false);
    }
  }

  /**
   * Parses prefix operators.
   *
   * @returns Expression.
   */
  private parseUnary(): SolidScriptExpression {
    const token = this.peek();
    if (token.kind === 'symbol' && (token.text === '-' || token.text === '+' || token.text === '!')) {
      const first = this.index;
      this.next();
      return this.expressionMark({ kind: 'unary', operator: token.text, operand: this.parseUnary() }, first, false);
    }
    return this.parsePower();
  }

  /**
   * Parses a power such as 2 ^ 3, which binds tighter than * and groups from
   * the right, so 2 ^ 3 ^ 2 is 2 ^ 9.
   *
   * @returns Expression.
   */
  private parsePower(): SolidScriptExpression {
    const first = this.index;
    const base = this.parsePostfix(this.parsePrimary(), first);
    if (!this.accept('^')) return base;
    return this.expressionMark({ kind: 'binary', operator: '^', left: base, right: this.parseUnary() }, first, false);
  }

  /**
   * Parses index and member suffixes.
   *
   * @param target Expression the suffixes apply to.
   * @param first Index of the target's first token.
   * @returns Expression.
   */
  private parsePostfix(target: SolidScriptExpression, first: number): SolidScriptExpression {
    for (;;) {
      if (this.accept('[')) {
        const index = this.parseExpression();
        this.expect(']');
        target = this.expressionMark({ kind: 'index', target, index }, first, false);
      } else if (this.accept('.')) {
        target = this.expressionMark({ kind: 'member', target, name: this.expectIdentifier() }, first, false);
      } else {
        return target;
      }
    }
  }

  /**
   * Parses a literal, name, call, parenthesized expression or vector.
   *
   * @returns Expression.
   */
  private parsePrimary(): SolidScriptExpression {
    const first = this.index;
    const token = this.next();
    if (token.kind === 'number')
      return this.expressionMark({ kind: 'number', value: solidScriptNumberSafe(Number(token.text)) }, first, false);
    if (token.kind === 'string') return this.expressionMark({ kind: 'string', value: token.text }, first, false);
    if (token.kind === 'identifier') return this.expressionMark(this.parseName(token.text), first, false);
    if (token.text === '(') {
      const inner = this.parseExpression();
      this.expect(')');
      return this.expressionMark(inner, first, true);
    }
    if (token.text === '[') return this.expressionMark(this.parseVector(), first, false);
    throw new Error(
      token.text
        ? `line ${token.line}: "${token.text}" cannot stand here; a number, "text", [Name] or Function() was expected`
        : `line ${token.line}: the formula stops where a value is still missing, such as after an operator or a comma`,
    );
  }

  /**
   * Parses a name: literal keyword, variable or function call.
   *
   * @param name Identifier text.
   * @returns Expression.
   */
  private parseName(name: string): SolidScriptExpression {
    const word = name.toLowerCase();
    if (word === 'true' || word === 'false') return { kind: 'boolean', value: word === 'true' };
    if (word === 'undef') return { kind: 'undef' };
    if (this.accept('(')) return { kind: 'call', name, args: this.parseArguments() };
    return { kind: 'variable', name };
  }

  /**
   * Parses a vector, range or list comprehension after "[".
   *
   * @returns Expression.
   */
  private parseVector(): SolidScriptExpression {
    if (this.accept(']')) return { kind: 'vector', items: [] };
    if (this.peek().text === 'for') return this.parseComprehension();
    const first = this.parseExpression();
    if (this.accept(':')) return this.parseRangeRest(first);
    const items = [first];
    while (this.accept(',')) items.push(this.parseExpression());
    this.expect(']');
    return { kind: 'vector', items };
  }

  /**
   * Parses the rest of a range after its start and colon.
   *
   * @param start Range start.
   * @returns Range expression.
   */
  private parseRangeRest(start: SolidScriptExpression): SolidScriptExpression {
    const second = this.parseExpression();
    if (!this.accept(':')) {
      this.expect(']');
      return { kind: 'range', start, step: null, end: second };
    }
    const end = this.parseExpression();
    this.expect(']');
    return { kind: 'range', start, step: second, end };
  }

  /**
   * Parses a list comprehension after "[".
   *
   * @returns Comprehension expression.
   */
  private parseComprehension(): SolidScriptExpression {
    this.next();
    const bindings = this.parseBindings();
    const body = this.parseExpression();
    this.expect(']');
    return { kind: 'comprehension', bindings, body };
  }
}
