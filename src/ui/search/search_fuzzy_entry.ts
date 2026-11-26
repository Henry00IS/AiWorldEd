import { SEARCH_FUZZY_NONE, SEARCH_FUZZY_TIER, SEARCH_FUZZY_TIER_STEP, SearchFuzzy } from './search_fuzzy.js';
import { SearchFuzzyText } from './search_fuzzy_text.js';

/**
 * Score of a word found only in the other text of an entry: above a bare empty
 * query, below any name match.
 */
export const SEARCH_FUZZY_ENTRY_DETAIL_SCORE = SEARCH_FUZZY_TIER.empty * SEARCH_FUZZY_TIER_STEP + 100_000;

/** Score lost when a word fits an alternate name instead of the main one. */
export const SEARCH_FUZZY_ENTRY_ALTERNATE_PENALTY = SEARCH_FUZZY_TIER_STEP / 2;

/**
 * Scores below this and above the other-text score are scattered letters or a
 * weak alternate name.
 */
export const SEARCH_FUZZY_ENTRY_SCATTERED_CEILING = SEARCH_FUZZY_TIER.substring * SEARCH_FUZZY_TIER_STEP;

/** What a list entry offers to a search. */
export interface SearchFuzzyEntryText {
  /** The main name first, then other names it is found by. */
  names: readonly string[];
  /** Other text of the entry in lower case. */
  details: string;
}

/** A typed query split and prepared once, to rate many entries with. */
export interface SearchFuzzyEntryQuery {
  /** Lower case words. */
  words: readonly string[];
  /** Whole query prepared as one name; null for fewer than two words. */
  whole: SearchFuzzyText | null;
  /** Each word prepared. */
  prepared: readonly SearchFuzzyText[];
}

/**
 * Rates how well a typed query fits an entry that has a main name, other names
 * and more text, such as a command with its label, synonyms and description.
 * The whole query is tried on the names first, as one name typed without
 * spaces. Otherwise every typed word must fit a name or appear in the other
 * text, and the entry scores as its weakest word.
 */
export class SearchFuzzyEntry {
  /**
   * Splits a typed query into its words.
   *
   * @param query Typed text.
   * @returns Lower case words, empty when nothing is typed.
   */
  static words(query: string): string[] {
    return query.toLowerCase().split(/\s+/).filter(Boolean);
  }

  /**
   * Splits a typed query and prepares its parts.
   *
   * @param query Typed text.
   * @returns Prepared query.
   */
  static prepare(query: string): SearchFuzzyEntryQuery {
    const words = SearchFuzzyEntry.words(query);
    return {
      words,
      whole: words.length > 1 ? SearchFuzzyText.of(query) : null,
      prepared: words.map((word) => SearchFuzzyText.of(word)),
    };
  }

  /**
   * Rates a query against an entry.
   *
   * @param query Typed text, or the query prepared.
   * @param names The main name first, then other names it is found by.
   * @param details Other text of the entry in lower case, searched for words as
   *   typed.
   * @returns Score, SEARCH_FUZZY_NONE when the entry does not fit.
   */
  static score(query: string | SearchFuzzyEntryQuery, names: readonly string[], details: string): number {
    const typed = typeof query === 'string' ? SearchFuzzyEntry.prepare(query) : query;
    if (typed.words.length === 0) {
      return SEARCH_FUZZY_TIER.empty * SEARCH_FUZZY_TIER_STEP;
    }
    const whole = typed.whole ? SearchFuzzyEntry.scoreNames(typed.whole, names) : SEARCH_FUZZY_NONE;
    if (whole > SEARCH_FUZZY_NONE) {
      return whole;
    }
    let weakest = Infinity;
    for (const prepared of typed.prepared) {
      weakest = Math.min(weakest, SearchFuzzyEntry.scoreWord(prepared, names, details));
    }
    return weakest;
  }

  /**
   * Tells whether a score is only scattered letters or a weak alternate name.
   *
   * @param score Score of an entry.
   * @returns True when it is above a word found in the other text and below a
   *   run of letters.
   */
  static isScattered(score: number): boolean {
    return score > SEARCH_FUZZY_ENTRY_DETAIL_SCORE && score < SEARCH_FUZZY_ENTRY_SCATTERED_CEILING;
  }

  /**
   * Tells whether a query fits an entry more closely than scattered letters.
   *
   * @param query Typed text.
   * @param names The main name first, then other names.
   * @param details Other text of the entry in lower case.
   * @returns True when it fits.
   */
  static fitsClosely(query: string, names: readonly string[], details: string): boolean {
    const score = SearchFuzzyEntry.score(query, names, details);
    return score > SEARCH_FUZZY_NONE && !SearchFuzzyEntry.isScattered(score);
  }

  /**
   * Rates a query against a list of entries. Scattered letters fit only while
   * no entry fits more closely, so a name typed in full does not list every
   * name that merely holds its letters.
   *
   * @param query Typed text.
   * @param entries Entries.
   * @returns One score per entry; SEARCH_FUZZY_NONE for entries that do not
   *   fit.
   */
  static scoreList(query: string, entries: readonly SearchFuzzyEntryText[]): number[] {
    const typed = SearchFuzzyEntry.prepare(query);
    const scores = entries.map((entry) => SearchFuzzyEntry.score(typed, entry.names, entry.details));
    const closest = scores.some((score) => score >= SEARCH_FUZZY_ENTRY_SCATTERED_CEILING);
    return closest ? scores.map((score) => (SearchFuzzyEntry.isScattered(score) ? SEARCH_FUZZY_NONE : score)) : scores;
  }

  /**
   * Rates one typed word against the names and the other text.
   *
   * @param prepared The lower case word, prepared.
   * @param names The main name first, then other names.
   * @param details Other text in lower case.
   * @returns Score.
   */
  private static scoreWord(prepared: SearchFuzzyText, names: readonly string[], details: string): number {
    if (prepared.folded === '') {
      return details.includes(prepared.lowered) ? SEARCH_FUZZY_ENTRY_DETAIL_SCORE : SEARCH_FUZZY_NONE;
    }
    const found = SearchFuzzyEntry.scoreNames(prepared, names);
    const inDetails = details.includes(prepared.lowered) ? SEARCH_FUZZY_ENTRY_DETAIL_SCORE : SEARCH_FUZZY_NONE;
    return Math.max(found, inDetails);
  }

  /**
   * Rates a query against the names, the other names a little lower.
   *
   * @param query Prepared query.
   * @param names The main name first, then other names.
   * @returns Best score.
   */
  private static scoreNames(query: SearchFuzzyText, names: readonly string[]): number {
    let best = SEARCH_FUZZY_NONE;
    for (const [index, name] of names.entries()) {
      const score = SearchFuzzy.score(query, name);
      const adjusted =
        index === 0 || score === SEARCH_FUZZY_NONE ? score : score - SEARCH_FUZZY_ENTRY_ALTERNATE_PENALTY;
      best = Math.max(best, adjusted);
    }
    return best;
  }
}
