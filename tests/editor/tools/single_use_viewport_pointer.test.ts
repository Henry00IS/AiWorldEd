import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { EditorWindow } from '@/editor/window/editor_window.js';
import type { EditorServices } from '@/editor/window/editor_services.js';
import { TransformMode } from '@/types/transform_mode.js';
import {
  isSingleUsePointerCompatibleWithPinnedPick,
  resolveSingleUseViewportPointerContext,
} from '@/editor/tools/single_use_viewport_pointer.js';

/**
 * Builds a minimal services stub for pointer-context resolution tests.
 *
 * @param overrides Partial service overrides.
 * @returns Services implementation.
 */
function createServices(overrides: Partial<EditorServices> = {}): EditorServices {
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

describe('single_use_viewport_pointer', () => {
  it('prefers the document-scoped interactive pane over the active main pane', () => {
    const editor = new EditorWindow();
    const detachedCamera = new THREE.PerspectiveCamera();
    const detachedPick = document.createElement('div');
    const mainCamera = new THREE.PerspectiveCamera();
    const mainPick = document.createElement('div');
    editor.lastPointerOwnerDocument = document;
    editor.lastPointerClientX = 12;
    editor.lastPointerClientY = 34;
    editor.hasLastPointerClient = true;
    const services = createServices({
      getActiveCamera: () => mainCamera,
      getActivePickElement: () => mainPick,
      resolveInteractiveViewportAtClientPoint: (_x, _y, ownerDocument) => {
        if (ownerDocument === document) {
          return { camera: detachedCamera, pickElement: detachedPick };
        }
        return null;
      },
    });
    const context = resolveSingleUseViewportPointerContext(editor, services);
    expect(context?.camera).toBe(detachedCamera);
    expect(context?.pickElement).toBe(detachedPick);
    expect(context?.clientX).toBe(12);
    expect(context?.clientY).toBe(34);
  });

  it('falls back to the active pane when document resolution finds nothing', () => {
    const editor = new EditorWindow();
    const mainCamera = new THREE.PerspectiveCamera();
    const mainPick = document.createElement('div');
    editor.hasLastPointerClient = true;
    editor.lastPointerClientX = 1;
    editor.lastPointerClientY = 2;
    const services = createServices({
      getActiveCamera: () => mainCamera,
      getActivePickElement: () => mainPick,
    });
    const context = resolveSingleUseViewportPointerContext(editor, services);
    expect(context?.camera).toBe(mainCamera);
    expect(context?.pickElement).toBe(mainPick);
  });

  it('rejects cross-document pointer samples against a pinned pick element', () => {
    const editor = new EditorWindow();
    const pinned = document.createElement('div');
    const foreignDocument = { body: document.createElement('div') } as unknown as Document;
    editor.lastPointerOwnerDocument = foreignDocument;
    expect(isSingleUsePointerCompatibleWithPinnedPick(editor, pinned)).toBe(false);
    editor.lastPointerOwnerDocument = document;
    expect(isSingleUsePointerCompatibleWithPinnedPick(editor, pinned)).toBe(true);
  });
});
