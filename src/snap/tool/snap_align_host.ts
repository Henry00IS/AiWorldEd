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
  showStatusMessage: (message: string) => void;
  notifySolidTransformsLive: (meshes: readonly THREE.Mesh[]) => void;
  notifySolidTransformsCommitted: (meshes: readonly THREE.Mesh[], textureLocks?: TextureLockFlags) => void;
  basePolicy: SnapPolicy;
  beginAlignChrome: (which: SnapAlignChromeId) => void;
  endAlignChrome: () => void;
}
