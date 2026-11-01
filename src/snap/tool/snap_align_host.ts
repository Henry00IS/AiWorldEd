import type * as THREE from 'three';
import type { CommandStack } from '@/commands/command_stack.js';
import type { SnapPolicy } from '@/snap/policy/snap_policy.js';
import type { TextureLockFlags } from '@/texture/lock/texture_lock_transform.js';
import type { ViewportEditor } from '@/viewports/core/viewport_editor.js';
import type { SnapAlignChromeId } from './snap_align_chrome_id.js';

/** Scene services a single-use align tool needs. */
export interface SnapAlignHost {
  worldObject: THREE.Object3D;
  commandStack: CommandStack | null;
  getViewports: () => readonly ViewportEditor[];
  getPrimaryScene: () => THREE.Scene;
  getSelectedRoots: () => readonly THREE.Object3D[];
  /**
   * Selects the roots a tool is about to move, so it only moves objects the
   * user holds. Returns false (after reporting why) when the selection is
   * refused, for example because another room member edits them. Hosts without
   * it let the tool move any root.
   */
  claimRoots?: (roots: readonly THREE.Object3D[]) => boolean;
  showStatusMessage: (message: string) => void;
  notifySolidTransformsLive: (meshes: readonly THREE.Mesh[]) => void;
  notifySolidTransformsCommitted: (meshes: readonly THREE.Mesh[], textureLocks?: TextureLockFlags) => void;
  basePolicy: SnapPolicy;
  beginAlignChrome: (which: SnapAlignChromeId) => void;
  endAlignChrome: () => void;
}
