import { describe, expect, it } from 'vitest';
import { SEARCH_FUZZY_NONE, SEARCH_FUZZY_TIER, SEARCH_FUZZY_TIER_STEP, SearchFuzzy } from '@/ui/search/search_fuzzy.js';

/**
 * Reads the kind of match of a score.
 *
 * @param score Score.
 * @returns Tier number.
 */
function tierOf(score: number): number {
  return Math.floor(score / SEARCH_FUZZY_TIER_STEP);
}

/**
 * Sorts names by how well a query fits them, best first, dropping those that do
 * not fit.
 *
 * @param query Typed text.
 * @param names Names.
 * @returns Names in rank order.
 */
function ranked(query: string, names: string[]): string[] {
  return names
    .map((name, index) => ({ name, index, score: SearchFuzzy.score(query, name) }))
    .filter((entry) => entry.score > SEARCH_FUZZY_NONE)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.name);
}

describe('SearchFuzzy', () => {
  it.each([
    ['foreach', 'For Each'],
    ['FOREACH', 'For Each'],
    ['for each', 'For Each'],
    ['for_each', 'For Each'],
    ['fe', 'For Each'],
    ['FE', 'For Each'],
    ['fch', 'For Each'],
    ['blh', 'Blast Hole'],
    ['bh', 'Blast Hole'],
    ['blasth', 'Blast Hole'],
    ['hole', 'Blast Hole'],
    ['mfs', 'Mesh From Solids'],
    ['meshfromsolids', 'Mesh From Solids'],
    ['padl', 'PadLeft'],
    ['pl', 'PadLeft'],
    ['v3', 'Vector3'],
    ['cafe', 'Café'],
    ['grosse', 'Große Straße'],
    ['日語', '日本語'],
  ])('finds %s in %s', (query, name) => {
    expect(SearchFuzzy.fits(query, name)).toBe(true);
  });

  it.each([
    ['foreachh', 'For Each'],
    ['ef', 'For Each'],
    ['xyz', 'For Each'],
    ['hf', 'Foreach'],
    ['blastholes', 'Blast Hole'],
    ['zz', 'Zebra'],
  ])('does not find %s in %s', (query, name) => {
    expect(SearchFuzzy.score(query, name)).toBe(SEARCH_FUZZY_NONE);
  });

  it('ranks the kinds of match in the promised order', () => {
    const exact = SearchFuzzy.score('for each', 'For Each');
    const prefix = SearchFuzzy.score('for', 'For Each');
    const words = SearchFuzzy.score('fe', 'For Each');
    const run = SearchFuzzy.score('orea', 'For Each');
    const scattered = SearchFuzzy.score('fch', 'For Each');
    expect([exact, prefix, words, run, scattered].map(tierOf)).toEqual([
      SEARCH_FUZZY_TIER.exact,
      SEARCH_FUZZY_TIER.prefix,
      SEARCH_FUZZY_TIER.words,
      SEARCH_FUZZY_TIER.substring,
      SEARCH_FUZZY_TIER.subsequence,
    ]);
    expect(exact).toBeGreaterThan(prefix);
    expect(prefix).toBeGreaterThan(words);
    expect(words).toBeGreaterThan(run);
    expect(run).toBeGreaterThan(scattered);
  });

  it('puts an exact match above every longer name that starts with it', () => {
    const names = ['Set Tilt', 'Set Input', 'Set', 'Settings', 'Offset', 'Reset'];
    expect(ranked('set', names)[0]).toBe('Set');
    expect(ranked('SET', names)[0]).toBe('Set');
    expect(ranked(' set ', names)[0]).toBe('Set');
  });

  it('puts the identical spelling above one that only folds to the same letters', () => {
    expect(ranked('for each', ['ForEach', 'For Each'])).toEqual(['For Each', 'ForEach']);
    expect(ranked('foreach', ['For Each', 'ForEach'])[0]).toBe('ForEach');
    expect(tierOf(SearchFuzzy.score('for each', 'ForEach'))).toBe(SEARCH_FUZZY_TIER.exact);
  });

  it('puts prefix matches above word starts above runs above scattered letters', () => {
    const names = ['Offset Edge', 'Flip Edges', 'Fill Edge Loops', 'Find Edges', 'Feather', 'Fe'];
    expect(ranked('fe', names)).toEqual([
      'Fe',
      'Feather',
      'Flip Edges',
      'Find Edges',
      'Fill Edge Loops',
      'Offset Edge',
    ]);
  });

  it('prefers shorter names among equal kinds of match', () => {
    expect(ranked('cu', ['Cut Everything Now', 'Cut', 'Cube', 'Curve Things'])).toEqual([
      'Cut',
      'Cube',
      'Curve Things',
      'Cut Everything Now',
    ]);
  });

  it('prefers a match at the first word over one deeper in the name', () => {
    expect(ranked('fe', ['Edge For Each Thing', 'For Each'])).toEqual(['For Each', 'Edge For Each Thing']);
    expect(ranked('hole', ['Blast Hole', 'Holes'])).toEqual(['Holes', 'Blast Hole']);
  });

  it('prefers scattered letters that land on word starts and stay together', () => {
    const spread = SearchFuzzy.score('fch', 'F x x x x c x x x h');
    const tight = SearchFuzzy.score('fch', 'F Each');
    expect(tierOf(spread)).toBe(SEARCH_FUZZY_TIER.words);
    expect(tierOf(tight)).toBe(SEARCH_FUZZY_TIER.subsequence);
    const natural = SearchFuzzy.score('abc', 'Aa Bbb Cc xxxxxxxxxxxxxxxxxxxx');
    const unnatural = SearchFuzzy.score('abc', 'xAxxbxxcxxxxxxxxxxxxxxxxxxxxxxx');
    expect(natural).toBeGreaterThan(unnatural);
  });

  it('breaks ties by leaving equal scores equal', () => {
    expect(SearchFuzzy.score('ab', 'Ab Cd')).toBe(SearchFuzzy.score('ab', 'Ab Ef'));
    expect(ranked('ab', ['Ab Zz', 'Ab Yy', 'Ab Xx'])).toEqual(['Ab Zz', 'Ab Yy', 'Ab Xx']);
  });

  it('treats an empty query as fitting everything equally', () => {
    const scores = ['Anything', 'Zebra', '', '$System'].map((name) => SearchFuzzy.score('', name));
    expect(new Set(scores).size).toBe(1);
    expect(scores[0]).toBeGreaterThan(SEARCH_FUZZY_NONE);
    expect(SearchFuzzy.score('   ', 'Anything')).toBe(scores[0]);
    expect(SearchFuzzy.score('...', 'Anything')).toBe(scores[0]);
  });

  it('fits a single typed character only at the start of a word', () => {
    expect(SearchFuzzy.fits('f', 'For Each')).toBe(true);
    expect(SearchFuzzy.fits('e', 'For Each')).toBe(true);
    expect(SearchFuzzy.fits('o', 'For Each')).toBe(false);
    expect(SearchFuzzy.fits('h', 'For Each')).toBe(false);
    expect(SearchFuzzy.fits('h', 'Blast Hole')).toBe(true);
    expect(SearchFuzzy.fits('z', 'Zebra')).toBe(true);
    expect(SearchFuzzy.fits('é', 'Éclair')).toBe(true);
  });

  it('does not fit a query longer than the name', () => {
    expect(SearchFuzzy.score('foreacheach', 'For Each')).toBe(SEARCH_FUZZY_NONE);
    expect(SearchFuzzy.score('a', '')).toBe(SEARCH_FUZZY_NONE);
    expect(SearchFuzzy.score('abc', 'ab')).toBe(SEARCH_FUZZY_NONE);
  });

  it('fits a dollar sign only to system names and ignores it otherwise', () => {
    expect(SearchFuzzy.fits('$', '$Index')).toBe(true);
    expect(SearchFuzzy.fits('$', 'Index')).toBe(false);
    expect(SearchFuzzy.fits('$in', '$Index')).toBe(true);
    expect(SearchFuzzy.fits('$in', 'Index')).toBe(false);
    expect(SearchFuzzy.fits('in', '$Index')).toBe(true);
    expect(SearchFuzzy.fits('$sf', '$Selected.Faces')).toBe(true);
  });

  it('fits a query typed with punctuation of its own', () => {
    expect(SearchFuzzy.fits('for-each', 'For Each')).toBe(true);
    expect(SearchFuzzy.fits('f.e', 'For Each')).toBe(true);
    expect(SearchFuzzy.fits('(fe)', 'For Each')).toBe(true);
    expect(SearchFuzzy.fits('[', 'For Each')).toBe(true);
  });

  it('handles unicode: accents fold, other scripts match, case folds beyond ASCII', () => {
    expect(SearchFuzzy.score('ÉCLAIR', 'éclair')).toBeGreaterThan(SEARCH_FUZZY_NONE);
    expect(tierOf(SearchFuzzy.score('eclair', 'Éclair'))).toBe(SEARCH_FUZZY_TIER.exact);
    expect(SearchFuzzy.fits('ñ', 'Año')).toBe(false);
    expect(SearchFuzzy.fits('añ', 'Año')).toBe(true);
    expect(SearchFuzzy.fits('an', 'Año Nuevo')).toBe(true);
    expect(SearchFuzzy.fits('ДА', 'да')).toBe(true);
    expect(SearchFuzzy.fits('𝒜b', '𝒜bc')).toBe(true);
  });

  it('copes with a very long query and a very long name', () => {
    const name = 'Word '.repeat(2000);
    const query = 'w'.repeat(500);
    const start = performance.now();
    expect(SearchFuzzy.fits(query, name)).toBe(true);
    expect(SearchFuzzy.fits('wordx'.repeat(100), name)).toBe(false);
    expect(SearchFuzzy.fits('x'.repeat(100000), 'short')).toBe(false);
    expect(performance.now() - start).toBeLessThan(2000);
  });

  it('copes with a query that has many ways to split into pieces', () => {
    const name = 'a '.repeat(60);
    const start = performance.now();
    expect(SearchFuzzy.fits('a'.repeat(60), name)).toBe(true);
    expect(SearchFuzzy.fits('a'.repeat(61), name)).toBe(false);
    expect(performance.now() - start).toBeLessThan(1000);
  });

  it('scores the best of several names', () => {
    expect(SearchFuzzy.scoreBest('pad_left', ['PadLeft', 'padleft'])).toBe(SearchFuzzy.score('pad_left', 'PadLeft'));
    expect(SearchFuzzy.scoreBest('zzz', ['PadLeft', 'padleft'])).toBe(SEARCH_FUZZY_NONE);
    expect(SearchFuzzy.scoreBest('pl', [])).toBe(SEARCH_FUZZY_NONE);
    expect(SearchFuzzy.scoreBest('fe', ['Zebra', 'For Each'])).toBe(SearchFuzzy.score('fe', 'For Each'));
  });

  it('never ranks a name above an exact match for the same query', () => {
    const catalog = ['Set', 'Set Tilt', 'Settle', 'Sets', 'Offset', 'S e t', 'set', 'Se Te', 'Scatter Edge Tool'];
    for (const query of ['set', 'Set', 'SET']) {
      const best = Math.max(...catalog.map((name) => SearchFuzzy.score(query, name)));
      expect(tierOf(best)).toBe(SEARCH_FUZZY_TIER.exact);
      for (const name of catalog) {
        if (tierOf(SearchFuzzy.score(query, name)) < SEARCH_FUZZY_TIER.exact) continue;
        expect(SearchFuzzy.score(query, name)).toBeGreaterThanOrEqual(SearchFuzzy.score(query, 'Set Tilt'));
      }
    }
  });
});
