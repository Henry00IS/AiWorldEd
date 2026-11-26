/** Letters and digits of any language. */
const SEARCH_FUZZY_LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;

/** Accent marks that fold away. */
const SEARCH_FUZZY_MARK = /\p{M}/u;

/** Digits of any language. */
const SEARCH_FUZZY_DIGIT = /\p{N}/u;

/** Most prepared texts remembered before the memory starts over. */
const SEARCH_FUZZY_MEMORY_MAX = 20000;

/**
 * Text prepared for fuzzy matching: its letters and digits in lower case with
 * accents and punctuation left out, where its words begin, and whether it is a
 * system name that starts with a dollar sign.
 */
export class SearchFuzzyText {
  private static readonly memory = new Map<string, SearchFuzzyText>();

  /** Letters and digits in lower case, without spaces, punctuation or accents. */
  readonly folded: string;
  /** One flag per folded character: 1 where a word begins. */
  readonly wordStarts: Uint8Array;
  /** Folded index where each word begins, in order. */
  readonly wordStartIndexes: number[];
  /** True when the text starts with a dollar sign. */
  readonly system: boolean;
  /** Trimmed text in lower case. */
  readonly lowered: string;

  /**
   * Prepares a text.
   *
   * @param raw Text as written.
   */
  constructor(raw: string) {
    this.lowered = raw.trim().toLowerCase();
    this.system = this.lowered.startsWith('$');
    const scanned = SearchFuzzyText.scan(raw);
    this.folded = scanned.folded;
    this.wordStarts = scanned.wordStarts;
    this.wordStartIndexes = [];
    this.wordStarts.forEach((flag, index) => flag === 1 && this.wordStartIndexes.push(index));
  }

  /**
   * Prepares a text once and remembers it for the next time.
   *
   * @param raw Text as written.
   * @returns Prepared text.
   */
  static of(raw: string): SearchFuzzyText {
    const known = SearchFuzzyText.memory.get(raw);
    if (known) {
      return known;
    }
    if (SearchFuzzyText.memory.size >= SEARCH_FUZZY_MEMORY_MAX) {
      SearchFuzzyText.memory.clear();
    }
    const made = new SearchFuzzyText(raw);
    SearchFuzzyText.memory.set(raw, made);
    return made;
  }

  /**
   * Tells whether a folded character index is where a word begins.
   *
   * @param index Index into the folded text.
   * @returns True at the first character of a word.
   */
  wordStartAt(index: number): boolean {
    return this.wordStarts[index] === 1;
  }

  /**
   * Folds a text and finds where its words begin.
   *
   * @param raw Text as written.
   * @returns Folded text and word start flags.
   */
  private static scan(raw: string): { folded: string; wordStarts: Uint8Array } {
    const points = Array.from(raw.normalize('NFD')).filter((point) => !SEARCH_FUZZY_MARK.test(point));
    const characters: string[] = [];
    const flags: number[] = [];
    let previous = '';
    for (const [index, point] of points.entries()) {
      if (!SEARCH_FUZZY_LETTER_OR_DIGIT.test(point)) {
        previous = '';
        continue;
      }
      const start = SearchFuzzyText.beginsWord(previous, point, points[index + 1] ?? '');
      const lowered = point.toLowerCase().replace('ß', 'ss');
      for (let unitIndex = 0; unitIndex < lowered.length; unitIndex++) {
        characters.push(lowered.charAt(unitIndex));
        flags.push(start && unitIndex === 0 ? 1 : 0);
      }
      previous = point;
    }
    return { folded: characters.join(''), wordStarts: Uint8Array.from(flags) };
  }

  /**
   * Tells whether a character begins a word: after a separator, at a capital
   * after a small letter, at the last capital of a run before a small letter,
   * and where letters meet digits.
   *
   * @param previous Character before it in the same run, or empty.
   * @param point The character.
   * @param next Character after it.
   * @returns True when a word begins here.
   */
  private static beginsWord(previous: string, point: string, next: string): boolean {
    if (previous === '') {
      return true;
    }
    if (SEARCH_FUZZY_DIGIT.test(point) !== SEARCH_FUZZY_DIGIT.test(previous)) {
      return true;
    }
    if (!SearchFuzzyText.isUpper(point)) {
      return false;
    }
    if (!SearchFuzzyText.isUpper(previous)) {
      return true;
    }
    return next !== '' && !SearchFuzzyText.isUpper(next) && !SEARCH_FUZZY_DIGIT.test(next);
  }

  /**
   * Tells whether a character is a capital letter.
   *
   * @param point Character.
   * @returns True for a letter that has a lower case form.
   */
  private static isUpper(point: string): boolean {
    return point !== point.toLowerCase();
  }
}
