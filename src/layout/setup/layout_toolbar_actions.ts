import { getMcpDesktopBridge } from '@/ai/client/bridge_mcp_desktop.js';
import { showMcpDialog } from '@/ai/client/dialog_mcp.js';
import { DocumentationLink } from '@/ui/link/documentation_link.js';
import type { StatusBar } from '@/ui/status/status_bar.js';
import type { Toolbar } from '@/ui/toolbar/toolbar.js';
import type { DetachedViewportWindow } from '@/viewports/detached/detached_viewport_window.js';
import type { SolidModelController } from '@/solid/controller/solid_model_controller.js';
import type { SolidModelPanel } from '@/solid/ui/panel/solid_model_panel.js';
import { ControllerSnapSettings } from '@/tools/snap/controller_snap_settings.js';
import type { SnapPolicy } from '@/snap/policy/snap_policy.js';
import type { GridSnap } from '@/transform/snap/grid_snap.js';
import type { ManagerSnap } from '@/transform/snap/manager_snap.js';
import type { TextureLockSettings } from '@/texture/lock/texture_lock_settings.js';
import type { HandlerKeyboardShortcut } from '@/input/handler_keyboard_shortcut.js';
import type * as THREE from 'three';
import type { ViewportEditor } from '@/viewports/core/viewport_editor.js';

/**
 * Opens the MCP connection dialog from the main toolbar.
 *
 * @param container Editor shell container.
 * @param toolbar Main toolbar, if present.
 * @param statusBar Status bar, if present.
 * @param showStatusMessage Status message callback.
 */
export function openLayoutMcpDialog(
  container: HTMLElement,
  toolbar: Toolbar | null,
  statusBar: StatusBar | null,
  showStatusMessage: (message: string) => void,
): void {
  void showMcpDialog({
    host: container,
    bridge: getMcpDesktopBridge(),
    showStatus: showStatusMessage,
    onRunningChanged: (running) => setLayoutMcpToolbarButtonActive(toolbar, running),
  });
  statusBar?.setLastAction('MCP dialog opened');
}

/**
 * Queries desktop MCP host status and glows the toolbar MCP button when
 * running.
 *
 * @param toolbar Main toolbar, if present.
 */
export async function refreshLayoutMcpToolbarButton(toolbar: Toolbar | null): Promise<void> {
  const bridge = getMcpDesktopBridge();
  if (!bridge) {
    setLayoutMcpToolbarButtonActive(toolbar, false);
    return;
  }
  try {
    const status = await bridge.getMcpStatus();
    setLayoutMcpToolbarButtonActive(toolbar, status.running);
  } catch {
    setLayoutMcpToolbarButtonActive(toolbar, false);
  }
}

/**
 * Highlights the main toolbar MCP control when the host is running.
 *
 * @param toolbar Main toolbar, if present.
 * @param running Whether the MCP server is active.
 */
export function setLayoutMcpToolbarButtonActive(toolbar: Toolbar | null, running: boolean): void {
  toolbar?.setButtonActiveByLabel('MCP', running);
}

/**
 * Toggles the solid model floating panel and reports status when opened.
 *
 * @param solidModelController Solid model controller, if present.
 * @param solidModelPanel Solid model panel, if present.
 * @param statusBar Status bar, if present.
 */
export function toggleLayoutSolidModelPanel(
  solidModelController: SolidModelController | null,
  solidModelPanel: SolidModelPanel | null,
  statusBar: StatusBar | null,
): void {
  solidModelController?.togglePanel();
  if (solidModelPanel?.isOpen()) {
    statusBar?.setLastAction('Solid Model panel opened');
  }
}

/**
 * Opens another detached viewport window for multi-monitor use.
 *
 * @param bindDetachedViewportRenderSource Binds shared scene sources before
 *   open.
 * @param detachedViewportWindow Detached window manager.
 * @param showStatusMessage Status message callback.
 */
export function openLayoutDetachedViewport(
  bindDetachedViewportRenderSource: () => void,
  detachedViewportWindow: DetachedViewportWindow,
  showStatusMessage: (message: string) => void,
): void {
  bindDetachedViewportRenderSource();
  const opened = detachedViewportWindow.open();
  if (opened) {
    const count = detachedViewportWindow.getOpenCount();
    showStatusMessage(count === 1 ? 'Detached viewport opened' : `Detached viewport opened (${count} open)`);
    return;
  }
  showStatusMessage('Could not open detached viewport (popup blocked?)');
}

/**
 * Opens the hosted user documentation in a separate browser tab.
 *
 * @param statusBar Status bar, if present.
 */
export function openLayoutDocumentation(statusBar: StatusBar | null): void {
  new DocumentationLink().open();
  statusBar?.setLastAction('Documentation opened');
}

/**
 * Creates and initializes the snap settings controller.
 *
 * @param deps Snap settings wiring dependencies.
 * @returns Configured snap settings controller.
 */
export function createLayoutSnapSettingsController(deps: {
  gridSnap: GridSnap;
  snapManager: ManagerSnap;
  textureLock: TextureLockSettings;
  toolbar: Toolbar;
  statusBar: StatusBar | null;
  keyboardShortcutHandler: HandlerKeyboardShortcut;
  worldObject: THREE.Group;
  getViewports: () => readonly ViewportEditor[];
  getUserSnapEnabled: () => boolean;
  setUserSnapEnabled: (enabled: boolean) => void;
  snapPolicy?: SnapPolicy;
}): ControllerSnapSettings {
  const controller = new ControllerSnapSettings(deps);
  controller.setup();
  return controller;
}
