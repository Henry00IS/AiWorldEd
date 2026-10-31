import { describe, expect, it } from 'vitest';
import { EditorOverlayId } from '@/tools/overlay/editor_overlay_id.js';
import { PolicyEditorOverlay } from '@/tools/overlay/policy_editor_overlay.js';
import {
  ControllerViewportToolChrome,
  type ControllerViewportToolChromeDependencies,
} from '@/tools/chrome/controller/controller_viewport_tool_chrome.js';
import { ViewportToolOptionsBar } from '@/tools/chrome/options/viewport_tool_options_bar.js';
import { EditorToolId } from '@/types/editor_tool_id.js';
import { EditorInteractionMode } from '@/types/editor_interaction_mode.js';
import { hexToRgb } from '@/utils/utils_color.js';
import { Theme } from '@/theme.js';

describe('snap align chrome', () => {
  it('releases gizmo overlays while an align tool is armed and restores them after', () => {
    const policy = new PolicyEditorOverlay();
    const controller = new ControllerViewportToolChrome({
      editorOverlayPolicy: policy,
      showStatusMessage: () => undefined,
      onPrimaryToolChanged: () => undefined,
    } as unknown as ControllerViewportToolChromeDependencies);
    expect(policy.isAllowed(EditorOverlayId.TRANSFORM_GIZMOS)).toBe(true);
    expect(policy.isAllowed(EditorOverlayId.CAD_BOUNDS_RULERS)).toBe(true);
    controller.beginSnapAlignChrome('hinge');
    expect(policy.isAllowed(EditorOverlayId.TRANSFORM_GIZMOS)).toBe(false);
    expect(policy.isAllowed(EditorOverlayId.CAD_BOUNDS_RULERS)).toBe(false);
    controller.endSnapAlignChrome();
    expect(policy.isAllowed(EditorOverlayId.TRANSFORM_GIZMOS)).toBe(true);
    expect(policy.isAllowed(EditorOverlayId.CAD_BOUNDS_RULERS)).toBe(true);
  });

  it('highlights the armed options button in the selection color', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const bar = new ViewportToolOptionsBar(host, {
      onTransformMode: () => undefined,
      onFlipClipPlane: () => undefined,
      onCommitClip: () => undefined,
      onCommitSplit: () => undefined,
      onOpenUvEditor: () => undefined,
      onExtrudeFaces: () => undefined,
      onGridReset: () => undefined,
      onGridAlignToFace: () => undefined,
      onGridAlignAxis: () => undefined,
      onGridOriginVertex: () => undefined,
      onCameraReset: () => undefined,
      onCameraAlignToFace: () => undefined,
      onInteractionMode: (_mode: EditorInteractionMode) => undefined,
      onComponentMode: () => undefined,
    });
    bar.setActiveSnapAlign('hinge');
    const orange = hexToRgb(Theme.selectionColor);
    expect(buttonLabeled(bar, 'Align').style.border).toContain(orange);
    bar.setActiveTool(EditorToolId.OBJECT);
    expect(buttonLabeled(bar, 'Align').style.border).toContain(orange);
    bar.setActiveSnapAlign('none');
    expect(buttonLabeled(bar, 'Align').style.border).not.toContain(orange);
    bar.setActiveInteractionMode(EditorInteractionMode.EDIT_MODE);
    expect(findButtonLabeled(bar, 'Align')).toBeUndefined();
    expect(findButtonLabeled(bar, 'Face Align')).toBeUndefined();
    expect(findButtonLabeled(bar, 'Hinge')).toBeUndefined();
    expect(findButtonLabeled(bar, 'Seat')).toBeUndefined();
    bar.dispose();
    host.remove();
  });
});

/**
 * Finds a labeled options button.
 *
 * @param bar Options bar.
 * @param label Accessible or visible label.
 * @returns Button.
 */
function buttonLabeled(bar: ViewportToolOptionsBar, label: string): HTMLButtonElement {
  const button = findButtonLabeled(bar, label);
  if (!button) {
    throw new Error(`missing ${label} button`);
  }
  return button;
}

/**
 * Finds a labeled options button when it is mounted.
 *
 * @param bar Options bar.
 * @param label Accessible or visible label.
 * @returns Button, or undefined when the bar does not show it.
 */
function findButtonLabeled(bar: ViewportToolOptionsBar, label: string): HTMLButtonElement | undefined {
  const buttons = bar.getElement().querySelectorAll('button');
  for (const button of buttons) {
    if (button.getAttribute('aria-label') === label || button.textContent === label) {
      return button;
    }
  }
  return undefined;
}
