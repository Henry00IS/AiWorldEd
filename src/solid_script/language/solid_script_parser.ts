import type {
  SolidScriptExpression,
  SolidScriptArgument,
  SolidScriptBinding,
  SolidScriptParameter,
  SolidScriptStatement,
} from './solid_script_ast.js';
import { SolidScriptLexer } from './solid_script_lexer.js';
import { SolidScriptParserExpression } from './solid_script_parser_expression.js';

/** Parses solid script source of the supported subset into statements. */
export class SolidScriptParser extends SolidScriptParserExpression {
  /**
   * Creates a parser over source text.
   *
   * @param source Solid script source text.
   */
  constructor(source: string) {
    super(new SolidScriptLexer(source).tokenize());
  }

  /**
   * Parses the whole program.
   *
   * @returns Top-level statements.
   */
  parseProgram(): SolidScriptStatement[] {
    const statements: SolidScriptStatement[] = [];
    while (this.peek().kind !== 'end') {
      const statement = this.parseStatement();
      if (statement) statements.push(statement);
    }
    return statements;
  }

  /**
   * Parses text that must be exactly one value, such as a variable's value.
   *
   * @returns Expression.
   */
  parseValue(): SolidScriptExpression {
    const value = this.parseExpression();
    if (this.peek().kind !== 'end') throw new Error(`unexpected "${this.peek().text}" after the value`);
    return value;
  }

  /**
   * Parses one statement.
   *
   * @returns Statement, or null for an empty or disabled statement.
   */
  private parseStatement(): SolidScriptStatement | null {
    const token = this.peek();
    if (this.accept(';')) return null;
    if (this.accept('{')) return { kind: 'block', body: this.parseBlockRest(), line: token.line };
    if (token.text === '*' || token.text === '%') return this.parseDisabled();
    if (token.text === '#' || token.text === '!') {
      this.next();
      return this.parseStatement();
    }
    if (token.kind !== 'identifier') throw this.error(`unexpected "${token.text}"`);
    return this.parseKeywordStatement(token.text, token.line);
  }

  /**
   * Parses a statement led by an identifier.
   *
   * @param word Leading identifier.
   * @param line Source line.
   * @returns Statement.
   */
  private parseKeywordStatement(word: string, line: number): SolidScriptStatement {
    if (word === 'module') return this.parseModuleDefine(line);
    if (word === 'function') return this.parseFunctionDefine(line);
    if (word === 'if') return this.parseIf(line);
    if (word === 'for') return this.parseFor(line);
    this.next();
    if (this.accept('=')) {
      const value = this.parseExpression();
      this.expect(';');
      return { kind: 'assign', name: word, value, line };
    }
    return this.parseModuleCall(word, line);
  }

  /**
   * Skips a statement disabled with * or %.
   *
   * @returns Null.
   */
  private parseDisabled(): null {
    this.next();
    this.parseStatement();
    return null;
  }

  /**
   * Parses statements up to the closing brace.
   *
   * @returns Statements.
   */
  private parseBlockRest(): SolidScriptStatement[] {
    const body: SolidScriptStatement[] = [];
    while (!this.accept('}')) {
      if (this.peek().kind === 'end') throw this.error('missing "}"');
      const statement = this.parseStatement();
      if (statement) body.push(statement);
    }
    return body;
  }

  /**
   * Parses the child statement of a call, module, if or for.
   *
   * @returns Child statements.
   */
  private parseChild(): SolidScriptStatement[] {
    const statement = this.parseStatement();
    if (!statement) return [];
    return statement.kind === 'block' ? statement.body : [statement];
  }

  /**
   * Parses a module call after its name.
   *
   * @param name Module name.
   * @param line Source line.
   * @returns Module call statement.
   */
  private parseModuleCall(name: string, line: number): SolidScriptStatement {
    this.expect('(');
    const args: SolidScriptArgument[] = this.parseArguments();
    return { kind: 'module_call', name, args, children: this.parseChild(), line };
  }

  /**
   * Parses a module definition.
   *
   * @param line Source line.
   * @returns Definition statement.
   */
  private parseModuleDefine(line: number): SolidScriptStatement {
    this.next();
    const name = this.expectIdentifier();
    const params = this.parseParameters();
    return { kind: 'module_define', name, params, body: this.parseChild(), line };
  }

  /**
   * Parses a function definition.
   *
   * @param line Source line.
   * @returns Definition statement.
   */
  private parseFunctionDefine(line: number): SolidScriptStatement {
    this.next();
    const name = this.expectIdentifier();
    const params = this.parseParameters();
    this.expect('=');
    const body = this.parseExpression();
    this.expect(';');
    return { kind: 'function_define', name, params, body, line };
  }

  /**
   * Parses a parameter list including both parentheses.
   *
   * @returns Parameters.
   */
  private parseParameters(): SolidScriptParameter[] {
    this.expect('(');
    const params: SolidScriptParameter[] = [];
    while (!this.accept(')')) {
      const name = this.expectIdentifier();
      params.push({ name, fallback: this.accept('=') ? this.parseExpression() : null });
      if (!this.accept(',')) {
        this.expect(')');
        break;
      }
    }
    return params;
  }

  /**
   * Parses an if statement with an optional else branch.
   *
   * @param line Source line.
   * @returns If statement.
   */
  private parseIf(line: number): SolidScriptStatement {
    this.next();
    this.expect('(');
    const condition = this.parseExpression();
    this.expect(')');
    const then = this.parseChild();
    const otherwise = this.peek().text === 'else' ? (this.next(), this.parseChild()) : [];
    return { kind: 'if', condition, then, otherwise, line };
  }

  /**
   * Parses a for statement.
   *
   * @param line Source line.
   * @returns For statement.
   */
  private parseFor(line: number): SolidScriptStatement {
    this.next();
    const bindings: SolidScriptBinding[] = this.parseBindings();
    return { kind: 'for', bindings, body: this.parseChild(), line };
  }
}
