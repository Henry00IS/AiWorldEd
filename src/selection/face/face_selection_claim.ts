import type * as THREE from 'three';
import type { ManagerSelection } from '@/selection/object/manager_selection.js';
import { selectionCoversObjects } from '@/selection/object/selection_object_cover.js';
import type { FaceSelectionAdmission } from './manager_face_selection.js';

/**
 * Builds the face selection admission used in a shared room: picking faces
 * selects the meshes that own them (a solid result locks its whole model), so
 * face textures, UV moves, smears and extrusions only touch objects the user
 * holds. A refused selection leaves the face selection unchanged; the room
 * reports who is editing. Offline (no object admission) every pick is admitted
 * without changing the object selection.
 *
 * @param selection Object selection manager.
 * @returns Face selection admission.
 */
export function faceSelectionClaimAdmission(selection: ManagerSelection): FaceSelectionAdmission {
  return (meshes, additive) => {
    if (!selection.isAdmissionActive()) return true;
    const owners = [...new Set<THREE.Mesh>(meshes)];
    if (owners.length === 0 || selectionCoversObjects(selection, owners)) return true;
    const current = additive ? selection.getAllSelectedObjectsAsArray() : [];
    return selection.setSelection([...new Set<THREE.Mesh>([...current, ...owners])]);
  };
}
