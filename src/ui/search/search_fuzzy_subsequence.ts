import type { SearchFuzzyText } from './search_fuzzy_text.js';

/** Stands for a score nothing reaches. */
const SEARCH_FUZZY_UNREACHED = -1_000_000;

/** Points for a character that begins a word. */
const SEARCH_FUZZY_POINTS_WORD_START = 10;

/** Points for a character right after the one before it. */
const SEARCH_FUZZY_POINTS_NEXT_TO = 6;

/** Points for matching the very first character of the text. */
const SEARCH_FUZZY_POINTS_FIRST = 8;

/** Most query characters times text characters that are rated. */
const SEARCH_FUZZY_POINTS_WORK_MAX = 4000000;

/**
 * Matches a query as scattered characters of a text in order, such as "fch" in
 * For Each, and rates how naturally they fall.
 */
export class SearchFuzzySubsequence {
  /**
   * Tells whether the characters of a query appear in order in a text.
   *
   * @param query Folded query.
   * @param folded Folded text.
   * @returns True when they do.
   */
  static fits(query: string, folded: string): boolean {
    let at = 0;
    for (let index = 0; index < folded.length && at < query.length; index++) {
      if (folded.charAt(index) === query.charAt(at)) {
        at++;
      }
    }
    return at === query.length;
  }

  /**
   * Rates the best way the query falls in the text: points for characters that
   * begin words, follow each other or start the text.
   *
   * @param query Folded query that fits the text.
   * @param text Prepared text.
   * @returns Points, higher is more natural; zero for a text too long to rate.
   */
  static points(query: string, text: SearchFuzzyText): number {
    if (query.length * text.folded.length > SEARCH_FUZZY_POINTS_WORK_MAX) {
      return 0;
    }
    let previous = SearchFuzzySubsequence.rowFirst(query.charAt(0), text);
    for (let at = 1; at < query.length; at++) {
      previous = SearchFuzzySubsequence.rowNext(query.charAt(at), text, previous);
    }
    return previous.reduce((best, value) => Math.max(best, value), 0);
  }

  /**
   * Rates each place the first query character may stand.
   *
   * @param character First query character.
   * @param text Prepared text.
   * @returns Best points per text index.
   */
  private static rowFirst(character: string, text: SearchFuzzyText): Int32Array {
    const row = new Int32Array(text.folded.length).fill(SEARCH_FUZZY_UNREACHED);
    for (let index = 0; index < row.length; index++) {
      if (text.folded.charAt(index) === character) {
        const first = index === 0 ? SEARCH_FUZZY_POINTS_FIRST : 0;
        row[index] = first + SearchFuzzySubsequence.pointsAt(text, index);
      }
    }
    return row;
  }

  /**
   * Rates each place a later query character may stand, given the places of the
   * one before it.
   *
   * @param character Query character.
   * @param text Prepared text.
   * @param previous Best points per text index of the character before.
   * @returns Best points per text index.
   */
  private static rowNext(character: string, text: SearchFuzzyText, previous: Int32Array): Int32Array {
    const row = new Int32Array(text.folded.length).fill(SEARCH_FUZZY_UNREACHED);
    let farBest = SEARCH_FUZZY_UNREACHED;
    for (let index = 1; index < row.length; index++) {
      farBest = Math.max(farBest, previous[index - 2] ?? SEARCH_FUZZY_UNREACHED);
      if (text.folded.charAt(index) !== character) {
        continue;
      }
      const near = (previous[index - 1] ?? SEARCH_FUZZY_UNREACHED) + SEARCH_FUZZY_POINTS_NEXT_TO;
      const reach = Math.max(farBest, near);
      row[index] = reach > SEARCH_FUZZY_UNREACHED / 2 ? reach + SearchFuzzySubsequence.pointsAt(text, index) : reach;
    }
    return row;
  }

  /**
   * Gives the points for standing at a text index.
   *
   * @param text Prepared text.
   * @param index Index into the folded text.
   * @returns Points.
   */
  private static pointsAt(text: SearchFuzzyText, index: number): number {
    return 1 + (text.wordStartAt(index) ? SEARCH_FUZZY_POINTS_WORD_START : 0);
  }
}
