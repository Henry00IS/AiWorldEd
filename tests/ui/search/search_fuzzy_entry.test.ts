import { describe, expect, it } from 'vitest';
import { SEARCH_FUZZY_NONE, SEARCH_FUZZY_TIER, SEARCH_FUZZY_TIER_STEP } from '@/ui/search/search_fuzzy.js';
import { SearchFuzzyEntry, type SearchFuzzyEntryText } from '@/ui/search/search_fuzzy_entry.js';

/**
 * Builds an entry from a name, other names and a description.
 *
 * @param name Main name.
 * @param others Other names.
 * @param description Description.
 * @returns Entry.
 */
function entry(name: string, others: string[] = [], description = ''): SearchFuzzyEntryText {
  return { names: [name, ...others], details: [name, description, ...others].join(' ').toLowerCase() };
}

/**
 * Lists entry names that fit a query, best first.
 *
 * @param query Typed text.
 * @param entries Entries by name.
 * @returns Names in rank order.
 */
function ranked(query: string, entries: Record<string, SearchFuzzyEntryText>): string[] {
  const names = Object.keys(entries);
  const scores = SearchFuzzyEntry.scoreList(query, Object.values(entries));
  return names
    .map((name, index) => ({ name, index, score: scores[index] ?? 0 }))
    .filter((item) => item.score > SEARCH_FUZZY_NONE)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((item) => item.name);
}

describe('SearchFuzzyEntry', () => {
  const entries = {
    Subtract: entry('Subtract', ['cut', 'carve'], 'Removes one solid from another'),
    Cube: entry('Cube', [], 'A box with six equal sides'),
    'For Each': entry('For Each', ['loop'], 'Repeats the lines below for every item'),
    Echo: entry('Echo', [], 'Shows a value in the output'),
    'Select Shortest Paths': entry('Select Shortest Paths', [], 'Picks paths'),
  };

  it('splits a query into lower case words', () => {
    expect(SearchFuzzyEntry.words('  Mesh  FROM\tSolids ')).toEqual(['mesh', 'from', 'solids']);
    expect(SearchFuzzyEntry.words('')).toEqual([]);
    expect(SearchFuzzyEntry.words('   ')).toEqual([]);
  });

  it('scores an empty query the same for every entry', () => {
    const scores = SearchFuzzyEntry.scoreList('  ', Object.values(entries));
    expect(new Set(scores).size).toBe(1);
    expect(scores[0]).toBe(SEARCH_FUZZY_TIER.empty * SEARCH_FUZZY_TIER_STEP);
  });

  it('finds a name by what it is called, shortened or spelled together', () => {
    expect(ranked('foreach', entries)[0]).toBe('For Each');
    expect(ranked('fe', entries)[0]).toBe('For Each');
    expect(ranked('fch', entries)[0]).toBe('For Each');
  });

  it('finds an entry by another name, below an exact match on the main name', () => {
    expect(ranked('cut', entries)).toEqual(['Subtract']);
    const withCutName = { ...entries, Cutter: entry('Cutter', [], 'Slices') };
    expect(ranked('cut', withCutName)).toEqual(['Subtract', 'Cutter']);
    const mainCut = { ...withCutName, Cut: entry('Cut') };
    expect(ranked('cut', mainCut)).toEqual(['Cut', 'Subtract', 'Cutter']);
  });

  it('finds an entry by a word of its description, below any name match', () => {
    expect(ranked('equal', entries)).toEqual(['Cube']);
    expect(ranked('every item', entries)).toEqual(['For Each']);
    expect(ranked('shows output', entries)).toEqual(['Echo']);
    const crossing = { ...entries, Equalize: entry('Equalize', [], 'Evens things out') };
    expect(ranked('equal', crossing)).toEqual(['Equalize', 'Cube']);
  });

  it('needs every typed word to fit', () => {
    expect(ranked('cube zebra', entries)).toEqual([]);
    expect(ranked('cube six', entries)).toEqual(['Cube']);
  });

  it('puts an exact name first, then the names that start with it', () => {
    const set = {
      'Set Tilt': entry('Set Tilt'),
      'Set Input': entry('Set Input'),
      Set: entry('Set'),
      Offset: entry('Offset'),
    };
    expect(ranked('set', set)).toEqual(['Set', 'Set Tilt', 'Set Input', 'Offset']);
  });

  it('leaves out scattered letters while something fits more closely', () => {
    expect(ranked('echo', entries)).toEqual(['Echo']);
    expect(ranked('fch', entries)).toEqual(['For Each']);
    const onlyScattered = { 'Select Shortest Paths': entries['Select Shortest Paths'] as SearchFuzzyEntryText };
    expect(ranked('echo', onlyScattered)).toEqual(['Select Shortest Paths']);
  });

  it('flags only scattered scores as scattered', () => {
    const [scattered] = SearchFuzzyEntry.scoreList('echo', [entries['Select Shortest Paths'] as SearchFuzzyEntryText]);
    const [exact] = SearchFuzzyEntry.scoreList('echo', [entries['Echo'] as SearchFuzzyEntryText]);
    expect(SearchFuzzyEntry.isScattered(scattered ?? 0)).toBe(true);
    expect(SearchFuzzyEntry.isScattered(exact ?? 0)).toBe(false);
    expect(SearchFuzzyEntry.isScattered(SEARCH_FUZZY_NONE)).toBe(false);
  });

  it('fits closely only without scattered letters', () => {
    expect(SearchFuzzyEntry.fitsClosely('fe', ['For Each'], 'for each')).toBe(true);
    expect(SearchFuzzyEntry.fitsClosely('fch', ['For Each'], 'for each')).toBe(false);
    expect(SearchFuzzyEntry.fitsClosely('zzz', ['For Each'], 'for each')).toBe(false);
  });

  it('keeps matching a word of the text as it did before fuzzy matching', () => {
    expect(SearchFuzzyEntry.score('wood', ['Cube'], 'made of wood')).toBeGreaterThan(SEARCH_FUZZY_NONE);
    expect(SearchFuzzyEntry.score('x', ['Cube'], 'a box')).toBeGreaterThan(SEARCH_FUZZY_NONE);
    expect(SearchFuzzyEntry.score('q', ['Cube'], 'a box')).toBe(SEARCH_FUZZY_NONE);
  });

  it('finds a typed $[ escape only in text that holds it, never in every entry', () => {
    expect(SearchFuzzyEntry.score('$[', ['$Index'], 'index')).toBe(SEARCH_FUZZY_NONE);
    expect(SearchFuzzyEntry.score('$[', ['Echo'], 'echo $[x]')).toBeGreaterThan(SEARCH_FUZZY_NONE);
    expect(SearchFuzzyEntry.score('-', ['Echo'], 'echo')).toBe(SEARCH_FUZZY_NONE);
  });

  it('copes with thousands of entries and an odd query', () => {
    const many = Array.from({ length: 5000 }, (_, index) => entry(`Name ${index} Thing`, [`alias${index}`]));
    const start = performance.now();
    const scores = SearchFuzzyEntry.scoreList('n7t', many);
    expect(scores.length).toBe(5000);
    expect(scores.some((score) => score > SEARCH_FUZZY_NONE)).toBe(true);
    expect(SearchFuzzyEntry.scoreList('😀🙂', many).every((score) => score === SEARCH_FUZZY_NONE)).toBe(true);
    expect(performance.now() - start).toBeLessThan(2000);
  });
});
