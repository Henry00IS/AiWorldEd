import type * as THREE from 'three';
import type { PhysicsShatterResult } from './fracture/physics_shatter_types.js';
import type { PhysicsShatterBlastSettings } from './physics_shatter_settings.js';
import type { PhysicsShatterBakeStatus } from './physics_shatter_bake_state.js';

/** What the last evaluation of one Physics Shatter modifier produced. */
export interface PhysicsShatterLastRun {
  /** Hash of the fracture inputs. */
  inputHash: string;
  /** Fracture result, pieces in the modifier frame. */
  fracture: PhysicsShatterResult;
  /** Modifier frame to world matrix at evaluation time. */
  frameToWorld: THREE.Matrix4;
  /** Blast settings in the modifier frame. */
  blast: PhysicsShatterBlastSettings;
  /** Bake status at evaluation time. */
  status: PhysicsShatterBakeStatus;
}

/** Last run per volume uuid and modifier id. */
const physicsShatterLastRuns = new Map<string, PhysicsShatterLastRun>();

/**
 * Builds the registry key of one modifier.
 *
 * @param volumeUuid Owning volume uuid.
 * @param stepId Modifier id inside the volume.
 * @returns Key.
 */
function physicsShatterLastRunKey(volumeUuid: string, stepId: string): string {
  return `${volumeUuid}/${stepId}`;
}

/**
 * Remembers the last evaluation of one modifier.
 *
 * @param volumeUuid Owning volume uuid.
 * @param stepId Modifier id inside the volume.
 * @param run Evaluation outcome.
 */
export function physicsShatterLastRunStore(volumeUuid: string, stepId: string, run: PhysicsShatterLastRun): void {
  physicsShatterLastRuns.set(physicsShatterLastRunKey(volumeUuid, stepId), run);
}

/**
 * Returns the last evaluation of one modifier: the pieces a simulation starts
 * from, their input hash, the frame and the blast settings.
 *
 * @param volumeUuid Owning volume uuid.
 * @param stepId Modifier id inside the volume.
 * @returns Last run, or undefined before the first evaluation.
 */
export function physicsShatterLastRunOf(volumeUuid: string, stepId: string): PhysicsShatterLastRun | undefined {
  return physicsShatterLastRuns.get(physicsShatterLastRunKey(volumeUuid, stepId));
}
