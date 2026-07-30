import type * as THREE from 'three';
import type { CommandStack } from '../commands/command_stack.js';
import type { SelectionManager } from '../selection/object/selection_manager.js';

/** Query parameter that activates the E2E test bridge when present. */
export const E2E_QUERY_PARAM = 'e2e';

/** Window key that holds the installed bridge instance. */
export const E2E_BRIDGE_WINDOW_KEY = '__AIWORLDED__';

/** Window key that flips true after the first rendered frame. */
export const E2E_READY_WINDOW_KEY = '__AIWORLDED_READY__';

/** Flat view of one world object exposed to E2E specs. */
export interface E2eSceneObjectSummary {
  name: string;
  type: string;
}

/** Serializable snapshot of the world root for DOM assertions. */
export interface E2eSceneSummary {
  objects: E2eSceneObjectSummary[];
}

/** Serializable perspective camera transform exposed to E2E specs. */
export interface E2eCameraSummary {
  position: number[];
  quaternion: number[];
}

/** Arguments accepted by the bridge box creation helper. */
export interface E2eCreateBoxArgs {
  name?: string;
  size?: number;
}

/** Programmatic surface Cypress specs use to drive the live editor. */
export interface AiWorldedTestBridge {
  whenReady: () => Promise<void>;
  isReady: () => boolean;
  getSceneSummary: () => E2eSceneSummary;
  getPerspectiveCameraSummary: () => E2eCameraSummary | null;
  createBox: (args?: E2eCreateBoxArgs) => E2eSceneObjectSummary;
  selectByName: (name: string) => boolean;
  getSelectedNames: () => string[];
  deleteSelected: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

/**
 * Live editor systems the bridge delegates to. Production wiring comes from the
 * layout manager testing accessors; unit tests supply plain instances.
 */
export interface E2eTestBridgeHost {
  worldObject: THREE.Group;
  commandStack: CommandStack;
  selectionManager: SelectionManager;
  getPerspectiveCamera: () => THREE.PerspectiveCamera | null;
  createBoxMesh: (size: number) => THREE.Mesh;
  runAfterNextRender: (callback: () => void) => void;
  refreshAfterWorldMutation: () => void;
  deleteSelectedObjects: () => void;
  undoLastCommand: () => void;
  redoLastCommand: () => void;
}

declare global {
  interface Window {
    [E2E_BRIDGE_WINDOW_KEY]?: AiWorldedTestBridge;
    [E2E_READY_WINDOW_KEY]?: boolean;
  }
}
