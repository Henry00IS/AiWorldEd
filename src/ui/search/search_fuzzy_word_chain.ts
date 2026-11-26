import type { SearchFuzzyText } from './search_fuzzy_text.js';

/** Stands for no way to match. */
export const SEARCH_FUZZY_NO_CHAIN = Number.POSITIVE_INFINITY;

/** Most words a text may have for a chain to be searched. */
const SEARCH_FUZZY_CHAIN_WORDS_MAX = 256;

/** Most query characters times words a chain search takes on. */
const SEARCH_FUZZY_CHAIN_WORK_MAX = 100000;

/**
 * Matches a query as a chain of pieces that each begin a word of a text, in
 * order, skipping words where it likes: "fe" is the starts of For Each and
 * "blh" is the starts of Blast Hole.
 */
export class SearchFuzzyWordChain {
  private readonly memory = new Map<number, number>();

  /**
   * Prepares a search of one text.
   *
   * @param query Folded query.
   * @param text Prepared text.
   * @param firstWordOnly True when the first piece must begin the first word.
   */
  private constructor(
    private readonly query: string,
    private readonly text: SearchFuzzyText,
    private readonly firstWordOnly: boolean,
  ) {}

  /**
   * Counts the fewest pieces that spell the query.
   *
   * @param query Folded query.
   * @param text Prepared text.
   * @param firstWordOnly True when the first piece must begin the first word.
   * @returns Piece count, or SEARCH_FUZZY_NO_CHAIN when the words do not spell
   *   it.
   */
  static fewestPieces(query: string, text: SearchFuzzyText, firstWordOnly: boolean): number {
    const words = text.wordStartIndexes.length;
    if (words > SEARCH_FUZZY_CHAIN_WORDS_MAX || words * query.length > SEARCH_FUZZY_CHAIN_WORK_MAX) {
      return SEARCH_FUZZY_NO_CHAIN;
    }
    return new SearchFuzzyWordChain(query, text, firstWordOnly).solve(0, 0);
  }

  /**
   * Counts the fewest pieces that spell the rest of the query from a word on.
   *
   * @param queryIndex Where the rest of the query begins.
   * @param wordIndex First word that may hold the next piece.
   * @returns Piece count, or SEARCH_FUZZY_NO_CHAIN.
   */
  private solve(queryIndex: number, wordIndex: number): number {
    if (queryIndex === this.query.length) {
      return 0;
    }
    const wordCount = this.text.wordStartIndexes.length;
    if (wordIndex >= wordCount) {
      return SEARCH_FUZZY_NO_CHAIN;
    }
    const key = queryIndex * (wordCount + 1) + wordIndex;
    const known = this.memory.get(key);
    if (known !== undefined) {
      return known;
    }
    const skipping =
      queryIndex === 0 && this.firstWordOnly ? SEARCH_FUZZY_NO_CHAIN : this.solve(queryIndex, wordIndex + 1);
    const best = Math.min(skipping, this.solveWithPieceIn(queryIndex, wordIndex));
    this.memory.set(key, best);
    return best;
  }

  /**
   * Counts the fewest pieces when the next piece lies at the start of a word.
   *
   * @param queryIndex Where the rest of the query begins.
   * @param word Word that holds the piece.
   * @returns Piece count, or SEARCH_FUZZY_NO_CHAIN.
   */
  private solveWithPieceIn(queryIndex: number, word: number): number {
    let best = SEARCH_FUZZY_NO_CHAIN;
    for (let length = this.pieceLongest(queryIndex, word); length >= 1; length--) {
      best = Math.min(best, 1 + this.solve(queryIndex + length, word + 1));
    }
    return best;
  }

  /**
   * Measures how much of the rest of the query the start of a word spells.
   *
   * @param queryIndex Where the rest of the query begins.
   * @param word Word to compare.
   * @returns Number of characters, within the word.
   */
  private pieceLongest(queryIndex: number, word: number): number {
    const starts = this.text.wordStartIndexes;
    const from = starts[word] ?? 0;
    const to = starts[word + 1] ?? this.text.folded.length;
    let length = 0;
    while (
      from + length < to &&
      queryIndex + length < this.query.length &&
      this.text.folded.charAt(from + length) === this.query.charAt(queryIndex + length)
    ) {
      length++;
    }
    return length;
  }
}
