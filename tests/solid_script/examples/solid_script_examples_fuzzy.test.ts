import { describe, expect, it } from 'vitest';
import { SOLID_SCRIPT_EXAMPLES, solidScriptExamplesFind } from '@/solid_script/examples/solid_script_examples.js';

describe('SolidScript examples search', () => {
  it('lists every example for an empty search, in list order', () => {
    const everything = SOLID_SCRIPT_EXAMPLES.map((example) => example.id);
    expect(solidScriptExamplesFind('').map((example) => example.id)).toEqual(everything);
    expect(solidScriptExamplesFind('   ').map((example) => example.id)).toEqual(everything);
  });

  it('finds an example by its name typed together, shortened or with letters left out', () => {
    expect(solidScriptExamplesFind('spiralstaircase').map((example) => example.id)).toContain('spiralStaircase');
    expect(solidScriptExamplesFind('ss').map((example) => example.id)).toContain('spiralStaircase');
    expect(solidScriptExamplesFind('SPIRAL').map((example) => example.id)).toEqual(['spiralStaircase']);
  });

  it('finds every example by its exact name', () => {
    for (const example of SOLID_SCRIPT_EXAMPLES) {
      expect(
        solidScriptExamplesFind(example.name).map((found) => found.id),
        example.name,
      ).toContain(example.id);
      expect(solidScriptExamplesFind(example.name.toUpperCase()).map((found) => found.id)).toContain(example.id);
    }
  });

  it('keeps finding by a word of the group or summary, as before', () => {
    expect(solidScriptExamplesFind('generator stairs').length).toBeGreaterThan(0);
  });

  it('finds nothing for text that fits nothing and copes with odd text', () => {
    expect(solidScriptExamplesFind('qqqqzzzzxxxx')).toEqual([]);
    expect(solidScriptExamplesFind('x'.repeat(10000))).toEqual([]);
    for (const text of ['$', '.', '日本語', '😀', 'é']) expect(() => solidScriptExamplesFind(text)).not.toThrow();
  });
});
