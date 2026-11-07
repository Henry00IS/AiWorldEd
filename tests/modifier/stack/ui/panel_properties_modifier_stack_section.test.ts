import { describe, expect, it } from 'vitest';
import { CommandStack } from '@/commands/command_stack.js';
import { PanelPropertiesModifierStackSection } from '@/modifier/stack/ui/panel_properties_modifier_stack_section.js';
import { MODIFIER_STACK_DRAG_TYPE } from '@/modifier/stack/ui/modifier_stack_card.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { ModifierVolumeBevel } from '@/modifier/volume/modifier_volume_bevel.js';
import { getActiveUiThemePalette } from '@/ui/theme/theme_ui_palette.js';
import { stackFixture } from '../modifier_stack_fixture.js';

/**
 * Creates the inspector with plain chrome.
 *
 * @returns Section and its undo stack.
 */
function inspector() {
  const section = new PanelPropertiesModifierStackSection(
    () => document.createElement('section'),
    (title) => Object.assign(document.createElement('header'), { textContent: title }),
  );
  const stack = new CommandStack(32);
  section.setCommandStack(stack);
  document.body.appendChild(section.getElement());
  return { section, stack, root: section.getElement() };
}

/**
 * Finds a button by accessible name, nth match.
 *
 * @param root Search root.
 * @param label Accessible name.
 * @param index Match index.
 * @returns Button.
 */
function button(root: HTMLElement, label: string, index = 0): HTMLButtonElement {
  const found = [...root.querySelectorAll<HTMLButtonElement>(`button[aria-label="${label}"]`)][index];
  if (!found) throw new Error(`No button ${label}`);
  return found;
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
  if (!item) throw new Error(`No menu item ${label}`);
  item.click();
}

describe('modifier stack inspector', () => {
  it('shows one card per modifier, in order, with every text in the theme colour', () => {
    const fixture = stackFixture(['stairs', 'bevel', 'mirror']);
    fixture.refresh();
    const { section, root } = inspector();
    section.updateFromObjects([fixture.volume]);
    expect(root.style.display).toBe('block');
    expect(root.textContent).toContain('Stairs');
    expect(root.textContent).toContain('Mirror');
    expect(root.textContent).toContain('Affects');
    expect(root.querySelectorAll('[aria-label="Bevel distance"]')).toHaveLength(1);
    const probe = document.createElement('span');
    probe.style.color = getActiveUiThemePalette().panelTextColor;
    const text = probe.style.color;
    const warning = Object.assign(document.createElement('span').style, { color: '#f0a35e' }).color;
    const painted = [...root.querySelectorAll<HTMLElement>('span, div')].filter(
      (element) => element.childNodes.length === 1 && element.firstChild?.nodeType === 3,
    );
    expect(painted.length).toBeGreaterThan(10);
    for (const element of painted) {
      let current: HTMLElement | null = element;
      while (current && !current.style.color) current = current.parentElement;
      expect([text, warning]).toContain(current?.style.color ?? '');
    }
  });

  it('mutes with the eye through undo and folds without an undo step', () => {
    const fixture = stackFixture(['linear', 'mirror']);
    fixture.refresh();
    const { section, root, stack } = inspector();
    section.updateFromObjects([fixture.volume]);
    button(root, 'Show or mute this modifier', 1).click();
    expect(ModifierVolume.read(fixture.volume).modifiers[1]?.enabled).toBe(false);
    expect(stack.undo()).toBe(true);
    expect(ModifierVolume.read(fixture.volume).modifiers[1]?.enabled).toBe(true);
    button(root, 'Fold or unfold', 0).click();
    expect(ModifierVolume.read(fixture.volume).modifiers[0]?.expanded).toBe(false);
    expect(stack.undo()).toBe(false);
  });

  it('adds, reorders and deletes modifiers from the menus', () => {
    const fixture = stackFixture(['linear']);
    const { section, root } = inspector();
    section.updateFromObjects([fixture.volume]);
    button(root, 'Add a modifier to the end of the stack').click();
    clickMenu('Bevel');
    expect(ModifierVolume.read(fixture.volume).modifiers.map((entry) => entry.kind)).toEqual(['linear', 'bevel']);
    button(root, 'Modifier menu', 1).click();
    clickMenu('Move up');
    expect(ModifierVolume.read(fixture.volume).modifiers.map((entry) => entry.kind)).toEqual(['bevel', 'linear']);
    button(root, 'Modifier menu', 0).click();
    clickMenu('Delete');
    expect(ModifierVolume.read(fixture.volume).modifiers.map((entry) => entry.kind)).toEqual(['linear']);
  });

  it('reorders by dropping a dragged card', () => {
    const fixture = stackFixture(['linear', 'mirror']);
    const { section, root } = inspector();
    section.updateFromObjects([fixture.volume]);
    const cards = [...root.querySelectorAll<HTMLElement>('[draggable="true"]')].map(
      (grip) => grip.closest('div[style*="border-radius"]') as HTMLElement,
    );
    const drop = new Event('drop', { bubbles: true, cancelable: true }) as DragEvent;
    Object.defineProperty(drop, 'dataTransfer', {
      value: {
        getData: (type: string) => (type === MODIFIER_STACK_DRAG_TYPE ? 'm2' : ''),
        types: [MODIFIER_STACK_DRAG_TYPE],
      },
    });
    Object.defineProperty(drop, 'clientY', { value: -100 });
    cards[0]?.dispatchEvent(drop);
    expect(ModifierVolume.read(fixture.volume).modifiers.map((entry) => entry.kind)).toEqual(['mirror', 'linear']);
  });

  it('edits a field with smart visibility and edits embedded bevel settings with undo', () => {
    const fixture = stackFixture(['linear', 'bevel']);
    const { section, root, stack } = inspector();
    section.updateFromObjects([fixture.volume]);
    const offset = root.querySelector<HTMLElement>('[aria-label="Step X"]')?.closest('div');
    expect(offset?.style.display).toBe('none');
    const mode = root.querySelector<HTMLSelectElement>('select[aria-label="Spacing"]');
    if (!mode) throw new Error('No spacing select');
    mode.value = 'fixed';
    mode.dispatchEvent(new Event('change'));
    expect(ModifierVolume.read(fixture.volume).modifiers[0]?.parameters['mode']).toBe('fixed');
    expect(root.querySelector<HTMLElement>('[aria-label="Step X"]')?.closest('div')?.style.display).toBe('flex');
    const distance = root.querySelector<HTMLInputElement>('[aria-label="Bevel distance"]');
    if (!distance) throw new Error('No distance');
    distance.value = '0.2';
    distance.dispatchEvent(new Event('change'));
    distance.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(ModifierVolumeBevel.readDistance(fixture.volume)).toBeCloseTo(0.2);
    expect(stack.undo()).toBe(true);
    expect(ModifierVolumeBevel.readDistance(fixture.volume)).toBeCloseTo(0.05);
  });

  it('asks for a single volume when several are selected and hides for other objects', () => {
    const a = stackFixture(['linear']);
    const b = stackFixture(['mirror']);
    const { section, root } = inspector();
    section.updateFromObjects([a.volume, b.volume]);
    expect(root.textContent).toContain('Select a single modifier volume');
    section.updateFromObjects([a.model.root]);
    expect(root.style.display).toBe('none');
  });
});
