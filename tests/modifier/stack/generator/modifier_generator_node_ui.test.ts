import { describe, expect, it } from 'vitest';
import { CommandStack } from '@/commands/command_stack.js';
import { PanelPropertiesModifierStackSection } from '@/modifier/stack/ui/panel_properties_modifier_stack_section.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { modifierGeneratorNodeCreate } from '@/modifier/stack/modifier_generator_node.js';
import { modifierStackSettingsNormalize } from '@/modifier/stack/modifier_stack_settings.js';
import { stackFixtureEntries } from '../modifier_stack_fixture.js';

/**
 * Creates the inspector bound to a new generator node.
 *
 * @param kind Generator kind.
 * @returns Section root, node, and undo stack.
 */
function generatorInspector(kind = 'column') {
  const section = new PanelPropertiesModifierStackSection(
    () => document.createElement('section'),
    (title) => Object.assign(document.createElement('header'), { textContent: title }),
  );
  const stack = new CommandStack(32);
  section.setCommandStack(stack);
  document.body.replaceChildren(section.getElement());
  const node = modifierGeneratorNodeCreate(kind);
  section.updateFromObjects([node]);
  return { section, node, stack, root: section.getElement() };
}

/**
 * Clicks a menu item by its label.
 *
 * @param label Visible label.
 */
function clickMenu(label: string): void {
  const item = [
    ...document.querySelectorAll<HTMLElement>('[role="menu"] button, [role="menu"] [role="menuitem"]'),
  ].find((element) => element.textContent?.includes(label));
  item?.click();
}

describe('generator node inspector', () => {
  it('titles the section Generator and hides capture settings, Keep input and Operation', () => {
    const { root } = generatorInspector();
    expect(root.querySelector('header')?.textContent).toContain('Generator');
    expect(root.textContent).not.toMatch(/From captured brush/);
    const labels = [...root.querySelectorAll('[aria-label]')].map((element) => element.getAttribute('aria-label'));
    expect(labels).not.toContain('Keep Input');
    expect(labels).not.toContain('Operation');
    expect(labels).toContain('Texture');
    const capture = [...root.querySelectorAll<HTMLElement>('*')].find((element) => element.textContent === 'Capture');
    expect(capture?.closest<HTMLElement>('div[style*="display: none"]')).toBeTruthy();
  });

  it('pins the generator at the top: it cannot be deleted and nothing moves above it', () => {
    const section = generatorInspector('stairs');
    ModifierVolume.write(section.node, {
      ...ModifierVolume.read(section.node),
      modifiers: [...ModifierVolume.read(section.node).modifiers, ...stackFixtureEntries(['mirror'])],
    });
    section.section.refresh();
    const buttons = [...section.root.querySelectorAll<HTMLButtonElement>('button[aria-label="Modifier menu"]')];
    expect(buttons.length).toBe(2);
    buttons[0]!.click();
    clickMenu('Delete');
    expect(ModifierVolume.read(section.node).modifiers.map((step) => step.kind)).toEqual(['stairs', 'mirror']);
    buttons[1]!.click();
    clickMenu('Move to top');
    expect(ModifierVolume.read(section.node).modifiers.map((step) => step.kind)).toEqual(['stairs', 'mirror']);
  });

  it('keeps the generator first however the stack is reordered', () => {
    const [mirror, stairs] = stackFixtureEntries(['mirror', 'stairs']);
    const generator = modifierStackSettingsNormalize({ role: 'generator', modifiers: [mirror!, stairs!] });
    expect(generator.modifiers.map((step) => step.kind)).toEqual(['stairs', 'mirror']);
    const volume = modifierStackSettingsNormalize({ modifiers: [mirror!, stairs!] });
    expect(volume.modifiers.map((step) => step.kind)).toEqual(['mirror', 'stairs']);
  });
});
