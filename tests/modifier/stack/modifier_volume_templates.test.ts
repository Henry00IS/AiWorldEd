import { describe, expect, it } from 'vitest';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { modifierVolumeTemplateCreate, modifierVolumeTemplates } from '@/modifier/stack/modifier_volume_templates.js';

/** Only the Add menu's Bevel Volume preset opts into single-brush capture. */
describe('modifier volume menu capture defaults', () => {
  it('uses single brushes for the Bevel Volume menu preset alone', () => {
    for (const template of modifierVolumeTemplates) {
      const settings = ModifierVolume.read(modifierVolumeTemplateCreate(template.id));
      expect(settings.grouping).toBe(template.id === 'bevel' ? 'brush' : 'compound');
    }
    expect(ModifierVolume.read(ModifierVolume.create({})).grouping).toBe('compound');
  });
});
