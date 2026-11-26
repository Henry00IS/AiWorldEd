import { SearchFuzzySubsequence } from './search_fuzzy_subsequence.js';
import { SEARCH_FUZZY_NO_CHAIN, SearchFuzzyWordChain } from './search_fuzzy_word_chain.js';
import { SearchFuzzyText } from './search_fuzzy_text.js';

/** Score of a text that does not fit the query. */
export const SEARCH_FUZZY_NONE = 0;

/** How much one kind of match outweighs every detail of the kind below it. */
export const SEARCH_FUZZY_TIER_STEP = 1_000_000;

/** Kinds of match, from the weakest to the strongest. */
export const SEARCH_FUZZY_TIER = {
  empty: 1,
  subsequence: 2,
  substring: 3,
  words: 4,
  prefix: 5,
  exact: 6,
} as const;

/** Most detail points inside a kind of match. */
const SEARCH_FUZZY_DETAIL_MAX = 999;

/** Names longer than this gain nothing from being short. */
const SEARCH_FUZZY_SHORTNESS_MAX = 999;

/** Detail points when a match begins at the first word. */
const SEARCH_FUZZY_DETAIL_FIRST_WORD = 500;

/** Detail points lost per piece of a word chain, from nine pieces down. */
const SEARCH_FUZZY_DETAIL_PER_PIECE = 50;

/** Detail points of a run at the very start of a name, before word start points. */
const SEARCH_FUZZY_DETAIL_EARLY_MAX = 499;

/** Detail points lost per letter a run begins after the start. */
const SEARCH_FUZZY_DETAIL_PER_LETTER_IN = 10;

/** How many scattered points count as one detail point. */
const SEARCH_FUZZY_DETAIL_SCATTER_FACTOR = 3;

/**
 * Rates how well a typed query fits a name, the way autocomplete does: case,
 * spaces, accents and punctuation do not matter ("foreach" fits For Each), the
 * first letters of words fit ("fe", "blh" for Blast Hole) and scattered letters
 * fit too ("fch"). A higher score is a better fit; zero is no fit. From best to
 * worst: the whole name, its start, letters that begin words, letters in a row,
 * and scattered letters; shorter names and matches at word starts come first
 * inside each kind. A leading dollar sign only fits system names, which also
 * start with one. One typed character fits only at the start of a word.
 */
export class SearchFuzzy {
  /**
   * Rates how well a query fits a name.
   *
   * @param query Typed text.
   * @param name Name to find.
   * @returns Score, SEARCH_FUZZY_NONE when it does not fit.
   */
  static score(query: string | SearchFuzzyText, name: string | SearchFuzzyText): number {
    const wanted = typeof query === 'string' ? SearchFuzzyText.of(query) : query;
    const text = typeof name === 'string' ? SearchFuzzyText.of(name) : name;
    if (wanted.system && !text.system) {
      return SEARCH_FUZZY_NONE;
    }
    if (wanted.folded === '') {
      return SEARCH_FUZZY_TIER.empty * SEARCH_FUZZY_TIER_STEP;
    }
    return SearchFuzzy.scoreFolded(wanted, text);
  }

  /**
   * Tells whether a query fits a name.
   *
   * @param query Typed text.
   * @param name Name to find.
   * @returns True when it fits.
   */
  static fits(query: string | SearchFuzzyText, name: string | SearchFuzzyText): boolean {
    return SearchFuzzy.score(query, name) > SEARCH_FUZZY_NONE;
  }

  /**
   * Rates how well a query fits the best of several names.
   *
   * @param query Typed text.
   * @param names Names to find.
   * @returns Best score.
   */
  static scoreBest(query: string | SearchFuzzyText, names: readonly string[]): number {
    const wanted = typeof query === 'string' ? SearchFuzzyText.of(query) : query;
    return names.reduce((best, name) => Math.max(best, SearchFuzzy.score(wanted, name)), SEARCH_FUZZY_NONE);
  }

