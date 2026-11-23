/** Docs of the Dictionary functions and Contains. */
export const SOLID_SCRIPT_FUNCTION_DOCS_DICTIONARY = {
  contains: {
    usage: 'Contains(list or text, item)',
    summary:
      'Yes when a list holds the item, such as Contains([1, 2, 3], 2), when a text holds the piece, such as Contains("hello", "ell"), or when a Dictionary has the key, such as Contains([Prices], "Wood").',
    group: 'Text',
    gives: ['Yes/No'],
  },
  dictionary: {
    usage: 'Dictionary(keys, values)',
    summary:
      'A Dictionary from a list of keys and a list of values in the same order, such as Dictionary(List("Wood", "Stone"), List(5, 7)); then [Prices.Data.Wood] reads 5.',
    group: 'Dictionary',
    gives: ['Dictionary'],
  },
  keys: {
    usage: 'Keys(dictionary)',
    summary:
      'The keys of a Dictionary in the order they were added, such as Keys(Dictionary(List("a", "b"), List(1, 2))) is [a, b].',
    group: 'Dictionary',
    gives: ['List'],
  },
  values: {
    usage: 'Values(dictionary)',
    summary:
      'The values of a Dictionary in the order of its keys, such as Values(Dictionary(List("a", "b"), List(1, 2))) is [1, 2].',
    group: 'Dictionary',
    gives: ['List'],
  },
} as const;

/** Inputs of the Dictionary functions and Contains. */
export const SOLID_SCRIPT_DICTIONARY_ARGUMENTS = {
  contains: {
    'list or text': { type: ['List', 'Text', 'Dictionary'], about: 'A list, a text or a Dictionary.' },
    item: { type: 'Any', about: 'The item to find in a list, the piece to find in a text, or a key.' },
  },
  dictionary: {
    keys: { type: ['List'], about: 'The keys, such as List("Wood", "Stone").', start: 'List("Wood", "Stone")' },
    values: { type: ['List'], about: 'A value for each key, such as List(5, 7).', start: 'List(5, 7)' },
  },
  keys: { dictionary: { type: ['Dictionary'], about: 'The Dictionary, such as [Prices].' } },
  values: { dictionary: { type: ['Dictionary'], about: 'The Dictionary, such as [Prices].' } },
} as const;
