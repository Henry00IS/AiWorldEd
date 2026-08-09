import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { EditorWindow } from '@/editor/window/editor_window.js';
import { BoxSelectTool } from '@/editor/tools/box_select_tool.js';
import { BoundsTool } from '@/editor/tools/bounds_tool.js';
import type { EditorServices } from '@/editor/window/editor_services.js';
import { TransformMode } from '@/types/transform_mode.js';

/**
 * Builds stub services for box select selection tests.
 *
 * @param overrides Partial overrides.
 * @returns Services.
 */
function createStubServices(overrides: Partial<EditorServices> = {}): EditorServices {
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
    handleGlobalKeyDown: () => false,
    isNavigationBlockingTools: () => false,
    ...overrides,
  };
}

describe('BoxSelectTool / BoundsTool (Shape Editor selection)', () => {
  it('default permanent tool is BoundsTool with select + bounds widget', () => {
    const editor = new EditorWindow();
    editor.setServices(createStubServices());
    editor.validateTools();
    expect(editor.activeTool).toBeInstanceOf(BoundsTool);
  });

  it('applies click selection on global mouse up only', () => {
    const applyClick = vi.fn();
    const editor = new EditorWindow();
    editor.setServices(
      createStubServices({
        applyObjectClickSelectionAtClientPoint: applyClick,
      }),
    );
    editor.validateTools();
    const box = new BoxSelectTool();
    box.editor = editor;
    editor.lastPointerClientX = 40;
    editor.lastPointerClientY = 50;
    box.onMouseDown(0);
    expect(applyClick).not.toHaveBeenCalled();
    box.onGlobalMouseUp(0);
    expect(applyClick).toHaveBeenCalledWith(40, 50, false, false);
  });

  it('selects when BoundsTool receives global mouse up and gizmo did not take the press', () => {
    const applyClick = vi.fn();
    const editor = new EditorWindow();
    editor.setServices(
      createStubServices({
        applyObjectClickSelectionAtClientPoint: applyClick,
        probePermanentGizmoUnderPointer: () => false,
        tryBeginPermanentGizmoDragFromEditorPointer: () => false,
        getSelectedCount: () => 0,
      }),
    );
    editor.validateTools();
    editor.userSwitchToBoundsTool();
    editor.lastPointerClientX = 10;
    editor.lastPointerClientY = 20;
    editor.onMouseDown(0);
    editor.onGlobalMouseUp(0);
    expect(applyClick).toHaveBeenCalledWith(10, 20, false, false);
  });

  it('restores tool focus without selecting when widget had focus without wantsActive (Shape Editor)', () => {
    const applyClick = vi.fn();
    const editor = new EditorWindow();
    editor.setServices(
      createStubServices({
        applyObjectClickSelectionAtClientPoint: applyClick,
        probePermanentGizmoUnderPointer: () => false,
        getSelectedCount: () => 1,
      }),
    );
    editor.validateTools();
    editor.userSwitchToBoundsTool();
    const widgets = editor.getWidgets();
    const boundsWidget = widgets[0];
    expect(boundsWidget).toBeDefined();
    editor.trySwitchActiveEventReceiver(boundsWidget!);
    expect(editor.activeEventReceiverIsWidget).toBe(true);
    editor.lastPointerClientX = 5;
    editor.lastPointerClientY = 6;
    editor.onGlobalMouseUp(0);
    expect(editor.activeEventReceiverIsTool).toBe(true);
    expect(applyClick).not.toHaveBeenCalled();
  });

  it('selects on the same click that focus returns from widget to tool via OnMouseDown', () => {
    const applyClick = vi.fn();
    const editor = new EditorWindow();
    editor.setServices(
      createStubServices({
        applyObjectClickSelectionAtClientPoint: applyClick,
        probePermanentGizmoUnderPointer: () => false,
        tryBeginPermanentGizmoDragFromEditorPointer: () => false,
        getSelectedCount: () => 1,
      }),
    );
    editor.validateTools();
    editor.userSwitchToBoundsTool();
    const widgets = editor.getWidgets();
    const boundsWidget = widgets[0];
    expect(boundsWidget).toBeDefined();
    editor.trySwitchActiveEventReceiver(boundsWidget!);
    expect(editor.activeEventReceiverIsWidget).toBe(true);
    editor.lastPointerClientX = 7;
    editor.lastPointerClientY = 8;
    editor.onMouseDown(0);
    expect(editor.activeEventReceiverIsTool).toBe(true);
    editor.onGlobalMouseUp(0);
    expect(applyClick).toHaveBeenCalledWith(7, 8, false, false);
  });

  it('does not select on GlobalMouseUp while a widget is busy then restores tool on MouseUp', () => {
    const applyClick = vi.fn();
    const editor = new EditorWindow();
    editor.setServices(
      createStubServices({
        applyObjectClickSelectionAtClientPoint: applyClick,
        probePermanentGizmoUnderPointer: () => true,
        tryBeginPermanentGizmoDragFromEditorPointer: () => true,
        getSelectedCount: () => 1,
      }),
    );
    editor.validateTools();
    editor.userSwitchToBoundsTool();
    editor.lastPointerClientX = 1;
    editor.lastPointerClientY = 2;
    editor.onMouseDown(0);
    expect(editor.activeEventReceiverIsWidget).toBe(true);
    const widget = editor.getActiveEventReceiver();
    expect(widget.isBusy()).toBe(true);
    editor.onGlobalMouseUp(0);
    expect(applyClick).not.toHaveBeenCalled();
    expect(widget.isBusy()).toBe(false);
    editor.onMouseUp(0);
    expect(editor.activeEventReceiverIsTool).toBe(true);
    expect(applyClick).not.toHaveBeenCalled();
  });
});
