import { describe, it, expect, vi } from 'vitest';
import { HandlerKeyboardShortcut } from '@/input/handler_keyboard_shortcut.js';
import { ManagerInput } from '@/input/manager_input.js';
import { EditorWindow } from '@/editor/window/editor_window.js';
import { Tool } from '@/editor/tools/tool.js';
import type { EditorServices } from '@/editor/window/editor_services.js';
import { TransformMode } from '@/types/transform_mode.js';
import * as THREE from 'three';

/** Select tool that consumes G. */
class SelectToolFake extends Tool {
  keyDownCodes: string[] = [];

  /** @inheritdoc */
  override onActivate(): void {}

  /** @inheritdoc */
  override onDeactivate(): void {}

  /** @inheritdoc */
  override onKeyDown(keyCode: string): boolean {
    this.keyDownCodes.push(keyCode);
    return keyCode === 'KeyG';
  }
}

/**
 * Builds stub services.
 *
 * @param globalHandler Global fallthrough.
 * @returns Services.
 */
function createServices(globalHandler: (event: KeyboardEvent) => boolean): EditorServices {
  return {
    getTransformTargets: () => [],
    forEachSelectedObject: () => [],
    getSelectedCount: () => 0,
    getTransformPivot: () => new THREE.Vector3(),
    getSelectedSegmentsAveragePosition: () => ({ x: 0, y: 0 }),
    isSnapping: () => false,
    getGridSnap: () => 1,
    getAngleSnap: () => 15,
    screenPointToGrid: (x, y) => ({ x, y }),
    gridPointToScreen: (x, y) => ({ x, y }),
    getActiveCamera: () => null,
    getActivePickElement: () => null,
    resolveInteractiveViewportAtClientPoint: () => null,
    resolveFirstInteractiveViewportInDocument: () => null,
    getInteractiveViewportPickElements: () => [],
    beginSingleUseDrag: () => false,
    applySingleUsePointerMove: () => {},
    isTransformDragActive: () => false,
    isPermanentGizmoHandleDragActive: () => false,
    handleModalKeyDown: () => false,
    commitActiveTransformDrag: () => {},
    cancelActiveTransformDrag: () => {},
    pinExclusiveViewportDomain: () => {},
    pinExclusiveViewport: () => {},
    clearExclusiveViewport: () => {},
    pickObjectStackAtClientPoint: () => [],
    clearObjectSelection: () => {},
    applyObjectClickSelectionAtClientPoint: () => {},
    applyObjectMarqueeSelection: () => {},
    tryBeginPermanentGizmoDragFromEditorPointer: () => false,
    probePermanentGizmoUnderPointer: () => false,
    updateBoundsHoverAtClientPoint: () => {},
    clearBoundsHoverAtClientPoint: () => {},
    enterFaceSelectionMode: () => {},
    leaveFaceSelectionMode: () => {},
    beginFaceSelectPointerDown: () => false,
    continueFaceSelectPointerMove: () => {},
    endFaceSelectPointerUp: () => {},
    isFaceSelectStrokeActive: () => false,
    hasFaceSelection: () => false,
    beginFaceUvTransform: () => false,
    updateFaceUvTransform: () => {},
    endFaceUvTransform: () => false,
    cancelFaceUvTransform: () => {},
    isFaceUvTransformActive: () => false,
    isGridAlignPickArmed: () => false,
    disarmGridAlignPick: () => undefined,
    tryGridAlignPickAtPointer: () => false,
    updateGridAlignHoverAtPointer: () => undefined,
    isEditModeActive: () => false,
    beginEditSelectPointerDown: () => false,
    setWidgetMode: () => {},
    getWidgetMode: () => TransformMode.BOUNDS,
    refreshGizmoPresentation: () => {},
    setStatusMessage: () => {},
    registerUndo: () => {},
    discardUndo: () => {},
    publishTransformDragVisualEnd: () => {},
    getLastPointerClientPosition: () => null,
    isShiftPressed: () => false,
    isCtrlPressed: () => false,
    isAltPressed: () => false,
    isModifierPressed: () => false,
    handleGlobalKeyDown: (_k, e) => globalHandler(e),
    isNavigationBlockingTools: () => false,
  };
}

describe('HandlerKeyboardShortcut tool router pipeline', () => {
  it('routes keydown through EditorWindow before global shortcuts', () => {
    const input = new ManagerInput();
    const handler = new HandlerKeyboardShortcut(input);
    const editor = new EditorWindow();
    const select = new SelectToolFake();
    const global = vi.fn(() => false);
    editor.setServices(createServices(global));
    editor.switchTool(select);
    handler.setOnToolEventRouterKeyDown((event) => {
      return editor.onKeyDown(event.code, event);
    });
    const event = new KeyboardEvent('keydown', { code: 'KeyG', key: 'g', bubbles: true });
    const result = editor.onKeyDown('KeyG', event);
    expect(result).toBe(true);
    expect(select.keyDownCodes).toContain('KeyG');
    expect(global).not.toHaveBeenCalled();
    input.dispose();
  });
});
