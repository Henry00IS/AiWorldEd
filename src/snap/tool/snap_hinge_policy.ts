import { SnapPolicy } from '@/snap/policy/snap_policy.js';

/**
 * Policy used while Hinge is aiming. Vertices, edges, and faces are all
 * eligible even when the toolbar toggles are off.
 *
 * @returns Active hinge policy.
 */
export function createHingeSnapPolicy(): SnapPolicy {
  const policy = new SnapPolicy();
  policy.setMasterEnabled(true);
  policy.setVertexEnabled(true);
  policy.setEdgeEnabled(true);
  policy.setFaceEnabled(true);
  return policy;
}
