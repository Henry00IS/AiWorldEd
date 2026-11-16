import { describe, expect, it, vi } from 'vitest';
import { applyPlayModeEditorChrome } from '@/layout/setup/layout_play_mode_chrome.js';
import { EditorOverlayId } from '@/tools/overlay/editor_overlay_id.js';
import { PolicyEditorOverlay } from '@/tools/overlay/policy_editor_overlay.js';
import { OBJECT_TOOL_SESSION_KEY } from '@/tools/session/editor_tool_session_keys.js';

describe('applyPlayModeEditorChrome', () => {
  it('hides bounds rulers, gizmos, selection outlines, and viewport tool chrome in play mode', () => {
    const policy = new PolicyEditorOverlay();
    policy.enable(EditorOverlayId.CAD_BOUNDS_RULERS, OBJECT_TOOL_SESSION_KEY);
    policy.enable(EditorOverlayId.TRANSFORM_GIZMOS, OBJECT_TOOL_SESSION_KEY);
    const selection = { setObjectSelectionChromeEnabled: vi.fn() };
    const tools = { setHoverChromeSuspended: vi.fn() };
    const refreshOverlays = vi.fn();

    applyPlayModeEditorChrome(true, {
      editorOverlayPolicy: policy,
      selectionVisualController: selection as never,
      toolsPaletteController: tools,
      isEditModeActive: () => false,
      refreshOverlays,
    });

    expect(policy.isAllowed(EditorOverlayId.CAD_BOUNDS_RULERS)).toBe(false);
    expect(policy.isAllowed(EditorOverlayId.TRANSFORM_GIZMOS)).toBe(false);
    expect(selection.setObjectSelectionChromeEnabled).toHaveBeenCalledWith(false);
    expect(tools.setHoverChromeSuspended).toHaveBeenCalledWith(true);
    expect(refreshOverlays).toHaveBeenCalledTimes(1);

    applyPlayModeEditorChrome(false, {
      editorOverlayPolicy: policy,
      selectionVisualController: selection as never,
      toolsPaletteController: tools,
      isEditModeActive: () => false,
      refreshOverlays,
    });

    expect(policy.isAllowed(EditorOverlayId.CAD_BOUNDS_RULERS)).toBe(true);
    expect(policy.isAllowed(EditorOverlayId.TRANSFORM_GIZMOS)).toBe(true);
    expect(selection.setObjectSelectionChromeEnabled).toHaveBeenCalledWith(true);
    expect(tools.setHoverChromeSuspended).toHaveBeenCalledWith(false);
    expect(refreshOverlays).toHaveBeenCalledTimes(2);
  });
});
