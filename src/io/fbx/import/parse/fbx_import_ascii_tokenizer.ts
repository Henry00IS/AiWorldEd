/** One lexical token of an ASCII FBX file. */
export type FbxImportAsciiToken =
  | { kind: 'key'; text: string }
  | { kind: 'value'; value: number | bigint | string }
  | { kind: 'count' }
  | { kind: 'comma' }
  | { kind: 'open' }
  | { kind: 'close' }
  | { kind: 'end' };

/** Characters that may appear in record names and bare words. */
const FBX_IMPORT_ASCII_WORD_PATTERN = /[A-Za-z0-9_|.+\-#]/;

/** Characters that start a number. */
const FBX_IMPORT_ASCII_NUMBER_START_PATTERN = /[0-9+\-.]/;

/** Plain decimal integer text. */
const FBX_IMPORT_ASCII_INTEGER_PATTERN = /^[+-]?\d+$/;

/**
 * Splits ASCII FBX text into tokens: record names ("Name:"), values (numbers,
 * quoted strings, bare words), array counts ("*12"), commas and braces.
 * Comments (";" to the end of the line) are skipped.
 */
export class FbxImportAsciiTokenizer {
  private position = 0;
  private peeked: FbxImportAsciiToken | null = null;

  /**
   * Creates a tokenizer.
   *
   * @param text File text.
   */
  constructor(private readonly text: string) {}

  /**
   * Returns the next token without consuming it.
   *
   * @returns Token.
   */
  peek(): FbxImportAsciiToken {
    this.peeked ??= this.scan();
    return this.peeked;
  }

  /**
   * Consumes and returns the next token.
   *
   * @returns Token.
   */
  next(): FbxImportAsciiToken {
    const token = this.peek();
    this.peeked = null;
    return token;
  }

  /**
   * Scans one token at the read position.
   *
   * @returns Token.
   */
  private scan(): FbxImportAsciiToken {
    this.whitespaceAndCommentsSkip();
    const character = this.text[this.position];
    if (character === undefined) return { kind: 'end' };
    const punctuation = this.punctuationScan(character);
    if (punctuation !== null) return punctuation;
    if (character === '"') return { kind: 'value', value: this.stringScan() };
    return this.wordScan();
  }

  /**
   * Scans a comma, brace or array count.
   *
   * @param character Character at the read position.
   * @returns Token, or null when the character starts no punctuation.
   */
  private punctuationScan(character: string): FbxImportAsciiToken | null {
    if (character === ',') return this.single({ kind: 'comma' });
    if (character === '{') return this.single({ kind: 'open' });
    if (character === '}') return this.single({ kind: 'close' });
    if (character !== '*') return null;
    this.position++;
    this.wordRead();
    return { kind: 'count' };
  }

  /**
   * Consumes one character and returns a token.
   *
   * @param token Token for that character.
   * @returns The token.
   */
  private single(token: FbxImportAsciiToken): FbxImportAsciiToken {
    this.position++;
    return token;
  }

  /**
   * Scans a record name, number or bare word.
   *
   * @returns Token.
   */
  private wordScan(): FbxImportAsciiToken {
    const word = this.wordRead();
    if (word.length === 0) {
      this.position++;
      return this.scan();
    }
    if (this.text[this.position] === ':') {
      this.position++;
      return { kind: 'key', text: word };
    }
    return { kind: 'value', value: fbxImportAsciiWordValue(word) };
  }

  /**
   * Reads the run of word characters at the read position.
   *
   * @returns Word, possibly empty.
   */
  private wordRead(): string {
    const start = this.position;
    while (this.position < this.text.length && FBX_IMPORT_ASCII_WORD_PATTERN.test(this.text[this.position] ?? '')) {
      this.position++;
    }
    return this.text.slice(start, this.position);
  }

  /**
   * Reads a quoted string; """ stands for a quote character.
   *
   * @returns String content.
   */
  private stringScan(): string {
    const end = this.text.indexOf('"', this.position + 1);
    const stop = end < 0 ? this.text.length : end;
    const content = this.text.slice(this.position + 1, stop);
    this.position = stop + 1;
    return content.replaceAll('&quot;', '"');
  }

  /** Skips whitespace and comments. */
  private whitespaceAndCommentsSkip(): void {
    while (this.position < this.text.length) {
      const code = this.text.charCodeAt(this.position);
      if (code === 59) this.commentSkip();
      else if (code <= 32) this.position++;
      else return;
    }
  }

  /** Skips a comment to the end of its line. */
  private commentSkip(): void {
    const lineEnd = this.text.indexOf('\n', this.position);
    this.position = lineEnd < 0 ? this.text.length : lineEnd + 1;
  }
}

/**
 * Converts a bare word to a number when it is numeric; large integers stay
 * exact as bigint.
 *
 * @param word Bare word.
 * @returns Number, bigint or the word itself.
 */
function fbxImportAsciiWordValue(word: string): number | bigint | string {
  if (!FBX_IMPORT_ASCII_NUMBER_START_PATTERN.test(word[0] ?? '')) return word;
  if (FBX_IMPORT_ASCII_INTEGER_PATTERN.test(word)) {
    const integer = Number(word);
    return Number.isSafeInteger(integer) ? integer : BigInt(word);
  }
  const number = Number(word);
  return Number.isNaN(number) ? word : number;
}
