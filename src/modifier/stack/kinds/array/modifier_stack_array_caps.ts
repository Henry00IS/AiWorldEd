import * as THREE from 'three';
import type { ModifierStackField, ModifierStackUnit } from '@/modifier/stack/modifier_stack_types.js';
import type { ModifierStackContext } from '@/modifier/stack/evaluate/modifier_stack_context.js';
import type { ModifierStackUvPolicy } from '@/modifier/stack/evaluate/modifier_stack_copy.js';
import {
  modifierStackModelTransform,
  modifierStackUnitsBounds,
} from '@/modifier/stack/evaluate/modifier_stack_frame.js';
import { modifierStackUnitCopy } from '@/modifier/stack/evaluate/modifier_stack_unit_copy.js';
import type { ModifierStackArrayPlacement, ModifierStackArrayPlan } from './modifier_stack_kind_array.js';

/** Start and end cap pickers shared by arrays with a chosen count. */
export const MODIFIER_STACK_ARRAY_CAP_FIELDS: readonly ModifierStackField[] = [
  {
    key: 'startCap',
    label: 'Start cap',
    type: 'object',
    default: '',
    group: 'Caps',
    hint: 'Group or brush placed one step before the first piece. It is used as a template and never arrayed itself; hide it to keep only the cap.',
  },
  {
    key: 'endCap',
    label: 'End cap',
    type: 'object',
    default: '',
    group: 'Caps',
    hint: 'Group or brush placed one step after the last piece. It is used as a template and never arrayed itself; hide it to keep only the cap.',
  },
];

/** Where each cap goes, in placement coordinates, before centring it. */
export interface ModifierStackArrayCapEnds {
  /** One step before the original. */
  startCap: THREE.Matrix4;
  /** One step after the last copy. */
  endCap: THREE.Matrix4;
}

/**
 * Places the start and end caps of one array evaluation. Each cap is centred
 * where the input's centre would land one step past either end, then copied
 * into place; caps that are missing are reported and skipped.
 *
 * @param units Array input.
 * @param plan Evaluation plan.
 * @param placement Placement of the whole input.
 * @param ends Cap transforms in placement coordinates.
 * @param context Evaluation context.
 * @returns Cap copies.
 */
export function modifierStackArrayCapsPlace(
  units: readonly ModifierStackUnit[],
  plan: ModifierStackArrayPlan,
  placement: ModifierStackArrayPlacement,
  ends: ModifierStackArrayCapEnds,
  context: ModifierStackContext,
): ModifierStackUnit[] {
  const output: ModifierStackUnit[] = [];
  for (const key of ['startCap', 'endCap'] as const) {
    const cap = modifierStackArrayCapOf(plan.parameters[key], key, context);
    if (!cap || context.budget.takeCopies(cap.brushes.length, 1) < 1) continue;
    const model = modifierStackArrayCapTransform(cap, plan, placement, ends[key]);
    const anchor = key === 'startCap' ? units[0] : units[units.length - 1];
    const copy = modifierStackUnitCopy(
      cap,
      model,
      key === 'startCap' ? -1 : plan.count,
      MODIFIER_STACK_CAP_UV,
      context,
    );
    output.push({ ...copy, origin: anchor?.origin ?? copy.origin, slot: anchor?.slot });
  }
  return output;
}

/** Caps keep their own texture placement. */
const MODIFIER_STACK_CAP_UV: ModifierStackUvPolicy = { uv: 'copied', readable: true, shiftU: 0, shiftV: 0 };

/**
 * Looks up one named cap and reports a name that resolves to nothing.
 *
 * @param id Stored object id.
 * @param key Cap parameter.
 * @param context Evaluation context.
 * @returns Cap unit, or undefined.
 */
function modifierStackArrayCapOf(
  id: unknown,
  key: 'startCap' | 'endCap',
  context: ModifierStackContext,
): ModifierStackUnit | undefined {
  if (typeof id !== 'string' || id === '') return undefined;
  const cap = context.caps.get(id);
  if (cap) return cap;
  const message = `${key === 'startCap' ? 'Start' : 'End'} cap not found in this solid; it was skipped.`;
  if (!context.report.error.includes(message)) context.report.error = `${context.report.error} ${message}`.trim();
  return undefined;
}

/**
 * Returns the model-space transform that centres a cap on the input and then
 * moves it one step past the end.
 *
 * @param cap Cap unit.
 * @param plan Evaluation plan.
 * @param placement Placement of the whole input.
 * @param end Cap transform in placement coordinates.
 * @returns Model-space transform.
 */
function modifierStackArrayCapTransform(
  cap: ModifierStackUnit,
  plan: ModifierStackArrayPlan,
  placement: ModifierStackArrayPlacement,
  end: THREE.Matrix4,
): THREE.Matrix4 {
  const shift = placement.bounds.getCenter(new THREE.Vector3());
  shift.sub(modifierStackUnitsBounds([cap], plan.frame).getCenter(new THREE.Vector3()));
  const local = end.clone().multiply(new THREE.Matrix4().makeTranslation(shift.x, shift.y, shift.z));
  const world = plan.frame.clone().multiply(local).multiply(plan.frame.clone().invert());
  return modifierStackModelTransform(world, plan.solidRoot);
}
