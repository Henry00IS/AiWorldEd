import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { EditorWindow } from '@/editor/window/editor_window.js';
import { EditSelectTool } from '@/edit/tool/edit_select_tool.js';
import type { EditorServices } from '@/editor/window/editor_services.js';
import { TransformMode } from '@/types/transform_mode.js';
import { TranslationWidget } from '@/editor/widgets/translation_widget.js';
import { RotationWidget } from '@/editor/widgets/rotation_widget.js';

/**
 * Builds stub services with a mutable widget mode.
 *
 * @param initialMode Initial transform mode.
 * @returns Services and mode accessor.
 */
function createStubServices(initialMode: TransformMode): {
  services: EditorServices;
  getMode: () => TransformMode;
  setMode: (mode: TransformMode) => void;
} {
  let widgetMode = initialMode;
  const services: EditorServices = {
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
  };
  return {
    services,
    getMode: () => widgetMode,
    setMode: (mode) => {
      widgetMode = mode;
    },
  };
}

describe('EditSelectTool permanent widget toggle', () => {
  it('hosts no permanent widget when mode is Bounds (widgets off)', () => {
    const { services } = createStubServices(TransformMode.BOUNDS);
    const editor = new EditorWindow();
    editor.setServices(services);
    editor.userSwitchToEditSelectTool();
    expect(editor.activeTool).toBeInstanceOf(EditSelectTool);
    editor.activeTool?.onRender();
    expect(editor.getWidgets().some((widget) => widget instanceof TranslationWidget)).toBe(false);
    expect(editor.getWidgets().some((widget) => widget instanceof RotationWidget)).toBe(false);
  });

  it('hosts translate widget when mode is Translate and components are selected', () => {
    const { services, setMode } = createStubServices(TransformMode.BOUNDS);
    const editor = new EditorWindow();
    editor.setServices(services);
    editor.userSwitchToEditSelectTool();
    setMode(TransformMode.TRANSLATE);
    Object.defineProperty(editor, 'selectedSegmentsCount', { get: () => 1 });
    Object.defineProperty(editor, 'selectedSegmentsAveragePosition', {
      get: () => new THREE.Vector3(1, 2, 3),
    });
    editor.activeTool?.onRender();
    expect(editor.getWidgets().some((widget) => widget instanceof TranslationWidget)).toBe(true);
  });

  it('clears permanent widgets when mode returns to Bounds', () => {
    const { services, setMode } = createStubServices(TransformMode.BOUNDS);
    const editor = new EditorWindow();
    editor.setServices(services);
    editor.userSwitchToEditSelectTool();
    Object.defineProperty(editor, 'selectedSegmentsCount', { get: () => 1 });
    Object.defineProperty(editor, 'selectedSegmentsAveragePosition', {
      get: () => new THREE.Vector3(0, 0, 0),
    });
    editor.activeTool?.onRender();
    expect(editor.getWidgets()).toHaveLength(0);
    setMode(TransformMode.TRANSLATE);
    editor.activeTool?.onRender();
    expect(editor.getWidgets().some((widget) => widget instanceof TranslationWidget)).toBe(true);
    setMode(TransformMode.BOUNDS);
    editor.activeTool?.onRender();
    expect(editor.getWidgets()).toHaveLength(0);
  });
});
