import { Vector3, type Object3D } from 'three';
import { modifierStackVolumeBox } from '@/modifier/stack/evaluate/modifier_stack_frame.js';
import type { SolidScriptUse } from '@/solid_script/document/solid_script_document.js';
import type { SolidScriptBoxCorners, SolidScriptBoxPose } from '@/solid_script/language/solid_script_box.js';
import { SOLID_SCRIPT_USE_GENERATOR, type SolidScriptUseFacts } from '@/solid_script/language/solid_script_system.js';
import { modifierStackSolidScriptHostMode } from './modifier_stack_solid_script_host_mode.js';
import {
  modifierStackSolidScriptBoxCorners,
  modifierStackSolidScriptBoxPose,
} from './modifier_stack_solid_script_box.js';

/** What a SolidScript modifier received at its last evaluation. */
export interface ModifierStackSolidScriptReceived {
  /** The received brushes, as the script reads them. */
  use: SolidScriptUseFacts;
  /** Size of the received bounds in script axes: width, height, depth. */
  box: [number, number, number];
  /** Centre of the received bounds in the volume frame, the script origin. */
  origin: [number, number, number];
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

/** What a run of a step's script starts from in the editor. */
export interface ModifierStackSolidScriptRunStart {
  /** $Box size in script axes: width, height, depth. */
  box: [number, number, number];
  /** Pose of the generator or modifier volume in the level. */
  pose: SolidScriptBoxPose;
  /** $Box corners in script space. */
  corners: SolidScriptBoxCorners;
  /** Where the script is used and, for a modifier, what it receives. */
  use?: SolidScriptUseFacts;
}

/**
 * Returns what a run of a step's script starts from, the same for the stack,
 * the editor and the inspector: $Box comes from the generator or modifier
 * volume; a modifier also receives the brushes of its last evaluation.
 *
 * @param owner Volume, brush or group owning the stack.
 * @param stepId Step id.
 * @param use How the step uses its script.
 * @returns Box values and, for a modifier, what it receives.
 */
export function modifierStackSolidScriptRunStart(
  owner: Object3D,
  stepId: string,
  use: SolidScriptUse,
): ModifierStackSolidScriptRunStart {
  const mode = modifierStackSolidScriptHostMode(owner);
  if (use === 'modifier') {
    const received = modifierStackSolidScriptReceivedByOwner.get(owner)?.get(stepId);
    const facts = received?.use;
    const start = modifierStackSolidScriptOwnerBox(owner, received?.origin);
    if (facts) return { ...start, use: { ...facts, usage: 'Modifier' as const, mode } };
    return { ...start, use: { usage: 'Modifier' as const, solids: [], faces: 0, mode } };
  }
  return {
    ...modifierStackSolidScriptOwnerBox(owner),
    use: {
      ...SOLID_SCRIPT_USE_GENERATOR,
      mode,
      insertMode: mode === 'Pass-Through' ? 'Additive' : mode,
    },
  };
}

/**
 * Reads $Box from the owning generator or modifier volume.
 *
 * @param owner Volume, brush or group owning the stack.
 * @param origin Script origin in the volume frame, or the volume centre.
 * @returns Size, pose and corners.
 */
function modifierStackSolidScriptOwnerBox(
  owner: Object3D,
  origin?: readonly [number, number, number],
): Pick<ModifierStackSolidScriptRunStart, 'box' | 'pose' | 'corners'> {
  const volumeBox = modifierStackVolumeBox(owner);
  const size = volumeBox.getSize(new Vector3());
  const centre = origin ? new Vector3(...origin) : volumeBox.getCenter(new Vector3());
  return {
    box: [size.x, size.y, size.z],
    pose: modifierStackSolidScriptBoxPose(owner),
    corners: volumeBox.isEmpty()
      ? { min: [0, 0, 0], max: [0, 0, 0] }
      : modifierStackSolidScriptBoxCorners(volumeBox, centre),
  };
}
