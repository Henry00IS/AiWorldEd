import type * as THREE from 'three';
import type { SolidScriptUseFacts } from '@/solid_script/language/solid_script_system.js';

/** What a SolidScript modifier received at its last evaluation. */
export interface ModifierStackSolidScriptReceived {
  /** The received brushes, as the script reads them. */
  use: SolidScriptUseFacts;
  /** Size of their bounds in script axes: width, height, depth. */
  box: [number, number, number];
}

/** Last received brushes by owner, then by modifier id. */
const modifierStackSolidScriptReceivedByOwner = new WeakMap<
  THREE.Object3D,
  Map<string, ModifierStackSolidScriptReceived>
>();

/**
 * Remembers what a SolidScript modifier received, so its editor runs the script
 * on the same brushes.
 *
 * @param owner Volume, brush or group owning the stack.
 * @param stepId Modifier id.
 * @param received What it received.
 */
export function modifierStackSolidScriptReceivedWrite(
  owner: THREE.Object3D,
  stepId: string,
  received: ModifierStackSolidScriptReceived,
): void {
  let bySteps = modifierStackSolidScriptReceivedByOwner.get(owner);
  if (!bySteps) {
    bySteps = new Map();
    modifierStackSolidScriptReceivedByOwner.set(owner, bySteps);
  }
  bySteps.set(stepId, received);
}

/**
 * Returns what a SolidScript modifier received at its last evaluation.
 *
 * @param owner Volume, brush or group owning the stack.
 * @param stepId Modifier id.
 * @returns What it received, or undefined before it was evaluated.
 */
export function modifierStackSolidScriptReceivedRead(
  owner: THREE.Object3D,
  stepId: string,
): ModifierStackSolidScriptReceived | undefined {
  return modifierStackSolidScriptReceivedByOwner.get(owner)?.get(stepId);
}
