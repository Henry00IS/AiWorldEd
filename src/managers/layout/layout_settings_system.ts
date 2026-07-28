import { AboutDialog } from '../../ui/about/about_dialog.js';
import { SettingsDialog } from '../../ui/settings/settings_dialog.js';
import { EditorSettingsStore } from '../../settings/editor_settings_store.js';
import { SettingsApplicator } from '../../settings/settings_applicator.js';
import type { ViewSettings } from '../../settings/settings_types.js';
import { getTextureMapCache } from '../../texture/library/texture_map_cache.js';
import { createTextureFilterPolicy } from '../../texture/library/texture_filter_policy.js';
import type { Viewport3D } from '../../viewports/viewport_3d.js';
import { isPerspectiveViewport, type EditorViewport } from '../../viewports/editor_viewport.js';
import type { ViewportPaneLayout } from './viewport_pane_layout.js';
import type { StatusBar } from '../../ui/status_bar.js';
import type { Toolbar } from '../../ui/toolbar.js';

/** Result of creating the settings store, applicator, and dialog. */
export interface LayoutSettingsSystemParts {
  settingsStore: EditorSettingsStore;
  settingsApplicator: SettingsApplicator;
  settingsDialog: SettingsDialog;
  settingsUnsubscribe: () => void;
}

/** Dependencies required to create and wire the settings subsystem. */
export interface LayoutSettingsCreateDeps {
  container: HTMLElement;
  viewport3D: Viewport3D;
  viewportPaneLayout: ViewportPaneLayout;
  toolbar: Toolbar;
  resizeAll: () => void;
  onVisibleSlots?: (slots: readonly string[]) => void;
  getViewports?: () => EditorViewport[];
}

/**
 * Creates the settings store, applicator, dialog, and subscription.
 *
 * @param deps Layout settings create dependencies.
 * @returns Owned settings subsystem parts.
 */
export function createLayoutSettingsSystem(deps: LayoutSettingsCreateDeps): LayoutSettingsSystemParts {
  const settingsStore = new EditorSettingsStore();
  const settingsApplicator = new SettingsApplicator(document.documentElement);
  settingsApplicator.applySnapshot(settingsStore.getSnapshot());
  deps.toolbar.setButtonLabelsEnabled(settingsStore.getViewSettings().toolbarButtonLabels);
  applyLayoutViewportPaneCount(
    deps.viewportPaneLayout,
    deps.resizeAll,
    settingsStore.getViewSettings().viewportPaneCount,
    deps.onVisibleSlots,
  );
  applyMouseSettingsToViewports(deps, settingsStore.getMouseSettings());
  applyLayoutTextureFilterSettings(deps.viewport3D, settingsStore.getViewSettings());
  const settingsUnsubscribe = settingsStore.subscribe((snapshot) => {
    settingsApplicator.applySnapshot(snapshot);
    deps.toolbar.setButtonLabelsEnabled(snapshot.view.toolbarButtonLabels);
    applyLayoutViewportPaneCount(
      deps.viewportPaneLayout,
      deps.resizeAll,
      snapshot.view.viewportPaneCount,
      deps.onVisibleSlots,
    );
    applyMouseSettingsToViewports(deps, snapshot.mouse);
    applyLayoutTextureFilterSettings(deps.viewport3D, snapshot.view);
  });
  const settingsDialog = new SettingsDialog(deps.container, settingsStore);
  return { settingsStore, settingsApplicator, settingsDialog, settingsUnsubscribe };
}

/**
 * Applies navigation preferences to every live perspective viewport.
 *
 * @param deps Settings system dependencies.
 * @param mouse Current mouse settings.
 */
function applyMouseSettingsToViewports(
  deps: LayoutSettingsCreateDeps,
  mouse: import('../../settings/settings_types.js').MouseSettings,
): void {
  const viewports = deps.getViewports?.() ?? [deps.viewport3D];
  viewports.filter(isPerspectiveViewport).forEach((viewport) => {
    viewport.setFlyingCameraMoveSpeed(mouse.moveSpeed);
    viewport.setOrbitCameraSettings(mouse);
  });
}

/**
 * Applies view texture filter preferences to the shared content map cache.
 *
 * @param viewport3D Viewport providing WebGL max anisotropy.
 * @param view Current view settings snapshot.
 */
export function applyLayoutTextureFilterSettings(viewport3D: Viewport3D, view: ViewSettings): void {
  const maxAnisotropy = viewport3D.getRenderer().capabilities.getMaxAnisotropy();
  const policy = createTextureFilterPolicy(view.textureFilterMode, view.anisotropyPreference, maxAnisotropy);
  getTextureMapCache().setFilterPolicy(policy);
}

/**
 * Applies a pane count preference and updates visible viewport render sizes.
 *
 * @param viewportPaneLayout Pane layout controller.
 * @param resizeAll Resize callback after layout settles.
 * @param paneCount Number of viewport panes to display.
 * @param onVisibleSlots Optional callback with visible slot names for
 *   active-set sync.
 */
export function applyLayoutViewportPaneCount(
  viewportPaneLayout: ViewportPaneLayout,
  resizeAll: () => void,
  paneCount: 1 | 2 | 3 | 4,
  onVisibleSlots?: (slots: readonly string[]) => void,
): void {
  viewportPaneLayout.apply(paneCount);
  onVisibleSlots?.(viewportPaneLayout.getVisibleSlots());
  requestAnimationFrame(() => resizeAll());
}

/**
 * Opens the About dialog, creating it when missing.
 *
 * @param container Editor root element.
 * @param existingDialog Existing dialog instance or null.
 * @param statusBar Optional status bar for action text.
 * @returns Dialog instance that was shown.
 */
export function openLayoutAboutDialog(
  container: HTMLElement,
  existingDialog: AboutDialog | null,
  statusBar: StatusBar | null,
): AboutDialog {
  const aboutDialog = existingDialog ?? new AboutDialog(container);
  aboutDialog.show();
  statusBar?.setLastAction('About AI World Editor');
  return aboutDialog;
}
