import type { SolidScriptArgument, SolidScriptBinding, SolidScriptExpression } from './solid_script_ast.js';
import type { SolidScriptToken } from './solid_script_lexer.js';

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
    return this.tokens[this.index] ?? { kind: 'end', text: '', line: 0 };
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
    if (!this.accept(symbol)) throw this.error(`expected "${symbol}" but found "${this.peek().text || 'end'}"`);
  }

  /**
   * Consumes a required identifier.
   *
   * @returns Identifier text.
   */
  protected expectIdentifier(): string {
    const token = this.next();
    if (token.kind !== 'identifier') throw this.error(`expected a name but found "${token.text}"`);
    return token.text;
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
    const condition = this.parseBinary(0);
    if (!this.accept('?')) return condition;
    const whenTrue = this.parseExpression();
    this.expect(':');
    return { kind: 'ternary', condition, whenTrue, whenFalse: this.parseExpression() };
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
    let left = this.parseBinary(level + 1);
    for (;;) {
      const token = this.peek();
      if (token.kind !== 'symbol' || !operators.includes(token.text)) return left;
      this.next();
      left = { kind: 'binary', operator: token.text, left, right: this.parseBinary(level + 1) };
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
      this.next();
      return { kind: 'unary', operator: token.text, operand: this.parseUnary() };
    }
    return this.parsePostfix(this.parsePrimary());
  }

  /**
   * Parses index and member suffixes.
   *
   * @param target Expression the suffixes apply to.
   * @returns Expression.
   */
  private parsePostfix(target: SolidScriptExpression): SolidScriptExpression {
    for (;;) {
      if (this.accept('[')) {
        const index = this.parseExpression();
        this.expect(']');
        target = { kind: 'index', target, index };
      } else if (this.accept('.')) {
        target = { kind: 'member', target, name: this.expectIdentifier() };
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
    const token = this.next();
    if (token.kind === 'number') return { kind: 'number', value: Number(token.text) };
    if (token.kind === 'string') return { kind: 'string', value: token.text };
    if (token.kind === 'identifier') return this.parseName(token.text);
    if (token.text === '(') {
      const inner = this.parseExpression();
      this.expect(')');
      return inner;
    }
    if (token.text === '[') return this.parseVector();
    throw new Error(`line ${token.line}: unexpected "${token.text || 'end'}" in expression`);
  }

  /**
   * Parses a name: literal keyword, variable or function call.
   *
   * @param name Identifier text.
   * @returns Expression.
   */
  private parseName(name: string): SolidScriptExpression {
    if (name === 'true' || name === 'false') return { kind: 'boolean', value: name === 'true' };
    if (name === 'undef') return { kind: 'undef' };
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
