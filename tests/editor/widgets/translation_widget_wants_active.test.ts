import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { EditorWindow } from '@/editor/window/editor_window.js';
import type { EditorServices } from '@/editor/window/editor_services.js';
import { TransformMode } from '@/types/transform_mode.js';
import { TranslationWidget } from '@/editor/widgets/translation_widget.js';
import { TranslateTool } from '@/editor/tools/translate_tool.js';
import { BoxSelectTool } from '@/editor/tools/box_select_tool.js';
import { RotateTool } from '@/editor/tools/rotate_tool.js';

/**
 * Builds stub editor services with optional permanent gizmo drag state.
 *
 * @param overrides Service overrides.
 * @returns Services implementation.
 */
function createStubServices(overrides: Partial<EditorServices> = {}): EditorServices {
  return {
    getTransformTargets: () => [new THREE.Object3D()],
    forEachSelectedObject: () => [],
    getSelectedCount: () => 1,
    getTransformPivot: () => new THREE.Vector3(),
    getSelectedSegmentsAveragePosition: () => ({ x: 100, y: 100 }),
    isSnapping: () => false,
    getGridSnap: () => 1,
    getAngleSnap: () => 15,
    screenPointToGrid: (x, y) => ({ x, y }),
    gridPointToScreen: (x, y) => ({ x, y }),
    getActiveCamera: () => new THREE.PerspectiveCamera(),
    getActivePickElement: () => document.createElement('div'),
    resolveInteractiveViewportAtClientPoint: () => null,
    resolveFirstInteractiveViewportInDocument: () => null,
    getInteractiveViewportPickElements: () => [],
    beginSingleUseDrag: () => true,
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

describe('TranslationWidget wantsActive (Shape Editor gizmo latch)', () => {
  it('latches wantsActive from gizmo state on mouse down and clears on global mouse up', () => {
    const editor = new EditorWindow();
    let permanentDrag = true;
    editor.setServices(
      createStubServices({
        probePermanentGizmoUnderPointer: () => permanentDrag,
        tryBeginPermanentGizmoDragFromEditorPointer: () => permanentDrag,
      }),
    );
    const widget = new TranslationWidget();
    editor.addWidget(widget);
    expect(widget.wantsActive).toBe(false);
    widget.onMouseDown(0);
    expect(widget.wantsActive).toBe(true);
    permanentDrag = false;
    widget.onGlobalMouseUp(0);
    expect(widget.wantsActive).toBe(false);
  });

  it('does not latch wantsActive when the gizmo is inactive on mouse down', () => {
    const editor = new EditorWindow();
    editor.setServices(
      createStubServices({
        probePermanentGizmoUnderPointer: () => false,
        tryBeginPermanentGizmoDragFromEditorPointer: () => false,
      }),
    );
    const widget = new TranslationWidget();
    editor.addWidget(widget);
    widget.onMouseDown(0);
    expect(widget.wantsActive).toBe(false);
  });

  it('isBusy only while active and wantsActive (Shape Editor IsBusy)', () => {
    const editor = new EditorWindow();
    editor.setServices(createStubServices());
    editor.validateTools();
    const widget = new TranslationWidget();
    editor.addWidget(widget);
    widget.latchWantsActiveFromGizmoState(true);
    expect(widget.isBusy()).toBe(false);
    expect(editor.trySwitchActiveEventReceiver(widget)).toBe(true);
    expect(widget.isBusy()).toBe(true);
    widget.clearWantsActiveLatch();
    expect(widget.isBusy()).toBe(false);
  });

  it('permanent gizmo handle drag blocks R from switching to single-use rotate', () => {
    const editor = new EditorWindow();
    let permanentDrag = true;
    const useToolSpy = vi.spyOn(editor, 'useTool');
    editor.setServices(
      createStubServices({
        isPermanentGizmoHandleDragActive: () => permanentDrag,
        handleModalKeyDown: () => false,
      }),
    );
    editor.validateTools();
    editor.userSwitchToTranslateTool();
    expect(editor.activeTool).toBeInstanceOf(TranslateTool);
    const event = new KeyboardEvent('keydown', { code: 'KeyR' });
    expect(editor.onKeyDown('KeyR', event)).toBe(true);
    expect(useToolSpy).not.toHaveBeenCalled();
    expect(editor.activeTool).toBeInstanceOf(TranslateTool);
    permanentDrag = false;
    editor.onPermanentGizmoHandleDragEnded();
  });

  it('onPermanentGizmoHandleDragBegan latches widget wantsActive and focuses it', () => {
    const editor = new EditorWindow();
    editor.setServices(createStubServices());
    editor.validateTools();
    editor.userSwitchToTranslateTool();
    const widgets = editor.getWidgets();
    expect(widgets.length).toBeGreaterThan(0);
    const widget = widgets[0];
    if (!widget) {
      throw new Error('expected translation widget');
    }
    editor.onPermanentGizmoHandleDragBegan();
    expect(widget.wantsActive).toBe(true);
    expect(editor.getActiveEventReceiver()).toBe(widget);
    expect(widget.isBusy()).toBe(true);
    editor.onPermanentGizmoHandleDragEnded();
    expect(widget.wantsActive).toBe(false);
    expect(editor.getActiveEventReceiver()).toBe(widget);
    expect(widget.isBusy()).toBe(false);
  });

  it('permanent gizmo handle drag blocks W permanent tool shortcut fallthrough', () => {
    const editor = new EditorWindow();
    let permanentDrag = true;
    editor.setServices(
      createStubServices({
        isPermanentGizmoHandleDragActive: () => permanentDrag,
      }),
    );
    editor.validateTools();
    expect(editor.activeTool).toBeInstanceOf(BoxSelectTool);
    const event = new KeyboardEvent('keydown', { code: 'KeyW' });
    expect(editor.onKeyDown('KeyW', event)).toBe(true);
    expect(editor.activeTool).toBeInstanceOf(BoxSelectTool);
    permanentDrag = false;
  });

  it('after permanent drag ends, R can launch single-use rotate again', () => {
    const editor = new EditorWindow();
    let permanentDrag = false;
    editor.setServices(
      createStubServices({
        isPermanentGizmoHandleDragActive: () => permanentDrag,
        beginSingleUseDrag: () => true,
      }),
    );
    editor.validateTools();
    const event = new KeyboardEvent('keydown', { code: 'KeyR' });
    expect(editor.onKeyDown('KeyR', event)).toBe(true);
    expect(editor.activeTool).toBeInstanceOf(RotateTool);
    expect(editor.activeTool?.isSingleUse).toBe(true);
  });
});
