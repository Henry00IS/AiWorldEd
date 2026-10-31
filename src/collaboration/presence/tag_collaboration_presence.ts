import type * as THREE from 'three';

/** UserData flag of presence helpers (see isEditorHelperObject). */
export const PRESENCE_COLLABORATION_USERDATA_KEY = 'isCollaborationPresence';

/**
 * Marks a presence object tree as an editor helper: never saved, synced, picked
 * or used for CSG.
 *
 * @param root Root of the tree.
 */
export function presenceCollaborationTag(root: THREE.Object3D): void {
  root.traverse((child) => {
    child.userData[PRESENCE_COLLABORATION_USERDATA_KEY] = true;
    child.raycast = presenceCollaborationRaycastNone;
  });
}

/** Raycast that never hits, so presence helpers cannot be picked. */
function presenceCollaborationRaycastNone(): void {}
