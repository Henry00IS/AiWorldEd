import * as THREE from 'three';
import { modifierStackParametersStackRead } from '@/modifier/stack/modifier_stack_parameters_commit.js';
import type { SolidScriptWidget, SolidScriptWidgetDraw } from '@/solid_script/language/solid_script_widget.js';
import { ModifierStackStepRecord } from './modifier_stack_step_record.js';

/** A Debug drawing of a step, in world coordinates. */
export interface ModifierStackDraw {
  /** Key that stays the same between evaluations of the step. */
  key: string;
  /** Text shown at the point, or empty text for none. */
  label: string;
  /** CSS colour, or empty text for the theme colour. */
  color: string;
  /** World point the text is shown at. */
  at: THREE.Vector3;
  /** World segments, each from one point to another. */
  segments: (readonly [THREE.Vector3, THREE.Vector3])[];
}

/** Drawings each step made at its last evaluation, by stack owner and step id. */
const MODIFIER_STACK_DRAWS = new ModifierStackStepRecord<ModifierStackDraw>();

/**
 * Keeps the Debug drawings of a script step as it ran, in the world.
 *
 * @param owner Stack owner.
 * @param stepId Step id.
 * @param widgets Widgets of the run, in script coordinates.
 * @param frame Matrix from script coordinates to the world.
 */
export function modifierStackDrawsRecord(
  owner: THREE.Object3D,
  stepId: string,
  widgets: readonly SolidScriptWidget[],
  frame: THREE.Matrix4,
): void {
  const world = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z).applyMatrix4(frame);
  const draws = widgets
    .filter((widget): widget is SolidScriptWidgetDraw => widget.kind === 'Draw')
    .map((draw, index) => ({
      key: `${stepId}:${draw.line}:${index}`,
      label: draw.label,
      color: draw.color,
      at: world(...draw.at),
      segments: draw.segments.map(([ax, ay, az, bx, by, bz]) => [world(ax, ay, az), world(bx, by, bz)] as const),
    }));
  MODIFIER_STACK_DRAWS.record(owner, stepId, draws);
}

/**
 * Returns the drawings of the enabled steps of an object, as they were at their
 * last evaluation.
 *
 * @param owner Stack owner.
 * @returns Drawings, in stack order.
 */
export function modifierStackDraws(owner: THREE.Object3D): ModifierStackDraw[] {
  const stack = modifierStackParametersStackRead(owner);
  if (!stack || stack.enabled === false) return [];
  return stack.modifiers
    .filter((entry) => entry.enabled)
    .flatMap((entry) => MODIFIER_STACK_DRAWS.recorded(owner, entry.id));
}
