/// <reference types="vite/client" />

import type { ViewportLayoutManager } from '../managers/layout/viewport_layout_manager.js';
import type { LayoutTestComponents } from '../managers/layout/layout_testing_accessors.js';
import { installE2eTestBridge } from './test_bridge.js';
import type { AiWorldedTestBridge, E2eTestBridgeHost } from './test_bridge_types.js';

/**
 * Installs the E2E test bridge against the live editor. Both the E2E build flag
 * and URL query parameter are required, so production builds omit the bridge.
 *
 * @param layoutManager Live editor layout manager from application startup.
 * @param isE2eBuild Whether this bundle was explicitly built for E2E tests.
 * @returns The installed bridge, or null when E2E mode is disabled.
 */
export function installAppE2eTestBridge(
  layoutManager: ViewportLayoutManager,
  isE2eBuild = import.meta.env.DEV || import.meta.env.MODE === 'e2e',
): AiWorldedTestBridge | null {
  if (!isE2eBuild) return null;
  const components = layoutManager.getComponentsForTesting() as LayoutTestComponents;
  return installE2eTestBridge(buildBridgeHost(components), window.location.search);
}

/**
 * Maps layout testing components onto the bridge host surface. All callback
 * fields delegate to production editor paths so specs drive the real editor.
 *
 * @param components Testing component bag from the layout manager.
 * @returns Bridge host with production-wired actions.
 */
function buildBridgeHost(components: LayoutTestComponents): E2eTestBridgeHost {
  return {
    worldObject: components.worldObject,
    commandStack: components.commandStack,
    selectionManager: components.selectionManager,
    createBoxMesh: (size) => components.primitiveTool.createBox(size, size, size),
    runAfterNextRender: components.runAfterNextRender,
    refreshAfterWorldMutation: components.refreshAfterWorldMutation,
    deleteSelectedObjects: components.deleteSelectedObjects,
    undoLastCommand: components.undoLastCommand,
    redoLastCommand: components.redoLastCommand,
  };
}
