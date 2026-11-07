import type * as THREE from 'three';
import type { ModifierStackStepReport } from '@/modifier/stack/modifier_stack_types.js';

/** Evaluation feedback of one volume, summed over every solid it touches. */
export interface ModifierStackStatus {
  /** Authored brushes the volume captured. */
  captured: number;
  /** Derived brushes the volume produced. */
  derived: number;
  /** Touching brushes skipped because they are invalid. */
  skipped: number;
  /** Captured brushes kept unbevelled because their bevel would be invalid. */
  unbevelled: number;
  /** Feedback of each modifier, in stack order. */
  steps: ModifierStackStepReport[];
}

const modifierStackStatusByVolume = new WeakMap<THREE.Object3D, Map<string, ModifierStackStatus>>();

/**
 * Replaces one solid's contribution to a volume's feedback.
 *
 * @param volume Modifier volume.
 * @param solidId Solid root uuid.
 * @param status Feedback from that solid.
 */
export function modifierStackStatusWrite(volume: THREE.Object3D, solidId: string, status: ModifierStackStatus): void {
  const perSolid = modifierStackStatusByVolume.get(volume) ?? new Map<string, ModifierStackStatus>();
  perSolid.set(solidId, status);
  modifierStackStatusByVolume.set(volume, perSolid);
}

/**
 * Drops every contribution, for example before a scene-wide rebuild.
 *
 * @param volume Modifier volume.
 */
export function modifierStackStatusReset(volume: THREE.Object3D): void {
  modifierStackStatusByVolume.delete(volume);
}

/**
 * Returns the summed feedback of a volume.
 *
 * @param volume Modifier volume.
 * @returns Feedback, or null before the first evaluation.
 */
export function modifierStackStatusRead(volume: THREE.Object3D): ModifierStackStatus | null {
  const perSolid = modifierStackStatusByVolume.get(volume);
  if (!perSolid || perSolid.size === 0) return null;
  const total: ModifierStackStatus = { captured: 0, derived: 0, skipped: 0, unbevelled: 0, steps: [] };
  for (const status of perSolid.values()) modifierStackStatusAdd(total, status);
  return total;
}

/**
 * Adds one solid's feedback to a running total.
 *
 * @param total Running total.
 * @param status Feedback to add.
 */
function modifierStackStatusAdd(total: ModifierStackStatus, status: ModifierStackStatus): void {
  total.captured += status.captured;
  total.derived += status.derived;
  total.skipped += status.skipped;
  total.unbevelled += status.unbevelled;
  status.steps.forEach((step, index) => {
    const current = total.steps[index] ?? { outputs: 0, error: '' };
    current.outputs += step.outputs;
    if (step.error && !current.error.includes(step.error))
      current.error = current.error ? `${current.error} ${step.error}` : step.error;
    total.steps[index] = current;
  });
}
