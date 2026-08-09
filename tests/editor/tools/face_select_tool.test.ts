import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { EditorWindow } from '@/editor/window/editor_window.js';
import { FaceSelectTool } from '@/editor/tools/face_select/face_select_tool.js';
import type { EditorServices } from '@/editor/window/editor_services.js';
import { TransformMode } from '@/types/transform_mode.js';

/**
 * Builds stub services for face select tool tests.
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

describe('FaceSelectTool editor integration', () => {
  it('SwitchTool enters face mode and does not call object click selection', () => {
    const enterFace = vi.fn();
    const applyClick = vi.fn();
    const editor = new EditorWindow();
    editor.setServices(
      createStubServices({
        enterFaceSelectionMode: enterFace,
        applyObjectClickSelectionAtClientPoint: applyClick,
      }),
    );
    editor.validateTools();
    editor.userSwitchToFaceSelectTool();
    expect(editor.activeTool).toBeInstanceOf(FaceSelectTool);
    expect(enterFace).toHaveBeenCalled();
    editor.activeTool?.onGlobalMouseUp(0);
    expect(applyClick).not.toHaveBeenCalled();
  });

  it('forwards mouse down to face select services with isShiftPressed/isCtrlPressed', () => {
    const beginFace = vi.fn(() => true);
    const editor = new EditorWindow();
    editor.setServices(
      createStubServices({
        beginFaceSelectPointerDown: beginFace,
        isFaceSelectStrokeActive: () => true,
        isGridAlignPickArmed: () => false,
        disarmGridAlignPick: () => undefined,
        tryGridAlignPickAtPointer: () => false,
        updateGridAlignHoverAtPointer: () => undefined,
        isShiftPressed: () => true,
        isCtrlPressed: () => false,
      }),
    );
    editor.validateTools();
    editor.userSwitchToFaceSelectTool();
    editor.lastPointerClientX = 11;
    editor.lastPointerClientY = 22;
    editor.activeTool?.onMouseDown(0);
    expect(beginFace).toHaveBeenCalledWith(11, 22, true, false);
    expect(editor.activeTool?.isBusy()).toBe(true);
  });

  it('forwards isCtrlPressed for subtractive face pick', () => {
    const beginFace = vi.fn(() => true);
    const editor = new EditorWindow();
    editor.setServices(
      createStubServices({
        beginFaceSelectPointerDown: beginFace,
        isCtrlPressed: () => true,
      }),
    );
    editor.validateTools();
    editor.userSwitchToFaceSelectTool();
    editor.lastPointerClientX = 3;
    editor.lastPointerClientY = 4;
    editor.activeTool?.onMouseDown(0);
    expect(beginFace).toHaveBeenCalledWith(3, 4, false, true);
  });

  it('leaving face tool restores object mode services', () => {
    const leaveFace = vi.fn();
    const editor = new EditorWindow();
    editor.setServices(
      createStubServices({
        leaveFaceSelectionMode: leaveFace,
      }),
    );
    editor.validateTools();
    editor.userSwitchToFaceSelectTool();
    editor.userSwitchToBoxSelectTool();
    expect(leaveFace).toHaveBeenCalled();
  });

  it('keeps face mode when launching single-use UV move with G', () => {
    const leaveFace = vi.fn();
    let uvSessionActive = false;
    const beginUv = vi.fn(() => {
      uvSessionActive = true;
      return true;
    });
    const updateUv = vi.fn();
    const camera = new THREE.PerspectiveCamera();
    const pickElement = document.createElement('div');
    const editor = new EditorWindow();
    editor.setServices(
      createStubServices({
        leaveFaceSelectionMode: leaveFace,
        hasFaceSelection: () => true,
        beginFaceUvTransform: beginUv,
        updateFaceUvTransform: updateUv,
        isFaceUvTransformActive: () => uvSessionActive,
        isFaceSelectStrokeActive: () => uvSessionActive,
        getActiveCamera: () => camera,
        getActivePickElement: () => pickElement,
        resolveInteractiveViewportAtClientPoint: () => ({ camera, pickElement }),
        resolveFirstInteractiveViewportInDocument: () => ({ camera, pickElement }),
      }),
    );
    editor.validateTools();
    editor.userSwitchToFaceSelectTool();
    editor.hasLastPointerClient = true;
    editor.lastPointerClientX = 40;
    editor.lastPointerClientY = 50;
    const faceTool = editor.getFaceSelectTool();
    const handled = faceTool.onKeyDown('KeyG');
    expect(handled).toBe(true);
    expect(leaveFace).not.toHaveBeenCalled();
    expect(beginUv).toHaveBeenCalled();
    expect(editor.activeTool?.isSingleUse).toBe(true);
    expect(editor.activeTool?.isBusy()).toBe(true);
    expect(faceTool.isBusy()).toBe(false);
    expect(editor.getActiveEventReceiver()).toBe(editor.activeTool);
    editor.lastPointerClientX = 80;
    editor.lastPointerClientY = 90;
    editor.onMouseMove(new THREE.Vector2(1, 1), new THREE.Vector2(0, 0));
    expect(updateUv).toHaveBeenCalledWith(80, 90, camera, pickElement, false);
  });
});
