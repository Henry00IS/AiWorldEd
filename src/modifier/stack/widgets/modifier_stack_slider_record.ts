import * as THREE from 'three';
import { ModifierStackStepRecord } from './modifier_stack_step_record.js';
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
   * Name of the Input or parameter a drag writes into, or empty for a handle
   * that only shows.
   */
  writes: string;
  /** Whether writes names a script Input or a parameter of the step. */
  target: ModifierStackSliderTarget;
}

/** What a slider writes into: a script Input or a parameter of its step. */
export type ModifierStackSliderTarget = 'input' | 'parameter';

/** A slider handle of a step, in the coordinates its kind builds in. */
export interface ModifierStackSliderLocal {
  /** Name that stays the same between evaluations, unique in the step. */
  id: string;
  /** Caption beside the handle. */
  label: string;
  /** Value the handle shows. */
  value: number;
  /** Point of the handle for a value of 0. */
  origin: THREE.Vector3;
  /** Move of the handle for a value of 1. */
  direction: THREE.Vector3;
  /** Smallest value a drag writes, or null for no limit. */
  min: number | null;
  /** Largest value a drag writes, or null for no limit. */
  max: number | null;
  /** Name of the Input or parameter a drag writes into, or empty. */
  writes: string;
  /** Whether writes names a script Input or a parameter of the step. */
  target: ModifierStackSliderTarget;
}

/** Sliders each step made at its last evaluation, by stack owner and step id. */
const MODIFIER_STACK_SLIDERS = new ModifierStackStepRecord<ModifierStackSlider>();

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
  MODIFIER_STACK_SLIDERS.record(owner, stepId, sliders);
}

/**
 * Returns the sliders a step made at its last evaluation.
 *
 * @param owner Stack owner.
 * @param stepId Step id.
 * @returns World sliders; empty before the step is evaluated.
 */
export function modifierStackSlidersRecorded(owner: THREE.Object3D, stepId: string): ModifierStackSlider[] {
  return MODIFIER_STACK_SLIDERS.recorded(owner, stepId);
}

/**
 * Turns the Widget Sliders of a script run into step sliders that write Inputs.
 *
 * @param sliders Sliders in script coordinates.
 * @returns Sliders in script coordinates.
 */
export function modifierStackSlidersOfScript(sliders: readonly SolidScriptWidgetSlider[]): ModifierStackSliderLocal[] {
  return sliders.map((slider, index) => ({
    id: `${slider.line}:${index}`,
    label: slider.label,
    value: slider.value,
    origin: new THREE.Vector3(...slider.origin),
    direction: new THREE.Vector3(...slider.direction),
    min: slider.min,
    max: slider.max,
    writes: slider.writes,
    target: 'input',
  }));
}

/**
 * Turns the sliders of one step into world sliders.
 *
 * @param stepId Step id.
 * @param frame Matrix from the step's coordinates to the world.
 * @param sliders Sliders in the step's coordinates.
 * @returns World sliders.
 */
export function modifierStackSlidersPlaced(
  stepId: string,
  frame: THREE.Matrix4,
  sliders: readonly ModifierStackSliderLocal[],
): ModifierStackSlider[] {
  return sliders.map((slider) => {
    const origin = slider.origin.clone().applyMatrix4(frame);
    const tip = slider.origin.clone().add(slider.direction).applyMatrix4(frame);
    const { label, value, writes, min, max, target } = slider;
    return {
      stepId,
      key: `${stepId}:${slider.id}`,
      label,
      value,
      writes,
      min,
      max,
      target,
      origin,
      direction: tip.sub(origin),
    };
  });
}
