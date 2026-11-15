import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { modifierStackKinds } from '@/modifier/stack/modifier_stack_catalog.js';
import { ModifierVolumeBevel } from '@/modifier/volume/modifier_volume_bevel.js';
import { MODIFIER_BEVEL_SETTINGS_FIELDS } from '@/modifier/volume/modifier_volume_bevel_fields.js';
import { MODIFIER_BEVEL_OPTION_FIELDS } from '@/modifier/volume/modifier_volume_bevel_option_fields.js';
import { modifierBevelOptionsNormalize } from '@/modifier/volume/modifier_volume_bevel_options.js';

/**
 * Bevel settings edited elsewhere: options per option, ignored objects as the
 * stack's excludedIds.
 */
const BEVEL_SETTINGS_ELSEWHERE = new Set(['options', 'blacklist']);

/** Words Title Case keeps lower case. */
const TITLE_CASE_SMALL_WORDS = new Set([
  'a',
  'an',
  'and',
  'or',
  'of',
  'to',
  'in',
  'on',
  'at',
  'by',
  'for',
  'the',
  'per',
  'vs',
]);

/**
 * Lists the words of a label that break Title Case.
 *
 * @param label Label.
 * @returns Offending words.
 */
function titleCaseViolations(label: string): string[] {
  return label
    .split(/[\s/()-]+/)
    .filter((word, index) => /^[a-z]/.test(word) && (index === 0 || !TITLE_CASE_SMALL_WORDS.has(word)));
}

describe('modifier field coverage', () => {
  it('gives every visible modifier field a Title Case label and a tooltip, so MCP can explain it', () => {
    for (const kind of modifierStackKinds) {
      for (const field of kind.fields.filter((candidate) => !candidate.hidden)) {
        expect(field.hint ?? '', `${kind.id}.${field.key} tooltip`).not.toBe('');
        expect(titleCaseViolations(field.label), `${kind.id}.${field.key} label "${field.label}"`).toEqual([]);
      }
    }
  });

  it('describes every bevel setting and option the inspector edits', () => {
    const settings = ModifierVolumeBevel.readSettings(new THREE.Object3D()) as unknown as Record<string, unknown>;
    const described = new Set(MODIFIER_BEVEL_SETTINGS_FIELDS.map((field) => field.key as string));
    for (const key of Object.keys(settings).filter((candidate) => !BEVEL_SETTINGS_ELSEWHERE.has(candidate)))
      expect(described.has(key), `bevel setting ${key}`).toBe(true);
    const options = new Set(MODIFIER_BEVEL_OPTION_FIELDS.map((field) => field.key as string));
    for (const key of Object.keys(modifierBevelOptionsNormalize({})))
      expect(options.has(key), `bevel option ${key}`).toBe(true);
    for (const field of [...MODIFIER_BEVEL_SETTINGS_FIELDS, ...MODIFIER_BEVEL_OPTION_FIELDS])
      expect(titleCaseViolations(field.label), field.label).toEqual([]);
  });
});
