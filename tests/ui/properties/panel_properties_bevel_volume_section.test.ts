import { describe, expect, it } from 'vitest';
import { CommandStack } from '@/commands/command_stack.js';
import { ModifierVolumeBevel } from '@/modifier/volume/modifier_volume_bevel.js';
import {
  MODIFIER_VOLUME_BEVEL_UV_POSITIVE_Y,
  MODIFIER_VOLUME_BEVEL_UV_WINDING,
} from '@/modifier/volume/modifier_volume_bevel_keys.js';
import { PanelPropertiesBevelVolumeSection } from '@/ui/properties/panel_properties_bevel_volume_section.js';

describe('bevel volume inspector', () => {
  it('shows bevel controls and omits corner styles', () => {
    const section = createSection();
    const volume = ModifierVolumeBevel.create();
    section.updateFromObjects([volume]);
    const captions = rowCaptions(section.getElement());
    expect(captions).toEqual(bevelRowOrder());
    expect(rowShown(section.getElement(), 'Pivot')).toBe(false);
    expect(rowShown(section.getElement(), 'UV')).toBe(true);
    expect(captions).not.toContain('Type');
    expect(captions).not.toContain('Spread');
    expect(section.getElement().textContent).not.toContain('Chamfer');
    expect(section.getElement().textContent).not.toContain('Arc');
    expect(valueFillsRow(section.getElement(), 'Segments')).toBe(true);
    expect(valueFillsRow(section.getElement(), 'Layout')).toBe(true);
    expect(affectsStacksFullWidth(section.getElement())).toBe(true);
  });

  it('shows the pivot only when a selected volume actually rotates', () => {
    const section = createSection();
    const idle = ModifierVolumeBevel.create();
    section.updateFromObjects([idle]);
    expect(rowShown(section.getElement(), 'Pivot')).toBe(false);
    commitField(section.getElement(), 'Bevel UV rotation', '90');
    expect(rowShown(section.getElement(), 'Pivot')).toBe(true);
    commitField(section.getElement(), 'Bevel UV rotation', '360');
    expect(rowShown(section.getElement(), 'Pivot')).toBe(false);
    const turning = ModifierVolumeBevel.create();
    const settings = ModifierVolumeBevel.readSettings(turning);
    ModifierVolumeBevel.writeSettings(turning, { ...settings, uvRotation: 15 });
    section.updateFromObjects([idle, turning]);
    expect(rowShown(section.getElement(), 'Pivot')).toBe(true);
    expect(fieldText(section.getElement(), 'Bevel max angle')).toBe('30.0');
  });

  it('lists layouts and textures, defaults to continue and inherit, and restores an undo', () => {
    const stack = new CommandStack(8);
    const section = createSection();
    const volume = ModifierVolumeBevel.create();
    section.setCommandStack(stack);
    section.updateFromObjects([volume]);
    expect(selectLabels(section.getElement(), 'Bevel layout')).toEqual([
      'Continue',
      'Tile',
      'Trim',
      'Stretch',
      'Project',
      'Cubic',
      'Overhead',
      'Front',
      'Side',
      'Axis',
    ]);
    expect(selectValue(section.getElement(), 'Bevel layout')).toBe('continue');
    expect(optionTitle(section.getElement(), 'Bevel layout', 'Trim')).toContain('whole curve');
    expect(optionTitle(section.getElement(), 'Bevel layout', 'Front')).toContain('world X');
    expect(optionTitle(section.getElement(), 'Bevel layout', 'Side')).toContain('world Z');
    expect(section.getElement().querySelector('[aria-label="Bevel U scale"]')).toBeTruthy();
    expect(section.getElement().querySelector('[aria-label="Bevel UV rotation"]')).toBeTruthy();
    expect(selectLabels(section.getElement(), 'Bevel owner')).toEqual(['Split', 'Single']);
    expect(selectValue(section.getElement(), 'Bevel owner')).toBe('split');
    expect(optionTitle(section.getElement(), 'Bevel owner', 'Split')).toContain('owns that half');
    expect(selectLabels(section.getElement(), 'Bevel pivot')).toEqual(['Anchor', 'Center', 'Tile']);
    expect(selectLabels(section.getElement(), 'Bevel space')).toEqual(['Local', 'World']);
    expect(selectValue(section.getElement(), 'Bevel space')).toBe('local');
    expect(selectValue(section.getElement(), 'Bevel pivot')).toBe('anchor');
    expect(selectByName(section.getElement(), 'Bevel layout')?.title).toContain('pattern keeps going');
    expect(selectLabels(section.getElement(), 'Bevel texture')).toContain('Inherit');
    chooseSelect(section.getElement(), 'Bevel layout', 'trim');
    expect(ModifierVolumeBevel.readUvLayout(volume)).toBe('trim');
    expect(stack.undo()).toBe(true);
    expect(ModifierVolumeBevel.readUvLayout(volume)).toBe('continue');
  });

  it('lists the UV flows, defaults to winding, and restores an undo', () => {
    const stack = new CommandStack(8);
    const section = createSection();
    const volume = ModifierVolumeBevel.create();
    section.setCommandStack(stack);
    section.updateFromObjects([volume]);
    expect(selectLabels(section.getElement(), 'Bevel UV')).toEqual(uvLabels());
    expect(selectValue(section.getElement(), 'Bevel UV')).toBe(MODIFIER_VOLUME_BEVEL_UV_WINDING);
    expect(optionTitle(section.getElement(), 'Bevel UV', 'Winding')).toContain('every piece of that corner');
    expect(optionTitle(section.getElement(), 'Bevel UV', 'Majority')).toContain('longest edge');
    expect(optionTitle(section.getElement(), 'Bevel UV', '+Y')).toContain('world up');
    expect(selectByName(section.getElement(), 'Bevel UV')?.title).toContain('face order');
    chooseSelect(section.getElement(), 'Bevel UV', MODIFIER_VOLUME_BEVEL_UV_POSITIVE_Y);
    expect(ModifierVolumeBevel.readUvFlow(volume)).toBe(MODIFIER_VOLUME_BEVEL_UV_POSITIVE_Y);
    expect(stack.undo()).toBe(true);
    expect(ModifierVolumeBevel.readUvFlow(volume)).toBe(MODIFIER_VOLUME_BEVEL_UV_WINDING);
  });

  it('evaluates UV math and restores the field when the text is invalid', () => {
    const section = createSection();
    const volume = ModifierVolumeBevel.create();
    section.updateFromObjects([volume]);
    commitField(section.getElement(), 'Bevel U scale', '1/8');
    expect(ModifierVolumeBevel.readSettings(volume).uvScaleU).toBeCloseTo(0.125, 6);
    expect(fieldText(section.getElement(), 'Bevel U scale')).toBe('0.125');
    commitField(section.getElement(), 'Bevel U offset', '0.1+0.2');
    expect(ModifierVolumeBevel.readSettings(volume).uvOffsetU).toBeCloseTo(0.3, 6);
    commitField(section.getElement(), 'Bevel distance', 'nope');
    expect(ModifierVolumeBevel.readDistance(volume)).toBeCloseTo(0.05, 6);
    expect(fieldText(section.getElement(), 'Bevel distance')).toBe('0.05');
  });
});

