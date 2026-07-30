import { AboutDialog } from '../../ui/about/about_dialog.js';
import { SettingsDialog } from '../../ui/settings/settings_dialog.js';
import { EditorSettingsStore } from '../../settings/editor_settings_store.js';
import { SettingsApplicator } from '../../settings/settings_applicator.js';
import { performEditorFactoryReset } from '../../settings/clear_editor_storage.js';
import type { EditorSettingsSnapshot, GameProfile, ViewSettings } from '../../settings/settings_types.js';
import { getTextureMapCache } from '../../texture/library/texture_map_cache.js';
import { createTextureFilterPolicy } from '../../texture/library/texture_filter_policy.js';
import type { Viewport3D } from '../../viewports/viewport_3d.js';
import type { ViewportPaneLayout } from './viewport_pane_layout.js';
import type { StatusBar } from '../../ui/status_bar.js';
import type { Toolbar } from '../../ui/toolbar.js';
import type * as THREE from 'three';

/** Result of creating the settings store, applicator, and dialog. */
export interface LayoutSettingsSystemParts {
  settingsStore: EditorSettingsStore;
  settingsApplicator: SettingsApplicator;
  settingsDialog: SettingsDialog;
  settingsUnsubscribe: () => void;
}

/** Host that can report WebGL max anisotropy for texture filter policy. */
export interface LayoutSettingsRendererHost {
  getRenderer(): THREE.WebGLRenderer;
}

/** Dependencies required to create and wire the settings subsystem. */
export interface LayoutSettingsCreateDeps {
  container: HTMLElement;
  /**
   * Live perspective viewport when one exists. Read through a getter so
   * orthographic-only layouts (e.g. a single remaining 2D pane) do not crash
   * settings startup.
   */
  getPerspectiveViewport: () => Viewport3D | null;
  /**
   * Any live viewport that can report renderer capabilities for texture
   * filtering (2D or 3D).
   */
  getRendererHost: () => LayoutSettingsRendererHost | null;
  viewportPaneLayout: ViewportPaneLayout;
  toolbar: Toolbar;
  resizeAll: () => void;
  onVisibleSlots?: (slots: readonly string[]) => void;
  /** Optional workspace-driven pane count migration (preferred over raw grid). */
  onViewportPaneCount?: (paneCount: 1 | 2 | 3 | 4) => void;
  /** Applies the active profile to coordinate presentation consumers. */
  onActiveGameProfile?: (profile: GameProfile | null) => void;
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
    deps.onViewportPaneCount,
  );
  applyFlyingCameraMoveSpeed(deps.getPerspectiveViewport(), settingsStore.getMouseSettings().moveSpeed);
  applyLayoutTextureFilterSettings(deps.getRendererHost(), settingsStore.getViewSettings());
  applyActiveGameProfile(deps, settingsStore.getSnapshot());
  const settingsUnsubscribe = settingsStore.subscribe((snapshot) => {
    settingsApplicator.applySnapshot(snapshot);
    deps.toolbar.setButtonLabelsEnabled(snapshot.view.toolbarButtonLabels);
    applyLayoutViewportPaneCount(
      deps.viewportPaneLayout,
      deps.resizeAll,
      snapshot.view.viewportPaneCount,
      deps.onVisibleSlots,
      deps.onViewportPaneCount,
    );
    applyFlyingCameraMoveSpeed(deps.getPerspectiveViewport(), snapshot.mouse.moveSpeed);
    applyLayoutTextureFilterSettings(deps.getRendererHost(), snapshot.view);
    applyActiveGameProfile(deps, snapshot);
  });
  const settingsDialog = new SettingsDialog(deps.container, settingsStore, {
    onResetAllSettings: () => {
      runEditorFactoryResetAndReload();
    },
  });
  return { settingsStore, settingsApplicator, settingsDialog, settingsUnsubscribe };
}

/**
 * Resolves and applies the active game profile from a settings snapshot.
 *
 * @param deps Settings-system dependencies.
 * @param snapshot Latest settings snapshot.
 */
function applyActiveGameProfile(deps: LayoutSettingsCreateDeps, snapshot: EditorSettingsSnapshot): void {
  if (!deps.onActiveGameProfile) return;
  const active = snapshot.gameProfiles.find((profile) => profile.id === snapshot.activeGameProfileId) ?? null;
  deps.onActiveGameProfile(active);
}

/**
 * Wipes every editor-owned preference (settings, workspaces, profiles, etc.),
 * blocks unload re-persistence, and reloads so code defaults take effect.
 * Nothing from the previous session is allowed to write back.
 */
export function runEditorFactoryResetAndReload(): void {
  performEditorFactoryReset();
  window.location.reload();
}

/**
 * Applies flying-camera move speed when a perspective viewport is present.
 *
 * @param viewport Perspective viewport or null.
 * @param moveSpeed Move speed from mouse settings.
 */
export function applyFlyingCameraMoveSpeed(viewport: Viewport3D | null, moveSpeed: number): void {
  viewport?.setFlyingCameraMoveSpeed(moveSpeed);
}

/**
 * Applies view texture filter preferences to the shared content map cache.
 *
 * @param rendererHost Viewport providing WebGL max anisotropy, or null.
 * @param view Current view settings snapshot.
 */
export function applyLayoutTextureFilterSettings(
  rendererHost: LayoutSettingsRendererHost | null,
  view: ViewSettings,
): void {
  if (!rendererHost) return;
  const maxAnisotropy = rendererHost.getRenderer().capabilities.getMaxAnisotropy();
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
 * @param onViewportPaneCount Optional workspace-driven pane count migration.
 */
export function applyLayoutViewportPaneCount(
  viewportPaneLayout: ViewportPaneLayout,
  resizeAll: () => void,
  paneCount: 1 | 2 | 3 | 4,
  onVisibleSlots?: (slots: readonly string[]) => void,
  onViewportPaneCount?: (paneCount: 1 | 2 | 3 | 4) => void,
): void {
  if (onViewportPaneCount) {
    onViewportPaneCount(paneCount);
  } else {
    viewportPaneLayout.apply(paneCount);
    onVisibleSlots?.(viewportPaneLayout.getVisibleSlots());
  }
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
