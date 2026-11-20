import { describe, expect, it } from 'vitest';
import {
  solidScriptSentence,
  solidScriptSentenceLead,
  solidScriptSentenceTyped,
} from '@/solid_script/language/solid_script_sentence.js';

describe('SolidScript sentence punctuation', () => {
  it('capitalises a description and adds a full stop, but not after a stop already there', () => {
    expect(solidScriptSentence('name of the editor')).toBe('Name of the editor.');
    expect(solidScriptSentence('Already done.')).toBe('Already done.');
    expect(solidScriptSentence('Stop now!')).toBe('Stop now!');
    expect(solidScriptSentence('Why?')).toBe('Why?');
    expect(solidScriptSentenceTyped('Text', 'name of the editor')).toBe('Text: Name of the editor.');
  });

  it('does not add a full stop after an emoji or other symbol, such as a starred Anchor', () => {
    expect(solidScriptSentence('Anchor. ⭐')).toBe('Anchor. ⭐');
    expect(solidScriptSentence('anchor. ⭐')).toBe('Anchor. ⭐');
    expect(solidScriptSentence('Anchor. ⭐\uFE0F')).toBe('Anchor. ⭐\uFE0F');
    expect(solidScriptSentence('Score +')).toBe('Score +');
    expect(solidScriptSentenceTyped('', 'Anchor. ⭐')).toBe('Anchor. ⭐');
  });

  it('takes only the first paragraph of a longer description', () => {
    const text = 'Keeps a number inside a range.\n\nExample:\nClamp(12, 0, 10) is 10.\n\nUse it on a stair.';
    expect(solidScriptSentenceLead(text)).toBe('Keeps a number inside a range.');
    expect(solidScriptSentenceLead('a short lead')).toBe('A short lead.');
  });
});
