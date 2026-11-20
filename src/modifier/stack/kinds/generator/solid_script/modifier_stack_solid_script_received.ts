import { Vector3, type Object3D } from 'three';
import { modifierStackVolumeBox } from '@/modifier/stack/evaluate/modifier_stack_frame.js';
import type { SolidScriptUse } from '@/solid_script/document/solid_script_document.js';
import { SOLID_SCRIPT_USE_GENERATOR, type SolidScriptUseFacts } from '@/solid_script/language/solid_script_system.js';
import { modifierStackSolidScriptHostMode } from './modifier_stack_solid_script_host_mode.js';

/** What a SolidScript modifier received at its last evaluation. */
export interface ModifierStackSolidScriptReceived {
  /** The received brushes, as the script reads them. */
  use: SolidScriptUseFacts;
  /** Size of their bounds in script axes: width, height, depth. */
  box: [number, number, number];
}

/** Last received brushes by owner, then by modifier id. */
const modifierStackSolidScriptReceivedByOwner = new WeakMap<Object3D, Map<string, ModifierStackSolidScriptReceived>>();

/**
 * Remembers what a SolidScript modifier received, so its editor runs the script
 * on the same brushes.
 *
 * @param owner Volume, brush or group owning the stack.
 * @param stepId Modifier id.
 * @param received What it received.
 */
export function modifierStackSolidScriptReceivedWrite(
  owner: Object3D,
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
 * Returns what a run of a step's script starts from, the same for the stack,
 * the editor and the inspector: for a generator, the size of its box; for a
 * modifier, the brushes it received at its last evaluation and the size of
 * their bounds.
 *
 * @param owner Volume, brush or group owning the stack.
 * @param stepId Step id.
 * @param use How the step uses its script.
 * @returns Box size in script axes (width, height, depth) and, for a modifier,
 *   what it receives.
 */
export function modifierStackSolidScriptRunStart(
  owner: Object3D,
  stepId: string,
  use: SolidScriptUse,
): { box: [number, number, number]; use?: SolidScriptUseFacts } {
  const mode = modifierStackSolidScriptHostMode(owner);
  if (use === 'modifier') {
    const received = modifierStackSolidScriptReceivedByOwner.get(owner)?.get(stepId);
    const facts = received?.use;
    if (facts) return { box: received?.box ?? [1, 1, 1], use: { ...facts, usage: 'Modifier' as const, mode } };
    return { box: received?.box ?? [1, 1, 1], use: { usage: 'Modifier' as const, solids: [], faces: 0, mode } };
  }
  const size = modifierStackVolumeBox(owner).getSize(new Vector3());
  return {
    box: [size.x, size.y, size.z],
    use: {
      ...SOLID_SCRIPT_USE_GENERATOR,
      mode,
      insertMode: mode === 'Pass-Through' ? 'Additive' : mode,
    },
  };
}
