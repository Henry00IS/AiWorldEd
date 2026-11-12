import { it, expect } from 'vitest';
import { Group } from 'three';
import { PanelPropertiesBevelVolumeSection } from '@/ui/properties/panel_properties_bevel_volume_section.js';
import { ModifierVolumeBevel } from '@/modifier/volume/modifier_volume_bevel.js';
import {
  modifierBevelOptionsRead,
  modifierBevelOptionsWrite,
} from '@/modifier/volume/modifier_volume_bevel_options.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { CommandStack } from '@/commands/command_stack.js';
import { modifierVolumeTemplateCreate } from '@/modifier/stack/modifier_volume_templates.js';

/**
 * Applicability follows segments, selected layout, and live multi-edge
 * intersections.
 */
it('shows only applicable profile, trim, normal and actual corner controls', () => {
  const { section, volume } = optionsInspector();
  expect(optionShown(section, 'Bevel profile')).toBe(false);
  expect(optionShown(section, 'Bevel corner policy')).toBe(false);
  ModifierVolumeBevel.writeSegments(volume, 8);
  section.bind([volume]);
  expect(optionShown(section, 'Bevel profile')).toBe(true);
  expect(optionShown(section, 'Bevel strip normals')).toBe(true);
  expect(optionShown(section, 'Bevel corner policy')).toBe(true);
  volume.position.set(0.5, 0.5, 0);
  volume.scale.setScalar(0.4);
  section.bind([volume]);
  expect(optionShown(section, 'Bevel corner policy')).toBe(false);
  selectOption(section, 'Bevel layout', 'trim');
  expect(optionShown(section, 'Bevel trim seam')).toBe(true);
  selectOption(section, 'Bevel layout', 'continue');
  expect(optionShown(section, 'Bevel trim seam')).toBe(false);
  modifierBevelOptionsWrite(volume, { profile: 0.25 });
  section.bind([volume]);
  expect(optionShown(section, 'Bevel strip normals')).toBe(false);
});

/** New options use the existing undo stack and do not reset values while hidden. */
it('commits contextual dropdowns and the bounded profile slider through undo', () => {
  const { section, volume } = optionsInspector();
  const stack = new CommandStack(16);
  section.setCommandStack(stack);
  ModifierVolumeBevel.writeSegments(volume, 8);
  section.bind([volume]);
  selectOption(section, 'Bevel width mode', 'percent');
  expect(modifierBevelOptionsRead(volume).widthMode).toBe('percent');
  expect(section.getElement().textContent).toContain('Percent');
  const slider = section.getElement().querySelector<HTMLInputElement>('[aria-label="Bevel profile slider"]');
  if (!slider) throw new Error('Expected profile slider');
  slider.value = '0.375';
  slider.dispatchEvent(new Event('input'));
  slider.dispatchEvent(new Event('change'));
  expect(modifierBevelOptionsRead(volume).profile).toBe(0.375);
  stack.undo();
  section.bind([volume]);
  expect(modifierBevelOptionsRead(volume).profile).toBe(0.5);
  expect(slider.value).toBe('0.5');
  stack.undo();
  expect(modifierBevelOptionsRead(volume).widthMode).toBe('offset');
});

/**
 * The angle limit hides Max angle when no limit applies; Absolute is offered as
 * a width mode.
 */
it('hides the max angle without a limit and offers absolute width', () => {
  const { section, volume } = optionsInspector();
  expect(optionShown(section, 'Bevel max angle')).toBe(true);
  selectOption(section, 'Bevel limit method', 'none');
  section.bind([volume]);
  expect(modifierBevelOptionsRead(volume).limitMethod).toBe('none');
  expect(optionShown(section, 'Bevel max angle')).toBe(false);
  selectOption(section, 'Bevel width mode', 'absolute');
  expect(modifierBevelOptionsRead(volume).widthMode).toBe('absolute');
});

/** Builds a covering volume and a registered solid model. */
function optionsInspector() {
  const world = new Group(),
    model = new SolidModel('options-inspector');
  model.addBoxBrush();
  world.add(model.root);
  const volume = modifierVolumeTemplateCreate('bevel');
  volume.scale.setScalar(6);
  world.add(volume);
  const section = new PanelPropertiesBevelVolumeSection();
  section.bind([volume]);
  return { section, volume, world, model };
}

/**
 * Reads the row's display state rather than assuming hidden controls are
 * absent.
 *
 * @param section Inspector.
 * @param aria Field accessible name.
 */
function optionShown(section: PanelPropertiesBevelVolumeSection, aria: string): boolean {
  const field = section.getElement().querySelector(`[aria-label="${aria}"]`);
  return Boolean(field && field.parentElement?.style.display !== 'none');
}

/**
 * Changes an existing select widget.
 *
 * @param section Inspector.
 * @param aria Field accessible name.
 * @param value New choice.
 */
function selectOption(section: PanelPropertiesBevelVolumeSection, aria: string, value: string): void {
  const field = section.getElement().querySelector(`[aria-label="${aria}"]`);
  if (!(field instanceof HTMLSelectElement)) throw new Error(`Expected select ${aria}`);
  field.value = value;
  field.dispatchEvent(new Event('change', { bubbles: true }));
}
