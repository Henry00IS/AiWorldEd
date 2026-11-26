import { describe, expect, it } from 'vitest';
import {
  solidScriptExplorerMatches,
  type SolidScriptExplorerEntry,
} from '@/solid_script/ui/solid_script_editor_explorer.js';

/**
 * Builds an explorer entry for a variable.
 *
 * @param name Variable name.
 * @param value Its value.
 * @param type Its type text.
 * @returns Entry.
 */
function entry(name: string, value: string | null = '1', type = 'Whole Number'): SolidScriptExplorerEntry {
  return { name, category: 'Variables', value, type, lines: [0], items: [], readOnly: false, detail: '' };
}

describe('SolidScript variable explorer search', () => {
  it('shows every variable for an empty search', () => {
    expect(solidScriptExplorerMatches(entry('Width'), '')).toBe(true);
    expect(solidScriptExplorerMatches(entry('Width'), '   ')).toBe(true);
  });

  it.each([
    ['wallheight', 'WallHeight'],
    ['wh', 'WallHeight'],
    ['WALL', 'WallHeight'],
    ['wall height', 'WallHeight'],
  ])('finds %j in the variable %s', (query, name) => {
    expect(solidScriptExplorerMatches(entry(name), query)).toBe(true);
  });

  it('keeps finding by value, type and category, as before', () => {
    expect(solidScriptExplorerMatches(entry('Width', '2.5'), '2.5')).toBe(true);
    expect(solidScriptExplorerMatches(entry('Width', '1', 'List of Numbers'), 'list of')).toBe(true);
    expect(solidScriptExplorerMatches(entry('Width'), 'variables')).toBe(true);
    expect(solidScriptExplorerMatches(entry('Width', null), 'zzz')).toBe(false);
  });

  it('does not list a name for letters that are only scattered through it', () => {
    expect(solidScriptExplorerMatches(entry('Width'), 'wdh')).toBe(false);
  });

  it('copes with odd searches', () => {
    for (const query of ['$', '.', '日本語', '😀', 'x'.repeat(10000)]) {
      expect(() => solidScriptExplorerMatches(entry('Width'), query)).not.toThrow();
    }
    expect(solidScriptExplorerMatches(entry('Width'), 'x'.repeat(10000))).toBe(false);
  });
});
