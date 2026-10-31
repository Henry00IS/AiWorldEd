import type * as THREE from 'three';
import type { UndoCommand } from '@/commands/command_undo.js';
import type { TextureLockFlags } from '@/texture/lock/texture_lock_transform.js';
import { CommandTransformTextureLocked } from '@/transform/commands/command_transform_texture_locked.js';
import { captureTransformTextureState } from '@/transform/commands/state_transform_texture.js';
import { collectBrushPreviewMeshes } from './snap_align_brush_meshes.js';
import type { SnapAlignHost } from './snap_align_host.js';

/**
 * Records a pose command and one solid rebuild. Face surfaces are snapshotted
 * around the rebuild so undo restores the UVs as well as the pose. Live
 * rebuilds are not requested.
 *
 * @param host Align host.
 * @param inner Pose command whose final pose is already applied.
 * @param roots Objects that moved.
 * @param textureLocks Lock flags for this rebuild. Omitted uses the active
 *   transform locks.
 */
export function recordAlignPoseCommand(
  host: SnapAlignHost,
  inner: UndoCommand,
  roots: readonly THREE.Object3D[],
  textureLocks?: TextureLockFlags,
): void {
  const meshes = collectBrushPreviewMeshes(roots);
  const beforeTexture = captureTransformTextureState(meshes);
  notifyWhenBrushesMoved(host, meshes, textureLocks);
  const afterTexture = captureTransformTextureState(meshes);
  host.commandStack?.recordExecuted(new CommandTransformTextureLocked(inner, beforeTexture, afterTexture));
}

/**
 * Asks the host to rebuild brush solids once when a brush moved.
 *
 * @param host Align host.
 * @param meshes Brush preview meshes.
 * @param textureLocks Lock flags forwarded to the solid rebuild.
 */
function notifyWhenBrushesMoved(
  host: SnapAlignHost,
  meshes: readonly THREE.Mesh[],
  textureLocks?: TextureLockFlags,
): void {
  if (meshes.length === 0) {
    return;
  }
  host.notifySolidTransformsCommitted(meshes, textureLocks);
}
