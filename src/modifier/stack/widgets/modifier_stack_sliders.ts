import * as THREE from 'three';
import { modifierStackParametersStackRead } from '@/modifier/stack/modifier_stack_parameters_commit.js';
import type { ModifierStackEntry } from '@/modifier/stack/modifier_stack_types.js';
import { MODIFIER_STACK_SOLID_SCRIPT_INPUTS_KEY } from '@/modifier/stack/kinds/generator/solid_script/modifier_stack_solid_script_keys.js';
import { modifierStackKindFind } from '@/modifier/stack/modifier_stack_catalog.js';
import type { SolidScriptWidgetSlider } from '@/solid_script/language/solid_script_widget.js';

/** A slider handle of a modifier step, in world coordinates. */
export interface ModifierStackSlider {
  /** Id of the step that made it. */
  stepId: string;
  /** Key that stays the same between evaluations of the step. */
  key: string;
  /** Caption beside the handle. */
  label: string;
  /** Value the handle shows. */
  value: number;
  /** World point of the handle for a value of 0. */
  origin: THREE.Vector3;
  /** World move of the handle for a value of 1. */
  direction: THREE.Vector3;
  /** Smallest value a drag writes, or null for no limit. */
  min: number | null;
  /** Largest value a drag writes, or null for no limit. */
  max: number | null;
  /**
   * Name of the Input a drag writes into, or empty for a handle that only
   * shows.
   */
  writes: string;
}

/** Sliders each step made at its last evaluation, by stack owner and step id. */
const MODIFIER_STACK_SLIDERS = new WeakMap<THREE.Object3D, Map<string, ModifierStackSlider[]>>();

/**
 * Keeps the sliders a step made at its evaluation, replacing the last ones.
 *
 * @param owner Stack owner.
 * @param stepId Step id.
 * @param sliders Sliders in world coordinates.
 */
export function modifierStackSlidersRecord(
  owner: THREE.Object3D,
  stepId: string,
  sliders: readonly ModifierStackSlider[],
): void {
  let steps = MODIFIER_STACK_SLIDERS.get(owner);
  if (!steps) MODIFIER_STACK_SLIDERS.set(owner, (steps = new Map()));
  steps.set(stepId, [...sliders]);
}

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
  const steps = MODIFIER_STACK_SLIDERS.get(owner);
  return modifierStackEditSteps(owner).flatMap((entry) => steps?.get(entry.id) ?? []);
}

/**
 * Returns the stored input values of a SolidScript step with one input set.
 *
 * @param owner Stack owner.
 * @param slider Slider whose input changes.
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
  const inputs = (entry.parameters[MODIFIER_STACK_SOLID_SCRIPT_INPUTS_KEY] ?? {}) as Record<string, string>;
  return { [MODIFIER_STACK_SOLID_SCRIPT_INPUTS_KEY]: { ...inputs, [slider.writes]: String(value) } };
}

/**
 * Turns script-space sliders of one step into world sliders.
 *
 * @param stepId Step id.
 * @param frame Matrix from script coordinates to the world.
 * @param sliders Sliders in script coordinates.
 * @returns World sliders.
 */
export function modifierStackSlidersPlaced(
  stepId: string,
  frame: THREE.Matrix4,
  sliders: readonly SolidScriptWidgetSlider[],
): ModifierStackSlider[] {
  return sliders.map((slider, index) => {
    const origin = new THREE.Vector3(...slider.origin).applyMatrix4(frame);
    const tip = new THREE.Vector3(...slider.origin).add(new THREE.Vector3(...slider.direction)).applyMatrix4(frame);
    const { label, value, writes, min, max } = slider;
    const key = `${stepId}:${slider.line}:${index}`;
    return { stepId, key, label, value, writes, min, max, origin, direction: tip.sub(origin) };
  });
}
