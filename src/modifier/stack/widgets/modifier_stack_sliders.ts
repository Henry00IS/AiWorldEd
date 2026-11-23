import * as THREE from 'three';
import { modifierStackParametersStackRead } from '@/modifier/stack/modifier_stack_parameters_commit.js';
import type { ModifierStackEntry } from '@/modifier/stack/modifier_stack_types.js';
import { MODIFIER_STACK_SOLID_SCRIPT_INPUTS_KEY } from '@/modifier/stack/kinds/generator/solid_script/modifier_stack_solid_script_keys.js';
import { modifierStackKindFind } from '@/modifier/stack/modifier_stack_catalog.js';
import { modifierStackSlidersRecorded, type ModifierStackSlider } from './modifier_stack_slider_record.js';

/**
 * Says whether an enabled step offers its widgets in edit mode, as its kind
 * declares.
 *
 * @param entry Stack step.
 * @returns True when the step has an edit mode.
 */
export function modifierStackEntryHasEditMode(entry: ModifierStackEntry): boolean {
  return entry.enabled && (modifierStackKindFind(entry.kind)?.hasEditMode(entry.parameters) ?? false);
}

/**
 * Returns the steps of an object that have an edit mode.
 *
 * @param owner Object, group, modifier volume or generator.
 * @returns Steps, in stack order; empty for an object without a stack.
 */
export function modifierStackEditSteps(owner: THREE.Object3D): ModifierStackEntry[] {
  const stack = modifierStackParametersStackRead(owner);
  return stack?.enabled === false ? [] : (stack?.modifiers.filter(modifierStackEntryHasEditMode) ?? []);
}

/**
 * Returns the sliders of the steps of an object that have an edit mode, as they
 * were at their last evaluation.
 *
 * @param owner Stack owner.
 * @returns Sliders, in stack order.
 */
export function modifierStackSliders(owner: THREE.Object3D): ModifierStackSlider[] {
  return modifierStackEditSteps(owner).flatMap((entry) => modifierStackSlidersRecorded(owner, entry.id));
}

/**
 * Returns the parameter patch that sets the value a slider writes: the stored
 * input values with one input set, or the one parameter.
 *
 * @param owner Stack owner.
 * @param slider Slider whose value changes.
 * @param value New value.
 * @returns Parameter patch, or null when the step is gone.
 */
export function modifierStackSliderPatch(
  owner: THREE.Object3D,
  slider: ModifierStackSlider,
  value: number,
): Record<string, unknown> | null {
  const entry = modifierStackParametersStackRead(owner)?.modifiers.find((each) => each.id === slider.stepId);
  if (!entry) return null;
  if (slider.target === 'parameter') return { [slider.writes]: value };
  const inputs = (entry.parameters[MODIFIER_STACK_SOLID_SCRIPT_INPUTS_KEY] ?? {}) as Record<string, string>;
  return { [MODIFIER_STACK_SOLID_SCRIPT_INPUTS_KEY]: { ...inputs, [slider.writes]: String(value) } };
}
