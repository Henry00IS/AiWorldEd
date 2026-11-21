/** Kind of one lexical token. */
export type SolidScriptTokenKind = 'number' | 'string' | 'identifier' | 'symbol' | 'end';

/** One lexical token with its source line. */
export interface SolidScriptToken {
  kind: SolidScriptTokenKind;
  text: string;
  line: number;
  /** Index of the token's first character in the source. */
  start: number;
  /** Index after the token's last character in the source. */
  end: number;
}

/** Symbols made of two characters, matched before single characters. */
const SOLID_SCRIPT_SYMBOLS_DOUBLE = ['<=', '>=', '==', '!=', '&&', '||'];

/** Words that read like the symbols they stand for: and, or, not. */
const SOLID_SCRIPT_WORD_SYMBOLS: ReadonlyMap<string, string> = new Map([
  ['and', '&&'],
  ['or', '||'],
  ['not', '!'],
]);

/** Single-character symbols. */
const SOLID_SCRIPT_SYMBOLS_SINGLE = '()[]{};,=+-*/%^<>!?:.#';

/**
 * Splits solid script source text into tokens, skipping whitespace and
 * comments.
 */
export class SolidScriptLexer {
  private readonly source: string;
  private position = 0;
  private line = 1;
  private readonly tokens: SolidScriptToken[] = [];

  /**
   * Creates a lexer.
   *
   * @param source Solid script source text.
   */
  constructor(source: string) {
    this.source = source;
  }

  /**
   * Tokenizes the whole source.
   *
   * @returns Tokens ending with an end token.
   */
  tokenize(): SolidScriptToken[] {
    while (this.skipBlank()) {
      this.tokens.push(this.tokenNext());
    }
    const length = this.source.length;
    this.tokens.push({ kind: 'end', text: '', line: this.line, start: length, end: length });
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
  private tokenNext(): SolidScriptToken {
    const rest = this.source.slice(this.position);
    const number = /^(\d+\.?\d*([eE][+-]?\d+)?|\.\d+([eE][+-]?\d+)?)/.exec(rest);
    if (number) {
      const glued = /^[A-Za-z0-9_.]+/.exec(rest.slice(number[0].length))?.[0] ?? '';
      const word = number[0] + glued;
      if (glued !== '') throw new Error(`line ${this.line}: ${word} isn't a number; for text write "${word}"`);
      return this.tokenTake('number', number[0]);
    }
    const identifier = /^\$?[A-Za-z_][A-Za-z0-9_]*/.exec(rest);
    if (identifier) {
      const word = SOLID_SCRIPT_WORD_SYMBOLS.get(identifier[0].toLowerCase());
      if (word === undefined) return this.tokenTake('identifier', identifier[0]);
      return this.tokenTake('symbol', word, identifier[0].length);
    }
    if (rest[0] === '"') return this.tokenString();
    const double = SOLID_SCRIPT_SYMBOLS_DOUBLE.find((symbol) => rest.startsWith(symbol));
    if (double) return this.tokenTake('symbol', double);
    if (rest[0] !== undefined && SOLID_SCRIPT_SYMBOLS_SINGLE.includes(rest[0]))
      return this.tokenTake('symbol', rest[0]);
    if (rest[0] === "'") {
      const text = /^'([^']*)'?/.exec(rest)?.[1] ?? '';
      throw new Error(`line ${this.line}: text in a formula takes double quotes; write "${text}"`);
    }
    throw new Error(`line ${this.line}: unexpected character "${rest[0] ?? ''}"`);
  }

  /**
   * Consumes a token of known text.
   *
   * @param kind Token kind.
   * @param text Token text.
   * @param length Characters it takes in the source, such as 3 for and read as
   *   &&.
   * @returns Token.
   */
  private tokenTake(kind: SolidScriptTokenKind, text: string, length = text.length): SolidScriptToken {
    const start = this.position;
    this.position += length;
    return { kind, text, line: this.line, start, end: this.position };
  }

  /**
   * Reads a double-quoted string. A $ keeps the next character as typed where
   * it would mean something else: $" is a double quote and $$ a dollar sign,
   * with $[, $] and $, like field text. Any other character, a backslash too,
   * is itself.
   *
   * @returns String token holding the text without its escapes.
   */
  private tokenString(): SolidScriptToken {
    let index = this.position + 1;
    let text = '';
    while (index < this.source.length && this.source[index] !== '"') {
      const escaped = solidScriptStringEscapes(this.source, index);
      text += this.source[escaped ? index + 1 : index] ?? '';
      index += escaped ? 2 : 1;
    }
    if (index >= this.source.length) throw new Error(`line ${this.line}: unterminated string`);
    const start = this.position;
    this.position = index + 1;
    return { kind: 'string', text, line: this.line, start, end: this.position };
  }
}

/**
 * Characters a $ keeps as typed in field text: $$, $[, $] and $, for a comma
 * inside a list item. A $ before anything else is itself, as in
 * [$Selected.Faces].
 */
export const SOLID_SCRIPT_ESCAPED: ReadonlySet<string> = new Set(['$', '[', ']', ',']);

/**
 * Tells whether the character at a place in a formula string is a $ that keeps
 * the next one as typed: the escapes of field text, and $" for a double quote.
 * Inside a formula string only the formula reads them, so each is read once.
 *
 * @param text Formula text.
 * @param index Place.
 * @returns True for such a $.
 */
export function solidScriptStringEscapes(text: string, index: number): boolean {
  return text[index] === '$' && (text[index + 1] === '"' || SOLID_SCRIPT_ESCAPED.has(text[index + 1] ?? ''));
}

/**
 * Writes a text as a formula string that reads back as the same text: in double
 * quotes, with $" for a double quote and $$ for a dollar sign.
 *
 * @param text Text.
 * @returns Formula string.
 */
export function solidScriptStringWrite(text: string): string {
  return `"${text.replace(/[$"]/g, (character) => `$${character}`)}"`;
}
