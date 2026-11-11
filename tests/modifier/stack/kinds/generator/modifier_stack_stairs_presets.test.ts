import { describe, expect, it } from 'vitest';
import { modifierStackKindFind } from '@/modifier/stack/modifier_stack_catalog.js';
import { modifierStackPresetApply, modifierStackPresetMatch } from '@/modifier/stack/modifier_stack_presets.js';
import { expectStackConvex, stackFixture } from '../../modifier_stack_fixture.js';

/**
 * Returns the installed stairs kind.
 *
 * @returns Stairs kind.
 */
function stairs() {
  const kind = modifierStackKindFind('stairs');
  if (!kind) throw new Error('Missing stairs');
  return kind;
}

/** Stairs fields whose labels and choices this card owns. */
const STAIRS_KEYS = [
  'direction',
  'sizing',
  'rise',
  'count',
  'landing',
  'nosing',
  'noseHeight',
  'noseBevel',
  'noseEdge',
  'fill',
  'waist',
  'thickness',
  'capTextures',
  'textureTop',
  'textureSide',
  'textureBottom',
];

/**
 * Tells whether a name is in Title Case: every word starts with a capital, a
 * digit or a sign, except short minor words after the first.
 *
 * @param name Name to check.
 * @returns True when the name is in Title Case.
 */
function isTitleCase(name: string): boolean {
  const minor = new Set(['of', 'and', 'with', 'to', '&']);
  return name.split(/[\s-]+/).every((part, index) => /^[A-Z0-9+−]/.test(part) || (index > 0 && minor.has(part)));
}

describe('stairs presets', () => {
  it('names presets, groups and stair fields in Title Case', () => {
    const kind = stairs();
    const names = kind.presets.flatMap((preset) => [preset.label, preset.group ?? 'None']);
    for (const field of kind.fields.filter((entry) => STAIRS_KEYS.includes(entry.key)))
      names.push(field.label, ...(field.choices ?? []).map((choice) => choice.label));
    for (const name of names) expect(isTitleCase(name), name).toBe(true);
    expect(new Set(kind.presets.map((preset) => preset.label)).size).toBe(kind.presets.length);
  });

  it('offers distinct presets, each matching itself once applied', () => {
    const kind = stairs();
    expect(kind.presets.length).toBeGreaterThanOrEqual(6);
    const base = kind.normalizeParameters(kind.createParameters());
    const built = kind.presets.map((preset) => JSON.stringify(modifierStackPresetApply(kind, base, preset)));
    expect(new Set(built).size).toBe(kind.presets.length);
    for (const preset of kind.presets)
      expect(modifierStackPresetMatch(kind, modifierStackPresetApply(kind, base, preset))).toBe(preset.id);
  });

  it('shows a new staircase as the plain flight and an edited one as custom', () => {
    const kind = stairs();
    const base = kind.normalizeParameters(kind.createParameters());
    expect(modifierStackPresetMatch(kind, base)).toBe('plain');
    expect(modifierStackPresetMatch(kind, { ...base, waist: 0.33 })).toBe('');
  });

  it('keeps the climb, the step sizing and the textures', () => {
    const kind = stairs();
    const custom = kind.normalizeParameters({
      direction: '-x',
      sizing: 'count',
      count: 9,
      texture: 'riser',
      capTextures: true,
      textureTop: 'tread',
      nosing: 0.2,
    });
    for (const preset of kind.presets) {
      const applied = modifierStackPresetApply(kind, custom, preset);
      for (const key of ['direction', 'sizing', 'count', 'texture', 'capTextures', 'textureTop'])
        expect(applied[key]).toEqual(custom[key]);
    }
  });

  it.each(stairs().presets.map((preset) => preset.id))('builds clean convex pieces (%s)', (id) => {
    const kind = stairs();
    const preset = kind.presets.find((entry) => entry.id === id);
    if (!preset) throw new Error('Missing preset');
    const parameters = modifierStackPresetApply(kind, kind.normalizeParameters({ sizing: 'count', count: 8 }), preset);
    const pieces = stackFixture([{ kind: 'stairs', parameters }], 4)
      .compile()
      .instances.slice(1);
    expect(pieces.length).toBeGreaterThanOrEqual(8);
    pieces.forEach(expectStackConvex);
  });
});
