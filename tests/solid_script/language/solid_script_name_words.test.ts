import { describe, expect, it } from 'vitest';
import { solidScriptInputRead } from '@/solid_script/language/solid_script_input.js';
import { solidScriptNameWords } from '@/solid_script/language/solid_script_name_words.js';

describe('solidScriptNameWords', () => {
  it('splits a lower case letter from the capital after it', () => {
    expect(solidScriptNameWords('MySlider')).toBe('My Slider');
    expect(solidScriptNameWords('BoxWidthModifier')).toBe('Box Width Modifier');
  });

  it('keeps a run of capitals together and splits it before a capitalized word', () => {
    expect(solidScriptNameWords('UScale')).toBe('U Scale');
    expect(solidScriptNameWords('ItemMAXValue')).toBe('Item MAX Value');
  });

  it('turns underscores into spaces and starts with a capital', () => {
    expect(solidScriptNameWords('box_width')).toBe('Box width');
    expect(solidScriptNameWords('height')).toBe('Height');
  });

  it('names an Input without a Label by its name in words, as the inspector shows it', () => {
    expect(solidScriptInputRead({ name: 'ItemMAXValue', type: 'Number' }).label).toBe('Item MAX Value');
    expect(solidScriptInputRead({ name: 'ItemMAXValue', type: 'Number', label: 'Most' }).label).toBe('Most');
  });
});
