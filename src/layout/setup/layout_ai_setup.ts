import type * as THREE from 'three';
import type { CommandStack } from '@/commands/command_stack.js';
import type { ManagerSelection } from '@/selection/object/manager_selection.js';
import type { SolidModelController } from '@/solid/controller/solid_model_controller.js';
import type { GridSnap } from '@/transform/snap/grid_snap.js';
import type { ManagerSnap } from '@/transform/snap/manager_snap.js';
import { EditorApi } from '@/ai/client/editor_api.js';
import { sharedMcpBridgeHandler } from '@/ai/client/handler_mcp_bridge.js';

/** Host fields required to wire the AI EditorApi bridge. */
export interface LayoutAiSetupHost {
  worldObject: THREE.Group;
  commandStack: CommandStack;
  selectionManager: ManagerSelection;
  solidModelController: SolidModelController | null;
  gridSnap: GridSnap;
  snapManager: ManagerSnap;
  getUserSnapEnabled: () => boolean;
  refreshAfterWorldMutation: () => void;
  refreshOutliner: () => void;
  showStatusMessage: (message: string) => void;
  /** Shared editor scene for offline AI view_capture. */
  getScene?: () => THREE.Scene | null;
  /** Shared WebGL renderer for offline AI view_capture. */
  getRenderer?: () => THREE.WebGLRenderer | null;
}

/** Result of AI layout wiring. */
export interface LayoutAiSetupResult {
  editorApi: EditorApi | null;
}

/**
 * Binds the EditorApi facade for MCP tool calls. UI lives on the main toolbar
 * (MCP dialog), not a separate strip.
 *
 * @param host Layout host with live editor systems.
 * @returns Bound API or null when solid tools are unavailable.
 */
export function setupLayoutAi(host: LayoutAiSetupHost): LayoutAiSetupResult {
  if (!host.solidModelController) {
    return { editorApi: null };
  }
  const editorApi = new EditorApi({
    worldObject: host.worldObject,
    commandStack: host.commandStack,
    selectionManager: host.selectionManager,
    solidModelController: host.solidModelController,
    gridSnap: host.gridSnap,
    snapManager: host.snapManager,
    getUserSnapEnabled: host.getUserSnapEnabled,
    refreshAfterWorldMutation: host.refreshAfterWorldMutation,
    refreshOutliner: host.refreshOutliner,
    showStatus: host.showStatusMessage,
    ...(host.getScene ? { getScene: host.getScene } : {}),
    ...(host.getRenderer ? { getRenderer: host.getRenderer } : {}),
  });
  sharedMcpBridgeHandler.bindEditorApi(editorApi);
  return { editorApi };
}
