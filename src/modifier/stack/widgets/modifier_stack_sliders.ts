import * as THREE from 'three';
import { modifierStackParametersStackRead } from '@/modifier/stack/modifier_stack_parameters_commit.js';
import type { ModifierStackEntry } from '@/modifier/stack/modifier_stack_types.js';
import { MODIFIER_STACK_SOLID_SCRIPT_INPUTS_KEY } from '@/modifier/stack/kinds/generator/solid_script/modifier_stack_solid_script_keys.js';
import { modifierStackKindFind } from '@/modifier/stack/modifier_stack_catalog.js';
import { pathAssetEncode, type PathAsset } from '@/path/model/path_asset.js';
import { modifierStackPathsRecorded, type ModifierStackPath } from './modifier_stack_path_record.js';
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
  if (slider.target === 'parameter') return modifierStackStep(owner, slider.stepId) ? { [slider.writes]: value } : null;
  const component = slider.component;
  const vector = component?.vector.map((each, index) => (index === component.index ? value : each));
  return modifierStackInputPatch(owner, slider.stepId, slider.writes, vector ? vector.join(', ') : String(value));
}

/**
 * Returns the Path inputs of the steps of an object that have an edit mode, as
 * they were at their last evaluation.
 *
 * @param owner Stack owner.
 * @returns Paths, in stack order.
 */
export function modifierStackPaths(owner: THREE.Object3D): ModifierStackPath[] {
  return modifierStackEditSteps(owner).flatMap((entry) => modifierStackPathsRecorded(owner, entry.id));
}

/**
 * Returns the parameter patch that stores a path in its input.
 *
 * @param owner Stack owner.
 * @param path Path input.
 * @param asset Path to store.
 * @returns Parameter patch, or null when the step is gone.
 */
export function modifierStackPathPatch(
  owner: THREE.Object3D,
  path: ModifierStackPath,
  asset: PathAsset,
): Record<string, unknown> | null {
  return modifierStackInputPatch(owner, path.stepId, path.name, pathAssetEncode(asset));
}

/**
 * Returns the parameter patch that sets one stored input of a step.
 *
 * @param owner Stack owner.
 * @param stepId Step id.
 * @param name Input name.
 * @param text Input value as text.
 * @returns Parameter patch, or null when the step is gone.
 */
export function modifierStackInputPatch(
  owner: THREE.Object3D,
  stepId: string,
  name: string,
  text: string,
): Record<string, unknown> | null {
  const entry = modifierStackStep(owner, stepId);
  if (!entry) return null;
  const inputs = (entry.parameters[MODIFIER_STACK_SOLID_SCRIPT_INPUTS_KEY] ?? {}) as Record<string, string>;
  return { [MODIFIER_STACK_SOLID_SCRIPT_INPUTS_KEY]: { ...inputs, [name]: text } };
}

/**
 * Returns a step of an object's stack.
 *
 * @param owner Stack owner.
 * @param stepId Step id.
 * @returns Step, or undefined when it is gone.
 */
export function modifierStackStep(owner: THREE.Object3D, stepId: string): ModifierStackEntry | undefined {
  return modifierStackParametersStackRead(owner)?.modifiers.find((each) => each.id === stepId);
}