  /**
   * Rates a non-empty query against a name.
   *
   * @param wanted Prepared query.
   * @param text Prepared name.
   * @returns Score.
   */
  private static scoreFolded(wanted: SearchFuzzyText, text: SearchFuzzyText): number {
    const query = wanted.folded;
    if (query.length > text.folded.length) {
      return SEARCH_FUZZY_NONE;
    }
    if (query === text.folded) {
      return SearchFuzzy.tierScore(SEARCH_FUZZY_TIER.exact, wanted.lowered === text.lowered ? 1 : 0, text);
    }
    if (text.folded.startsWith(query)) {
      return SearchFuzzy.tierScore(SEARCH_FUZZY_TIER.prefix, 0, text);
    }
    if (!SearchFuzzySubsequence.fits(query, text.folded)) {
      return SEARCH_FUZZY_NONE;
    }
    return SearchFuzzy.scoreScattered(query, text);
  }

  /**
   * Rates a query that fits a name as scattered letters at best.
   *
   * @param query Folded query.
   * @param text Prepared name.
   * @returns Score; a single typed character only fits at a word start.
   */
  private static scoreScattered(query: string, text: SearchFuzzyText): number {
    const pieces = SearchFuzzyWordChain.fewestPieces(query, text, false);
    if (pieces !== SEARCH_FUZZY_NO_CHAIN) {
      return SearchFuzzy.tierScore(SEARCH_FUZZY_TIER.words, SearchFuzzy.wordChainDetail(query, text, pieces), text);
    }
    if (query.length < 2) {
      return SEARCH_FUZZY_NONE;
    }
    const inARow = SearchFuzzy.substringDetail(query, text);
    if (inARow >= 0) {
      return SearchFuzzy.tierScore(SEARCH_FUZZY_TIER.substring, inARow, text);
    }
    const points = SearchFuzzySubsequence.points(query, text) * SEARCH_FUZZY_DETAIL_SCATTER_FACTOR;
    return SearchFuzzy.tierScore(SEARCH_FUZZY_TIER.subsequence, points, text);
  }

  /**
   * Rates a word chain: starting at the first word and using fewer pieces is
   * better.
   *
   * @param query Folded query.
   * @param text Prepared name.
   * @param pieces Fewest pieces over any words.
   * @returns Detail points.
   */
  private static wordChainDetail(query: string, text: SearchFuzzyText, pieces: number): number {
    const fromFirst = SearchFuzzyWordChain.fewestPieces(query, text, true);
    const used = fromFirst === SEARCH_FUZZY_NO_CHAIN ? pieces : fromFirst;
    const first = fromFirst === SEARCH_FUZZY_NO_CHAIN ? 0 : SEARCH_FUZZY_DETAIL_FIRST_WORD;
    return first + SEARCH_FUZZY_DETAIL_PER_PIECE * Math.max(0, 9 - used);
  }

  /**
   * Rates the best place the query stands as a run of the name.
   *
   * @param query Folded query.
   * @param text Prepared name.
   * @returns Detail points: more at a word start and nearer the start; -1 when
   *   it is no run.
   */
  private static substringDetail(query: string, text: SearchFuzzyText): number {
    let best = -1;
    for (let at = text.folded.indexOf(query); at >= 0; at = text.folded.indexOf(query, at + 1)) {
      const bonus = text.wordStartAt(at) ? SEARCH_FUZZY_DETAIL_FIRST_WORD : 0;
      best = Math.max(
        best,
        bonus + Math.max(0, SEARCH_FUZZY_DETAIL_EARLY_MAX - at * SEARCH_FUZZY_DETAIL_PER_LETTER_IN),
      );
    }
    return best;
  }

  /**
   * Builds a score from a kind of match, its detail and the length of the name.
   *
   * @param tier Kind of match.
   * @param detail Detail points.
   * @param text Prepared name.
   * @returns Score.
   */
  private static tierScore(tier: number, detail: number, text: SearchFuzzyText): number {
    const shortness = Math.max(0, SEARCH_FUZZY_SHORTNESS_MAX - text.folded.length);
    return tier * SEARCH_FUZZY_TIER_STEP + Math.min(detail, SEARCH_FUZZY_DETAIL_MAX) * 1000 + shortness;
  }
}
