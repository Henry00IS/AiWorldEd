import { describe, expect, it, vi } from 'vitest';
import { Matrix4, Group } from 'three';
import { CommandStack } from '@/commands/command_stack.js';
import { ModifierGeneratorVolume } from '@/modifier/generator/modifier_generator_volume.js';
import { PanelPropertiesGeneratorSection } from '@/modifier/generator/ui/panel_properties_generator_section.js';

vi.mock('@/modifier/generator/modifier_generator_catalog.js', () => ({
  generatorKinds: () => [],
  generatorKindFind: () => ({
    id: 'fixture',
    label: 'Fixture',
    transform: () => new Matrix4(),
    fields: [
      { key: 'mode', label: 'Spacing', type: 'choice', default: 'fixed', choices: ['fixed', 'relative'] },
      {
        key: 'offset',
        label: 'Step',
        type: 'number',
        default: 0.25,
        visible: (settings: { parameters: { mode: string } }) => settings.parameters.mode === 'fixed',
      },
      {
        key: 'relative',
        label: 'Relative',
        type: 'number',
        default: 2,
        visible: (settings: { parameters: { mode: string } }) => settings.parameters.mode === 'relative',
      },
    ],
  }),
}));

/** Creates the actual inspector without a renderer or editor layout. */
function inspectorFixture() {
  const volume = ModifierGeneratorVolume.create('fixture');
  new Group().add(volume);
  const section = new PanelPropertiesGeneratorSection(
    () => document.createElement('section'),
    () => document.createElement('h3'),
  );
  section.setCommandStack(new CommandStack(100));
  document.body.append(section.element);
  section.updateFromObjects([volume]);
  return { volume, section };
}

describe('generator smart inspector', () => {
  it('shows fractional steps and supports the standard Enter blur commit gesture', () => {
    const { section } = inspectorFixture();
    const input = section.element.querySelector<HTMLInputElement>('[aria-label="Generator parameters.offset"]');
    expect(input?.value).toBe('0.25');
    input?.focus();
    input?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(document.activeElement).not.toBe(input);
    section.element.remove();
  });
  it('switches spacing fields and hides strategy settings at count one', () => {
    const { section, volume } = inspectorFixture();
    const mode = section.element.querySelector<HTMLSelectElement>('[aria-label="Generator parameters.mode"]');
    if (!mode) throw new Error('Missing spacing field');
    mode.value = 'relative';
    mode.dispatchEvent(new Event('change'));
    expect(section.element.querySelector('[aria-label="Generator parameters.offset"]')).toBeNull();
    expect(section.element.querySelector('[aria-label="Generator parameters.relative"]')).not.toBeNull();
    const count = section.element.querySelector<HTMLInputElement>('[aria-label="Generator count"]');
    if (!count) throw new Error('Missing count field');
    count.value = '1';
    count.dispatchEvent(new Event('change'));
    expect(ModifierGeneratorVolume.read(volume).count).toBe(1);
    expect(section.element.querySelector('[aria-label="Generator parameters.mode"]')).toBeNull();
    section.element.remove();
  });
});