/**
 * Creates the inspector section with plain elements.
 *
 * @returns Section.
 */
function createSection(): PanelPropertiesBevelVolumeSection {
  return new PanelPropertiesBevelVolumeSection(createPlain, createHeader);
}

/**
 * Creates an empty element.
 *
 * @returns Div.
 */
function createPlain(): HTMLElement {
  return document.createElement('div');
}

/**
 * Creates a header element.
 *
 * @param title Header text.
 * @returns Header.
 */
function createHeader(title: string): HTMLElement {
  const header = document.createElement('div');
  header.textContent = title;
  return header;
}

/**
 * Lists the row captions in the section.
 *
 * @param root Section element.
 * @returns Caption text.
 */
/**
 * Lists the bevel rows in inspector order.
 *
 * @returns Captions.
 */
function bevelRowOrder(): string[] {
  return [
    'Segments',
    'Distance',
    'Max Angle',
    'Layout',
    'Texture',
    'Owner',
    'UV',
    'Space',
    'U scale',
    'V scale',
    'U offset',
    'V offset',
    'Rotation',
    'Pivot',
    'Affects',
  ];
}

/**
 * Lists the row captions in the section.
 *
 * @param root Section element.
 * @returns Caption text.
 */
function rowCaptions(root: HTMLElement): string[] {
  return [...root.children]
    .map((row) => row.querySelector(':scope > span')?.textContent ?? '')
    .filter((caption) => caption !== '');
}

/**
 * Returns whether a value field fills the space beside a tight caption.
 *
 * @param root Section element.
 * @param caption Row caption.
 * @returns True when the caption is one label wide and the field grows.
 */
function valueFillsRow(root: HTMLElement, caption: string): boolean {
  const row = labeledRow(root, caption);
  const label = rowCaption(row);
  const field = [...(row?.children ?? [])].find((child) => child !== label);
  if (!label || !(field instanceof HTMLElement)) return false;
  return label.style.width === '9ch' && field.style.flexGrow === '1' && field.style.maxWidth === 'none';
}

