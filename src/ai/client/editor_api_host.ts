import type * as THREE from 'three';
import type { CommandStack } from '@/commands/command_stack.js';
import type { ManagerSelection } from '@/selection/object/manager_selection.js';
import type { SolidModelController } from '@/solid/controller/solid_model_controller.js';
import type { GridSnap } from '@/transform/snap/grid_snap.js';
import type { ManagerSnap } from '@/transform/snap/manager_snap.js';

/**
 * Dependencies injected into EditorApi once at layout bootstrap. Keeps AI code
 * from reaching into layout managers directly.
 */
export interface EditorApiHost {
  worldObject: THREE.Group;
  commandStack: CommandStack;
  selectionManager: ManagerSelection;
  solidModelController: SolidModelController;
  gridSnap: GridSnap;
  snapManager: ManagerSnap;
  getUserSnapEnabled: () => boolean;
  refreshAfterWorldMutation: () => void;
  refreshOutliner: () => void;
  showStatus: (message: string) => void;
  /**
   * Shared editor scene for view_capture. Set by layout bootstrap; unit tests
   * may omit it.
   */
  getScene?: () => THREE.Scene | null;
  /**
   * Shared WebGL renderer for view_capture. Set by layout bootstrap; unit tests
   * may omit it.
   */
  getRenderer?: () => THREE.WebGLRenderer | null;
}
