import { CreatePrimitiveCommand } from '../commands/create/create_primitive_command.js';
import { collectSceneSummary, findWorldMeshByName, summarizeObject } from './test_bridge_scene.js';
import {
  E2E_BRIDGE_WINDOW_KEY,
  E2E_READY_WINDOW_KEY,
  E2E_QUERY_PARAM,
  type AiWorldedTestBridge,
  type E2eCameraSummary,
  type E2eCreateBoxArgs,
  type E2eTestBridgeHost,
} from './test_bridge_types.js';

/**
 * Returns whether the E2E test bridge should activate for the given URL.
 *
 * @param search `window.location.search` style query string.
 * @returns True when the `e2e` query parameter is present.
 */
export function isE2eModeEnabled(search: string): boolean {
  return new URLSearchParams(search).has(E2E_QUERY_PARAM);
}

/**
 * Installs `window.__AIWORLDED__` when E2E mode is enabled. The bridge sets the
 * ready flag after the render loop completes a frame.
 *
 * @param host Live editor systems the bridge delegates to.
 * @param search Query string used for the E2E mode gate.
 * @returns The installed bridge, or null when E2E mode is disabled.
 */
export function installE2eTestBridge(host: E2eTestBridgeHost, search: string): AiWorldedTestBridge | null {
  if (!isE2eModeEnabled(search)) return null;
  const bridge = createBridge(host);
  scheduleReadinessFlag(host.runAfterNextRender);
  window[E2E_BRIDGE_WINDOW_KEY] = bridge;
  return bridge;
}

/**
 * Builds the bridge surface exposed to specs. Every mutation delegates to the
 * host so specs exercise production command and refresh paths.
 *
 * @param host Live editor systems the bridge delegates to.
 * @returns Bridge object installed on `window`.
 */
function createBridge(host: E2eTestBridgeHost): AiWorldedTestBridge {
  return {
    whenReady: () => waitForReadyFlag(),
    isReady: () => window[E2E_READY_WINDOW_KEY] === true,
    getSceneSummary: () => collectSceneSummary(host.worldObject),
    getPerspectiveCameraSummary: () => getPerspectiveCameraSummary(host),
    createBox: (args) => createBoxThroughCommands(host, args),
    selectByName: (name) => selectWorldMeshByName(host, name),
    getSelectedNames: () => getSelectedObjectNames(host),
    deleteSelected: () => host.deleteSelectedObjects(),
    undo: () => host.undoLastCommand(),
    redo: () => host.redoLastCommand(),
    canUndo: () => host.commandStack.canUndo(),
    canRedo: () => host.commandStack.canRedo(),
  };
}

/**
 * Captures the live perspective camera transform as serializable arrays.
 *
 * @param host Live editor systems providing the perspective camera.
 * @returns Camera transform, or null when no perspective viewport exists.
 */
function getPerspectiveCameraSummary(host: E2eTestBridgeHost): E2eCameraSummary | null {
  const camera = host.getPerspectiveCamera();
  if (!camera) return null;
  return {
    position: camera.position.toArray(),
    quaternion: camera.quaternion.toArray(),
  };
}

/**
 * Creates a box through the same command stack path as the editor toolbar, then
 * refreshes the scene and selects the new mesh like production does.
 *
 * @param host Live editor systems the bridge delegates to.
 * @param args Optional name and uniform size overrides.
 * @returns Summary of the created mesh for spec assertions.
 */
function createBoxThroughCommands(host: E2eTestBridgeHost, args?: E2eCreateBoxArgs) {
  const mesh = host.createBoxMesh(args?.size ?? 1);
  if (args?.name) mesh.name = args.name;
  host.commandStack.push(new CreatePrimitiveCommand(mesh, host.worldObject));
  host.refreshAfterWorldMutation();
  host.selectionManager.selectObject(mesh);
  return summarizeObject(mesh);
}

/**
 * Selects the first direct world child matching the given name.
 *
 * @param host Live editor systems the bridge delegates to.
 * @param name Object name to select.
 * @returns True when a matching mesh was found and selected.
 */
function selectWorldMeshByName(host: E2eTestBridgeHost, name: string): boolean {
  const mesh = findWorldMeshByName(host.worldObject, name);
  if (!mesh) return false;
  host.selectionManager.selectObject(mesh);
  return true;
}

/**
 * Lists the names of the currently selected objects.
 *
 * @param host Live editor systems the bridge delegates to.
 * @returns Selected object names in insertion order.
 */
function getSelectedObjectNames(host: E2eTestBridgeHost): string[] {
  return Array.from(host.selectionManager.getSelectedObjects(), (mesh) => mesh.name);
}

/**
 * Schedules the ready flag after a successful render pass.
 *
 * @param runAfterNextRender Production render-loop scheduling callback.
 */
function scheduleReadinessFlag(runAfterNextRender: (callback: () => void) => void): void {
  window[E2E_READY_WINDOW_KEY] = false;
  runAfterNextRender(() => (window[E2E_READY_WINDOW_KEY] = true));
}

/**
 * Resolves once the ready flag is set. Polls on animation frames so specs never
 * depend on hardcoded millisecond delays.
 *
 * @returns Promise resolving after the first rendered frame.
 */
function waitForReadyFlag(): Promise<void> {
  return new Promise((resolve) => {
    const poll = () => (window[E2E_READY_WINDOW_KEY] === true ? resolve() : requestAnimationFrame(poll));
    poll();
  });
}
