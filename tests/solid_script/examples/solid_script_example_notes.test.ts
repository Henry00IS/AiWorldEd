import { describe, expect, it } from 'vitest';
import { SOLID_SCRIPT_EXAMPLES } from '@/solid_script/examples/solid_script_examples.js';

describe('SolidScript example notes', () => {
  it('wraps every note of every example at 100 characters', () => {
    const long = SOLID_SCRIPT_EXAMPLES.flatMap((example) =>
      example.lines
        .filter((line) => line.command === 'note' && (line.values?.['text'] ?? '').length > 100)
        .map((line) => `${example.name}: ${line.values?.['text']}`),
    );
    expect(long).toEqual([]);
  });

  it('breaks notes only between words', () => {
    const notes = SOLID_SCRIPT_EXAMPLES.flatMap((example) =>
      example.lines.filter((line) => line.command === 'note').map((line) => line.values?.['text'] ?? ''),
    );
    expect(notes.filter((text) => text !== text.trim() || text === '')).toEqual([]);
  });
});
