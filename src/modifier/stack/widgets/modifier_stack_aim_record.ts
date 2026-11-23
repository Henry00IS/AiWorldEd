import * as THREE from 'three';
import type { SolidScriptWidget, SolidScriptWidgetAim } from '@/solid_script/language/solid_script_widget.js';
import { ModifierStackStepRecord } from './modifier_stack_step_record.js';
import { modifierStackEditSteps, modifierStackInputPatch } from './modifier_stack_sliders.js';

/** A Widget Direction of a step, in world coordinates. */
export interface ModifierStackAim {
  /** Id of the step that made it. */
  stepId: string;
  /** Key that stays the same between evaluations of the step. */
  key: string;
  /** Caption beside the tip. */
  label: string;
  /**
   * Name of the Vector Input a drag writes into, or empty for an arrow that
   * only shows.
   */
  writes: string;
  /** CSS colour, or empty text for the theme colour. */
  color: string;
  /** World point the arrow starts at. */
  origin: THREE.Vector3;
  /** World move from the start to the tip. */
  direction: THREE.Vector3;
  /**
   * Takes a world direction to the line's coordinates, in which Writes is
   * stored.
   */
  toScript: THREE.Matrix3;
}

/** Arrows each step made at its last evaluation, by stack owner and step id. */
const MODIFIER_STACK_AIMS = new ModifierStackStepRecord<ModifierStackAim>();

/**
 * Turns a Widget Direction of a script run into a world arrow.
 *
 * @param stepId Step id.
 * @param aim Arrow in script coordinates.
 * @param index Place among the run's arrows.
 * @param frame Matrix from script coordinates to the world.
 * @returns World arrow.
 */
function modifierStackAimPlaced(
  stepId: string,
  aim: SolidScriptWidgetAim,
  index: number,
  frame: THREE.Matrix4,
): ModifierStackAim {
  const toWorld = new THREE.Matrix3().setFromMatrix4(frame).multiply(new THREE.Matrix3().fromArray(aim.frame));
  const direction = new THREE.Vector3(...aim.value).multiplyScalar(aim.length).applyMatrix3(toWorld);
  return {
    stepId,
    key: `${stepId}:${aim.line}:${index}`,
    label: aim.label,
    writes: aim.writes,
    color: aim.color,
    origin: new THREE.Vector3(...aim.origin).applyMatrix4(frame),
    direction,
    toScript: toWorld.clone().invert(),
  };
}

/**
 * Keeps the Widget Directions of a script step as it ran.
 *
 * @param owner Stack owner.
 * @param stepId Step id.
 * @param widgets Widgets of the run, in script coordinates.
 * @param frame Matrix from script coordinates to the world.
 */
export function modifierStackAimsRecord(
  owner: THREE.Object3D,
  stepId: string,
  widgets: readonly SolidScriptWidget[],
  frame: THREE.Matrix4,
): void {
  const aims = widgets.filter((widget): widget is SolidScriptWidgetAim => widget.kind === 'Aim');
  MODIFIER_STACK_AIMS.record(
    owner,
    stepId,
    aims.map((aim, index) => modifierStackAimPlaced(stepId, aim, index, frame)),
  );
}

/**
 * Returns the arrows of the steps of an object that have an edit mode.
 *
 * @param owner Stack owner.
 * @returns Arrows, in stack order.
 */
export function modifierStackAims(owner: THREE.Object3D): ModifierStackAim[] {
  return modifierStackEditSteps(owner).flatMap((entry) => MODIFIER_STACK_AIMS.recorded(owner, entry.id));
}

/**
 * Returns the parameter patch that points an arrow along a world direction: the
 * direction in the line's coordinates, 1 long and rounded to three decimals.
 *
 * @param owner Stack owner.
 * @param aim Arrow dragged.
 * @param direction World direction.
 * @returns Parameter patch, or null when the step is gone or the direction is
 *   0.
 */
export function modifierStackAimPatch(
  owner: THREE.Object3D,
  aim: ModifierStackAim,
  direction: THREE.Vector3,
): Record<string, unknown> | null {
  const local = direction.clone().applyMatrix3(aim.toScript);
  if (aim.writes === '' || local.lengthSq() < 1e-12) return null;
  const parts = local
    .normalize()
    .toArray()
    .map((each) => Number(each.toFixed(3)) + 0);
  return modifierStackInputPatch(owner, aim.stepId, aim.writes, parts.join(', '));
}