/**
 * Returns whether Affects is a bold caption with the list underneath.
 *
 * @param root Section element.
 * @returns True when the list uses the full row and sits under the caption.
 */
function affectsStacksFullWidth(root: HTMLElement): boolean {
  const block = labeledRow(root, 'Affects');
  const label = rowCaption(block);
  const list = block?.querySelector(':scope > div');
  if (!block || !label || !(list instanceof HTMLElement)) return false;
  return label.style.fontWeight === 'bold' && block.style.display !== 'flex' && list.style.width === '100%';
}

/**
 * Returns the caption span of a row.
 *
 * @param row Row element.
 * @returns Caption, or null when the row has none.
 */
function rowCaption(row: HTMLElement | null): HTMLElement | null {
  const label = row?.querySelector(':scope > span');
  return label instanceof HTMLElement ? label : null;
}

/**
 * Returns whether a labeled row is visible.
 *
 * @param root Section element.
 * @param caption Row caption.
 * @returns True when the row is shown.
 */
function rowShown(root: HTMLElement, caption: string): boolean {
  const row = labeledRow(root, caption);
  return !!row && row.style.display !== 'none';
}

/**
 * Finds the row whose caption matches.
 *
 * @param root Section element.
 * @param caption Row caption.
 * @returns Row element, or null.
 */
function labeledRow(root: HTMLElement, caption: string): HTMLElement | null {
  for (const child of root.children) {
    if (!(child instanceof HTMLElement)) continue;
    if (child.querySelector(':scope > span')?.textContent === caption) return child;
  }
  return null;
}

/**
 * Returns the visible labels of one labeled select.
 *
 * @param root Section element.
 * @param ariaLabel Select name.
 * @returns Labels.
 */
function selectLabels(root: HTMLElement, ariaLabel: string): string[] {
  const select = selectByName(root, ariaLabel);
  if (!select) return [];
  return [...select.options].filter((option) => !option.hidden && option.value !== '').map((option) => option.text);
}

/**
 * Returns the value of one labeled select.
 *
 * @param root Section element.
 * @param ariaLabel Select name.
 * @returns Value.
 */
function selectValue(root: HTMLElement, ariaLabel: string): string {
  return selectByName(root, ariaLabel)?.value ?? '';
}

/**
 * Reads the hover text of one option.
 *
 * @param root Section element.
 * @param ariaLabel Select name.
 * @param label Visible option label.
 * @returns Hover text.
 */
function optionTitle(root: HTMLElement, ariaLabel: string, label: string): string {
  const select = selectByName(root, ariaLabel);
  if (!select) return '';
  const option = [...select.options].find((entry) => entry.text === label);
  return option?.title ?? '';
}

/**
 * Finds a select by its accessible name.
 *
 * @param root Section element.
 * @param ariaLabel Select name.
 * @returns Select, or null.
 */
function selectByName(root: HTMLElement, ariaLabel: string): HTMLSelectElement | null {
  const select = root.querySelector(`[aria-label="${ariaLabel}"]`);
  return select instanceof HTMLSelectElement ? select : null;
}

/**
 * Lists the UV flow labels in menu order.
 *
 * @returns Labels.
 */
function uvLabels(): string[] {
  return [
    'Winding',
    'Reverse Winding',
    'Largest',
    'Smallest',
    'Majority',
    'Nearest',
    'Aligned',
    '+Y',
    '-Y',
    '+X',
    '-X',
    '+Z',
    '-Z',
  ];
}

/**
 * Selects a value and commits it.
 *
 * @param root Section element.
 * @param ariaLabel Select name.
 * @param value Stored value.
 */
function chooseSelect(root: HTMLElement, ariaLabel: string, value: string): void {
  const select = selectByName(root, ariaLabel);
  if (!select) return;
  select.value = value;
  select.dispatchEvent(new Event('change'));
}

/**
 * Commits one numeric field.
 *
 * @param root Section element.
 * @param ariaLabel Field name.
 * @param text Field text.
 */
function commitField(root: HTMLElement, ariaLabel: string, text: string): void {
  const field = root.querySelector(`[aria-label="${ariaLabel}"]`);
  if (!(field instanceof HTMLInputElement)) return;
  field.value = text;
  field.dispatchEvent(new Event('change'));
}

/**
 * Reads a numeric field.
 *
 * @param root Section element.
 * @param ariaLabel Field name.
 * @returns Display text.
 */
function fieldText(root: HTMLElement, ariaLabel: string): string {
  const field = root.querySelector(`[aria-label="${ariaLabel}"]`);
  return field instanceof HTMLInputElement ? field.value : '';
}
