import { describe, expect, it } from 'vitest';
import { SearchFuzzyText } from '@/ui/search/search_fuzzy_text.js';

/**
 * Lists the words of a text as the folded characters each one holds.
 *
 * @param raw Text.
 * @returns Words in order.
 */
function wordsOf(raw: string): string[] {
  const text = new SearchFuzzyText(raw);
  const starts = text.wordStartIndexes;
  return starts.map((start, index) => text.folded.slice(start, starts[index + 1] ?? text.folded.length));
}

describe('SearchFuzzyText', () => {
  it('folds case, spaces and punctuation away', () => {
    expect(new SearchFuzzyText('For Each').folded).toBe('foreach');
    expect(new SearchFuzzyText('  for_each!! ').folded).toBe('foreach');
    expect(new SearchFuzzyText('a-b.c,d').folded).toBe('abcd');
  });

  it('splits words at spaces, punctuation, capitals and digits', () => {
    expect(wordsOf('Blast Hole')).toEqual(['blast', 'hole']);
    expect(wordsOf('pad_left')).toEqual(['pad', 'left']);
    expect(wordsOf('ForEach')).toEqual(['for', 'each']);
    expect(wordsOf('UVScale')).toEqual(['uv', 'scale']);
    expect(wordsOf('Vector3')).toEqual(['vector', '3']);
    expect(wordsOf('XYZ')).toEqual(['xyz']);
    expect(wordsOf('$Selected.Faces.Count')).toEqual(['selected', 'faces', 'count']);
  });

  it('strips accents and keeps letters of other scripts', () => {
    expect(new SearchFuzzyText('Café Crème').folded).toBe('cafecreme');
    expect(new SearchFuzzyText('Größe').folded).toBe('grosse');
    expect(new SearchFuzzyText('日本語 テキスト').folded).toBe('日本語テキスト');
    expect(wordsOf('日本語 テキスト')).toEqual(['日本語', 'テキスト']);
  });

  it('handles characters outside the basic plane without losing track of words', () => {
    const text = new SearchFuzzyText('𝒜bc Def');
    expect(text.wordStarts.length).toBe(text.folded.length);
    expect(text.folded.endsWith('def')).toBe(true);
  });

  it('knows system names by their dollar sign', () => {
    expect(new SearchFuzzyText('$Index').system).toBe(true);
    expect(new SearchFuzzyText('  $Index').system).toBe(true);
    expect(new SearchFuzzyText('Index').system).toBe(false);
    expect(new SearchFuzzyText('$Index').folded).toBe('index');
  });

  it('prepares nothing for empty or punctuation-only text', () => {
    for (const raw of ['', '   ', '$', '...', '-_-']) {
      const text = new SearchFuzzyText(raw);
      expect(text.folded, raw).toBe('');
      expect(text.wordStartIndexes, raw).toEqual([]);
    }
  });

  it('remembers prepared text and starts over rather than growing forever', () => {
    expect(SearchFuzzyText.of('Remember Me')).toBe(SearchFuzzyText.of('Remember Me'));
    for (let index = 0; index < 20500; index++) SearchFuzzyText.of(`name ${index}`);
    expect(SearchFuzzyText.of('after the flood').folded).toBe('afterthe' + 'flood');
  });

  it('copes with a very long text', () => {
    const text = new SearchFuzzyText('Word '.repeat(20000));
    expect(text.folded.length).toBe(80000);
    expect(text.wordStartIndexes.length).toBe(20000);
  });
});
