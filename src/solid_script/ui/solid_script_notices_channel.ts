import type * as THREE from 'three';

/** Receives the messages a script showed for a step of an object. */
export type SolidScriptNoticesListener = (
  owner: THREE.Object3D,
  stepId: string,
  notices: readonly string[],
  error: string | null,
) => void;

/** Everyone listening for messages. */
const SOLID_SCRIPT_NOTICES_LISTENERS = new Set<SolidScriptNoticesListener>();

/**
 * Passes on the messages a script's handlers showed outside the inspector, such
 * as for a Widget Button pressed in the scene, so the inspector of that step
 * shows them as it does for its own buttons.
 *
 * @param owner Object whose step ran.
 * @param stepId Step id.
 * @param notices Messages shown.
 * @param error Mistake a handler stopped at, or null.
 */
export function solidScriptNoticesPublish(
  owner: THREE.Object3D,
  stepId: string,
  notices: readonly string[],
  error: string | null,
): void {
  for (const listener of [...SOLID_SCRIPT_NOTICES_LISTENERS]) listener(owner, stepId, notices, error);
}

/**
 * Listens for messages passed on with {@link solidScriptNoticesPublish}.
 *
 * @param listener Receives each message set.
 * @returns Stops listening.
 */
export function solidScriptNoticesListen(listener: SolidScriptNoticesListener): () => void {
  SOLID_SCRIPT_NOTICES_LISTENERS.add(listener);
  return () => SOLID_SCRIPT_NOTICES_LISTENERS.delete(listener);
}
