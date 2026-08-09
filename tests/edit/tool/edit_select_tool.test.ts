import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { EditorWindow } from '@/editor/window/editor_window.js';
import { EditSelectTool } from '@/edit/tool/edit_select_tool.js';
import { TranslateTool } from '@/editor/tools/translate_tool.js';
import type { EditorServices } from '@/editor/window/editor_services.js';
import { TransformMode } from '@/types/transform_mode.js';

/**
 * Builds stub services for Edit Select tool tests.
 *
 * @param overrides Partial overrides.
 * @returns Services.
 */
function createStubServices(overrides: Partial<EditorServices> = {}): EditorServices {
  let widgetMode = TransformMode.BOUNDS;
  return {
    getTransformTargets: () => [],
    forEachSelectedObject: () => [],
    getSelectedCount: () => 1,
    getTransformPivot: () => new THREE.Vector3(),
    getSelectedSegmentsAveragePosition: () => ({ x: 10, y: 20 }),
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
    isEditModeActive: () => true,
    beginEditSelectPointerDown: vi.fn(() => true),
    setWidgetMode: (mode) => {
      widgetMode = mode;
    },
    getWidgetMode: () => widgetMode,
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
    handleGlobalKeyDown: () => false,
    isNavigationBlockingTools: () => false,
    ...overrides,
  };
}

describe('EditSelectTool', () => {
  it('picks components on mouse down while remaining the active tool', () => {
    const beginPick = vi.fn(() => true);
    const editor = new EditorWindow();
    const services = createStubServices({
      beginEditSelectPointerDown: beginPick,
      isEditModeActive: () => true,
    });
    editor.setServices(services);
    editor.userSwitchToEditSelectTool();
    expect(editor.activeTool).toBeInstanceOf(EditSelectTool);
    editor.lastPointerClientX = 42;
    editor.lastPointerClientY = 84;
    editor.activeTool?.onMouseDown(0);
    expect(beginPick).toHaveBeenCalledWith(42, 84, false, false, null);
    expect(editor.activeTool).toBeInstanceOf(EditSelectTool);
  });

  it('stays on EditSelectTool without hosting widgets when mode is Bounds (off)', () => {
    const editor = new EditorWindow();
    editor.setServices(createStubServices({ isEditModeActive: () => true }));
    editor.userSwitchToEditSelectTool();
    editor.activeTool?.onRender();
    expect(editor.activeTool).toBeInstanceOf(EditSelectTool);
    expect(editor.activeTool).not.toBeInstanceOf(TranslateTool);
    expect(editor.getWidgets().length).toBe(0);
  });
});
