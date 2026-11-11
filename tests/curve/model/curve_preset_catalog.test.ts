import { describe, expect, it } from 'vitest';
import { CURVE_PRESETS_ARCHITECTURE } from '@/curve/model/curve_preset_architecture.js';
import { CURVE_PRESET_CATEGORIES, curvePresetCatalog } from '@/curve/model/curve_preset_catalog.js';
import { CURVE_PRESETS_EXTENDED } from '@/curve/model/curve_preset_extended.js';
import { CURVE_PRESET_RESET_GROUP, CURVE_PRESETS_RESET } from '@/curve/model/curve_preset_reset.js';
import { CURVE_PRESETS_TURNERY } from '@/curve/model/curve_preset_turnery.js';

/** Every column profile preset, in source order. */
const PRESETS = [...CURVE_PRESETS_ARCHITECTURE, ...CURVE_PRESETS_TURNERY, ...CURVE_PRESETS_EXTENDED];

/** Short words that stay lowercase inside a Title Case name. */
const MINOR_WORDS = new Set(['of', 'and', 'with', 'to', '&']);

/**
 * Tells whether a name is in Title Case: every word, and every part of a
 * hyphenated word, starts with a capital or a digit, except short minor words
 * and ampersands after the first.
 *
 * @param name Name to check.
 * @returns True when the name is in Title Case.
 */
function isTitleCase(name: string): boolean {
  const parts = name.split(/[\s-]+/);
  return parts.every((part, index) => /^[A-Z0-9]/.test(part) || (index > 0 && MINOR_WORDS.has(part)));
}

describe('column preset catalog', () => {
  it('lists every column preset exactly once and nothing else', () => {
    const ids = CURVE_PRESET_CATEGORIES.flatMap((category) => category.ids);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual(PRESETS.map((preset) => preset.id).sort());
  });

  it('keeps the long-standing preset ids', () => {
    const ids = new Set(PRESETS.map((preset) => preset.id));
    for (const id of ['plain', 'tapered', 'classic', 'tuscan', 'doric', 'baluster', 'bed_post', 'knife'])
      expect(ids.has(id), id).toBe(true);
    expect(ids.has('phillips_screwdriver')).toBe(true);
  });

  it('orders presets by category and names each group', () => {
    const catalog = curvePresetCatalog(PRESETS);
    expect(catalog.map((preset) => preset.id)).toEqual(CURVE_PRESET_CATEGORIES.flatMap((category) => category.ids));
    const groups = [...new Set(catalog.map((preset) => preset.group))];
    expect(groups).toEqual(CURVE_PRESET_CATEGORIES.map((category) => category.group));
  });

  it('has no single-item categories', () => {
    for (const category of CURVE_PRESET_CATEGORIES) expect(category.ids.length, category.group).toBeGreaterThan(1);
  });

  it('uses unique Title Case names for presets and categories', () => {
    const labels = PRESETS.map((preset) => preset.label);
    expect(new Set(labels).size).toBe(labels.length);
    const names = [
      ...labels,
      ...CURVE_PRESET_CATEGORIES.map((category) => category.group),
      ...CURVE_PRESETS_RESET.map((preset) => preset.label),
      CURVE_PRESET_RESET_GROUP,
    ];
    for (const name of names) expect(isTitleCase(name), name).toBe(true);
  });

  it('keeps presets it does not list, after the listed ones', () => {
    const extra = { ...PRESETS[0]!, id: 'unlisted', label: 'Unlisted', group: 'Other' };
    const catalog = curvePresetCatalog([extra, ...PRESETS]);
    expect(catalog.at(-1)).toEqual(extra);
  });
});
