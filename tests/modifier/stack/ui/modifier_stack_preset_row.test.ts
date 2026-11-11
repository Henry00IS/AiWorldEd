import { describe, expect, it } from 'vitest';
import { CommandStack } from '@/commands/command_stack.js';
import { PanelPropertiesModifierStackSection } from '@/modifier/stack/ui/panel_properties_modifier_stack_section.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { stackFixture } from '../modifier_stack_fixture.js';

/**
 * Creates the inspector showing one stairs volume.
 *
 * @returns Fixture, undo stack and inspector root.
 */
function stairsInspector() {
  const fixture = stackFixture([{ kind: 'stairs', parameters: { direction: '-x', texture: 'riser' } }]);
  const section = new PanelPropertiesModifierStackSection(
    () => document.createElement('section'),
    (title) => Object.assign(document.createElement('header'), { textContent: title }),
  );
  const stack = new CommandStack(32);
  section.setCommandStack(stack);
  document.body.appendChild(section.getElement());
  section.updateFromObjects([fixture.volume]);
  return { fixture, stack, root: section.getElement() };
}

/**
 * Picks a value in a select by its accessible name.
 *
 * @param root Search root.
 * @param label Accessible name.
 * @param value Value to pick.
 * @returns The select.
 */
function pick(root: HTMLElement, label: string, value: string): HTMLSelectElement {
  const select = root.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`);
  if (!select) throw new Error(`No ${label} select`);
  select.value = value;
  select.dispatchEvent(new Event('change'));
  return select;
}

describe('modifier preset row', () => {
  it('applies a stairs preset as one undo step and names the matching preset', () => {
    const { fixture, stack, root } = stairsInspector();
    const select = root.querySelector<HTMLSelectElement>('select[aria-label="Preset"]');
    expect(select?.value).toBe('plain');
    const labels = [...(select?.options ?? [])].map((option) => option.textContent);
    expect(labels).toContain('Raked Riser');
    pick(root, 'Preset', 'raked');
    const parameters = () => ModifierVolume.read(fixture.volume).modifiers[0]?.parameters ?? {};
    expect(parameters()['noseBevel']).toBe(1);
    expect(parameters()['direction']).toBe('-x');
    expect(parameters()['texture']).toBe('riser');
    expect(root.querySelector<HTMLSelectElement>('select[aria-label="Preset"]')?.value).toBe('raked');
    pick(root, 'Underside', 'solid');
    expect(root.querySelector<HTMLSelectElement>('select[aria-label="Preset"]')?.value).toBe('');
    expect(stack.undo()).toBe(true);
    expect(stack.undo()).toBe(true);
    expect(parameters()['nosing']).toBeUndefined();
    expect(stack.redo()).toBe(true);
    expect(parameters()['noseBevel']).toBe(1);
  });

  it('shows no preset row for modifiers without presets', () => {
    const fixture = stackFixture(['linear']);
    const section = new PanelPropertiesModifierStackSection(
      () => document.createElement('section'),
      (title) => Object.assign(document.createElement('header'), { textContent: title }),
    );
    section.updateFromObjects([fixture.volume]);
    expect(section.getElement().querySelector('select[aria-label="Preset"]')).toBeNull();
  });
});
