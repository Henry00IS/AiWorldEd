import type { ControllerSelectionVisual } from '@/selection/object/controller_selection_visual.js';
import { PLAY_MODE_SESSION_KEY } from '@/tools/session/editor_tool_session_keys.js';
import type { PolicyEditorOverlay } from '@/tools/overlay/policy_editor_overlay.js';

/** Layout surfaces that must hide editor overlays while Play Mode is active. */
export interface LayoutPlayModeChromeDeps {
  /** Opt-in overlay policy for CAD rulers and transform gizmos. */
  editorOverlayPolicy: PolicyEditorOverlay;
  /** Object selection outlines, or null before visuals exist. */
  selectionVisualController: ControllerSelectionVisual | null | undefined;
  /** Viewport tool rail / options bar, or null before chrome exists. */
  toolsPaletteController: { setHoverChromeSuspended(suspended: boolean): void } | null | undefined;
  /** True while Edit Mode is live, used to restore selection chrome on exit. */
  isEditModeActive: () => boolean;
  /** Rebuilds gizmo and CAD ruler visibility after the policy changes. */
  refreshOverlays: () => void;
}

/**
 * Hides editor overlays, selection outlines, and hover-owned viewport tool
 * chrome for Play Mode, and restores them when play ends.
 *
 * @param isPlaying True when Play Mode has started.
 * @param deps Layout overlay surfaces.
 */
export function applyPlayModeEditorChrome(isPlaying: boolean, deps: LayoutPlayModeChromeDeps): void {
  if (isPlaying) {
    deps.editorOverlayPolicy.suppress(PLAY_MODE_SESSION_KEY);
    deps.toolsPaletteController?.setHoverChromeSuspended(true);
    deps.selectionVisualController?.setObjectSelectionChromeEnabled(false);
  } else {
    deps.editorOverlayPolicy.releaseSuppress(PLAY_MODE_SESSION_KEY);
    deps.toolsPaletteController?.setHoverChromeSuspended(false);
    deps.selectionVisualController?.setObjectSelectionChromeEnabled(!deps.isEditModeActive());
  }
  deps.refreshOverlays();
}
