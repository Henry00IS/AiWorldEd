/** Kind of one lexical token. */
export type ScadTokenKind = 'number' | 'string' | 'identifier' | 'symbol' | 'end';

/** One lexical token with its source line. */
export interface ScadToken {
  kind: ScadTokenKind;
  text: string;
  line: number;
}

/** Symbols made of two characters, matched before single characters. */
const SCAD_SYMBOLS_DOUBLE = ['<=', '>=', '==', '!=', '&&', '||'];

/** Single-character symbols. */
const SCAD_SYMBOLS_SINGLE = '()[]{};,=+-*/%<>!?:.#';

/** Splits OpenSCAD source text into tokens, skipping whitespace and comments. */
export class ScadLexer {
  private readonly source: string;
  private position = 0;
  private line = 1;
  private readonly tokens: ScadToken[] = [];

  /**
   * Creates a lexer.
   *
   * @param source OpenSCAD source text.
   */
  constructor(source: string) {
    this.source = source;
  }

  /**
   * Tokenizes the whole source.
   *
   * @returns Tokens ending with an end token.
   */
  tokenize(): ScadToken[] {
    while (this.skipBlank()) {
      this.tokens.push(this.tokenNext());
    }
    this.tokens.push({ kind: 'end', text: '', line: this.line });
    return this.tokens;
  }

  /**
   * Skips whitespace and comments.
   *
   * @returns True when source text remains.
   */
  private skipBlank(): boolean {
    for (;;) {
      const char = this.source[this.position];
      if (char === undefined) return false;
      if (char === '\n') this.line += 1;
      if (/\s/.test(char)) this.position += 1;
      else if (this.source.startsWith('//', this.position)) this.skipUntil('\n');
      else if (this.source.startsWith('/*', this.position)) this.skipBlockComment();
      else return true;
    }
  }

  /**
   * Skips up to (not including) a terminator.
   *
   * @param terminator Text that ends the skip.
   */
  private skipUntil(terminator: string): void {
    const end = this.source.indexOf(terminator, this.position);
    this.position = end < 0 ? this.source.length : end;
  }

  /** Skips one block comment, counting its lines. */
  private skipBlockComment(): void {
    const end = this.source.indexOf('*/', this.position + 2);
    const stop = end < 0 ? this.source.length : end + 2;
    this.line += (this.source.slice(this.position, stop).match(/\n/g) ?? []).length;
    this.position = stop;
  }

  /**
   * Reads the token at the current position.
   *
   * @returns Token.
   */
  private tokenNext(): ScadToken {
    const rest = this.source.slice(this.position);
    const number = /^(\d+\.?\d*([eE][+-]?\d+)?|\.\d+([eE][+-]?\d+)?)/.exec(rest);
    if (number) return this.tokenTake('number', number[0]);
    const identifier = /^\$?[A-Za-z_][A-Za-z0-9_]*/.exec(rest);
    if (identifier) return this.tokenTake('identifier', identifier[0]);
    if (rest[0] === '"') return this.tokenString();
    const double = SCAD_SYMBOLS_DOUBLE.find((symbol) => rest.startsWith(symbol));
    if (double) return this.tokenTake('symbol', double);
    if (rest[0] !== undefined && SCAD_SYMBOLS_SINGLE.includes(rest[0])) return this.tokenTake('symbol', rest[0]);
    throw new Error(`line ${this.line}: unexpected character "${rest[0] ?? ''}"`);
  }

  /**
   * Consumes a token of known text.
   *
   * @param kind Token kind.
   * @param text Token text.
   * @returns Token.
   */
  private tokenTake(kind: ScadTokenKind, text: string): ScadToken {
    this.position += text.length;
    return { kind, text, line: this.line };
  }

  /**
   * Reads a double-quoted string with backslash escapes.
   *
   * @returns String token holding the unescaped text.
   */
  private tokenString(): ScadToken {
    let index = this.position + 1;
    let text = '';
    while (index < this.source.length && this.source[index] !== '"') {
      if (this.source[index] === '\\') index += 1;
      text += this.source[index] ?? '';
      index += 1;
    }
    if (index >= this.source.length) throw new Error(`line ${this.line}: unterminated string`);
    this.position = index + 1;
    return { kind: 'string', text, line: this.line };
  }
}
