import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EditorWindow } from '@/editor/window/editor_window.js';
import { EditorInputBridge } from '@/editor/window/editor_input_bridge.js';
import type { EditorServices } from '@/editor/window/editor_services.js';
import * as THREE from 'three';
import { TransformMode } from '@/types/transform_mode.js';

/**
 * Builds minimal services that record multi-select modifier queries from tools.
 *
 * @param onClickSelection Called when object click selection runs.
 * @returns Stub services.
 */
function createServices(
  onClickSelection: (clientX: number, clientY: number, additive: boolean, toggle: boolean) => void,
): EditorServices {
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
    applyObjectClickSelectionAtClientPoint: onClickSelection,
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
  };
}

/**
 * Builds fixed content bounds for hit tests.
 *
 * @param element Element to mock.
 * @param size Square size in CSS pixels.
 */
function mockContentBounds(element: HTMLElement, size: number): void {
  element.getBoundingClientRect = () =>
    ({
      left: 0,
      top: 0,
      right: size,
      bottom: size,
      width: size,
      height: size,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
}

describe('EditorInputBridge modifier flags from detached pointers', () => {
  let host: HTMLElement;
  let viewportContent: HTMLElement;
  let editor: EditorWindow;
  let bridge: EditorInputBridge;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    viewportContent = document.createElement('div');
    document.body.appendChild(viewportContent);
    mockContentBounds(viewportContent, 400);
    editor = new EditorWindow();
    bridge = new EditorInputBridge(editor);
  });

  afterEach(() => {
    bridge.uninstall();
    host.remove();
    viewportContent.remove();
  });

  it('latches Shift from a detached pointerdown and keeps it through global mouse up selection', () => {
    const clickSelection = vi.fn();
    editor.setServices(createServices(clickSelection));
    editor.validateTools();
    editor.userSwitchToBoundsTool();
    bridge.install(host);
    const detachedDocument = document.implementation.createHTMLDocument('detached-viewport');
    const detachedViewport = detachedDocument.createElement('div');
    detachedDocument.body.appendChild(detachedViewport);
    mockContentBounds(detachedViewport, 200);
    bridge.setExclusiveViewportRoots([viewportContent, detachedViewport]);
    expect(editor.isShiftPressed).toBe(false);
    detachedDocument.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        clientX: 40,
        clientY: 50,
        button: 0,
        buttons: 1,
        shiftKey: true,
      }),
    );
    expect(editor.isShiftPressed).toBe(true);
    detachedDocument.dispatchEvent(
      new PointerEvent('pointerup', {
        bubbles: true,
        cancelable: true,
        clientX: 40,
        clientY: 50,
        button: 0,
        buttons: 0,
        shiftKey: true,
      }),
    );
    expect(editor.isShiftPressed).toBe(true);
    expect(clickSelection).toHaveBeenCalled();
    const call = clickSelection.mock.calls[0];
    expect(call?.[2]).toBe(true);
    expect(call?.[3]).toBe(false);
  });

  it('latches Ctrl from a detached pointerup for toggle multi-select', () => {
    const clickSelection = vi.fn();
    editor.setServices(createServices(clickSelection));
    editor.validateTools();
    editor.userSwitchToBoundsTool();
    bridge.install(host);
    const detachedDocument = document.implementation.createHTMLDocument('detached-viewport');
    const detachedViewport = detachedDocument.createElement('div');
    detachedDocument.body.appendChild(detachedViewport);
    mockContentBounds(detachedViewport, 200);
    bridge.setExclusiveViewportRoots([viewportContent, detachedViewport]);
    detachedDocument.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        clientX: 40,
        clientY: 50,
        button: 0,
        buttons: 1,
        ctrlKey: true,
      }),
    );
    detachedDocument.dispatchEvent(
      new PointerEvent('pointerup', {
        bubbles: true,
        cancelable: true,
        clientX: 40,
        clientY: 50,
        button: 0,
        buttons: 0,
        ctrlKey: true,
      }),
    );
    expect(editor.isCtrlPressed).toBe(true);
    const call = clickSelection.mock.calls[0];
    expect(call?.[2]).toBe(false);
    expect(call?.[3]).toBe(true);
  });
});
