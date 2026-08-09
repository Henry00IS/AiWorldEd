import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { EditorWindow } from '@/editor/window/editor_window.js';
import { ClipTool } from '@/editor/tools/clip_tool.js';
import { BoundsTool } from '@/editor/tools/bounds_tool.js';
import { ToolClipPlane } from '@/tools/clip_plane/tool_clip_plane.js';
import type { HandlerClipPlane } from '@/tools/clip_plane/handler_clip_plane.js';
import type { EditorServices } from '@/editor/window/editor_services.js';
import { TransformMode } from '@/types/transform_mode.js';

/**
 * Builds stub services for clip tool tests.
 *
 * @param overrides Partial overrides.
 * @returns Services.
 */
function createStubServices(overrides: Partial<EditorServices> = {}): EditorServices {
  return {
    getTransformTargets: () => [],
    forEachSelectedObject: () => [],
    getSelectedCount: () => 1,
    getTransformPivot: () => new THREE.Vector3(),
    getSelectedSegmentsAveragePosition: () => ({ x: 0, y: 0 }),
    isSnapping: () => false,
    getGridSnap: () => 1,
    getAngleSnap: () => 15,
    screenPointToGrid: (x, y) => ({ x, y }),
    gridPointToScreen: (x, y) => ({ x, y }),
    getActiveCamera: () => new THREE.PerspectiveCamera(),
    getActivePickElement: () => document.createElement('div'),
    resolveInteractiveViewportAtClientPoint: (_clientX, _clientY) => {
      const pickElement = document.createElement('div');
      return { camera: new THREE.PerspectiveCamera(), pickElement };
    },
    resolveFirstInteractiveViewportInDocument: () => {
      const pickElement = document.createElement('div');
      return { camera: new THREE.PerspectiveCamera(), pickElement };
    },
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
    getLastPointerClientPosition: () => ({ clientX: 10, clientY: 10 }),
    isShiftPressed: () => false,
    isCtrlPressed: () => false,
    isAltPressed: () => false,
    isModifierPressed: () => false,
    handleGlobalKeyDown: () => false,
    isNavigationBlockingTools: () => false,
    ...overrides,
  };
}

describe('ClipTool editor integration', () => {
  it('SwitchTool activates placement; not busy until a point is set', () => {
    const placement = new ToolClipPlane();
    const handler = {
      onEditorPointerUp: vi.fn(),
      isMarkerDragging: () => false,
      onPointerDown: vi.fn(() => true),
      createSyntheticMouseEvent: () => ({ clientX: 0, clientY: 0 }) as MouseEvent,
      onEditorPointerMove: vi.fn(),
      commitClip: vi.fn(),
      flipPlane: vi.fn(),
      commitSplit: vi.fn(),
    } as unknown as HandlerClipPlane;
    const editor = new EditorWindow();
    editor.setServices(createStubServices());
    editor.validateTools();
    const clipTool = new ClipTool(placement, handler);
    editor.setClipTool(clipTool);
    expect(editor.userSwitchToClipTool()).toBe(true);
    expect(placement.isActive()).toBe(true);
    expect(clipTool.isSessionActive()).toBe(true);
    expect(editor.isToolBusy).toBe(false);
    expect(editor.isClipToolActive()).toBe(true);
    placement.addPoint(new THREE.Vector3(1, 0, 0));
    expect(clipTool.isBusy()).toBe(true);
  });

  it('leaving clip via box select deactivates placement and clears busy', () => {
    const placement = new ToolClipPlane();
    const handler = {
      onEditorPointerUp: vi.fn(),
      isMarkerDragging: () => false,
      onPointerDown: vi.fn(() => true),
      createSyntheticMouseEvent: () => ({ clientX: 0, clientY: 0 }) as MouseEvent,
      onEditorPointerMove: vi.fn(),
    } as unknown as HandlerClipPlane;
    const editor = new EditorWindow();
    editor.setServices(createStubServices());
    editor.validateTools();
    editor.setClipTool(new ClipTool(placement, handler));
    editor.userSwitchToClipTool();
    editor.userSwitchToBoxSelectTool();
    expect(placement.isActive()).toBe(false);
    expect(editor.isToolBusy).toBe(false);
    expect(editor.isClipToolActive()).toBe(false);
  });

  it('Escape cancels clip and returns to bounds select tool', () => {
    const placement = new ToolClipPlane();
    const handler = {
      onEditorPointerUp: vi.fn(),
      isMarkerDragging: () => false,
      onPointerDown: vi.fn(() => true),
      createSyntheticMouseEvent: () => ({ clientX: 0, clientY: 0 }) as MouseEvent,
      onEditorPointerMove: vi.fn(),
      commitClip: vi.fn(),
      flipPlane: vi.fn(),
      commitSplit: vi.fn(),
    } as unknown as HandlerClipPlane;
    const editor = new EditorWindow();
    editor.setServices(createStubServices());
    editor.validateTools();
    const bounds = editor.getBoundsTool();
    editor.setClipTool(new ClipTool(placement, handler));
    editor.userSwitchToClipTool();
    expect(editor.getActiveEventReceiver().onKeyDown('Escape')).toBe(true);
    expect(editor.activeTool).toBe(bounds);
    expect(editor.activeTool).toBeInstanceOf(BoundsTool);
    expect(placement.isActive()).toBe(false);
  });

  it('while points are set, Enter/F/X are handled on the clip tool (busy exclusive keys)', () => {
    const placement = new ToolClipPlane();
    const commitClip = vi.fn(() => {
      placement.resetPlacementForNextCut();
    });
    const flipPlane = vi.fn();
    const commitSplit = vi.fn(() => {
      placement.resetPlacementForNextCut();
    });
    const handler = {
      onEditorPointerUp: vi.fn(),
      isMarkerDragging: () => false,
      onPointerDown: vi.fn(() => true),
      createSyntheticMouseEvent: () => ({ clientX: 0, clientY: 0 }) as MouseEvent,
      onEditorPointerMove: vi.fn(),
      commitClip,
      flipPlane,
      commitSplit,
    } as unknown as HandlerClipPlane;
    const editor = new EditorWindow();
    editor.setServices(createStubServices());
    editor.validateTools();
    const clipTool = new ClipTool(placement, handler);
    editor.setClipTool(clipTool);
    editor.userSwitchToClipTool();
    placement.addPoint(new THREE.Vector3(0, 0, 0));
    placement.addPoint(new THREE.Vector3(1, 0, 0));
    expect(clipTool.isBusy()).toBe(true);
    expect(editor.getActiveEventReceiver().onKeyDown('Enter')).toBe(true);
    expect(commitClip).toHaveBeenCalledTimes(1);
    expect(clipTool.isBusy()).toBe(false);
    placement.addPoint(new THREE.Vector3(0, 0, 0));
    expect(editor.getActiveEventReceiver().onKeyDown('KeyF')).toBe(true);
    expect(flipPlane).toHaveBeenCalledTimes(1);
    expect(editor.getActiveEventReceiver().onKeyDown('KeyX')).toBe(true);
    expect(commitSplit).toHaveBeenCalledTimes(1);
  });

  it('OnMouseDown forwards to the clip handler with the pane under the pointer', () => {
    const placement = new ToolClipPlane();
    placement.activate();
    const onPointerDown = vi.fn((_event: MouseEvent, _camera: THREE.Camera, _pickElement: HTMLElement) => true);
    const camera = new THREE.PerspectiveCamera();
    const pick = document.createElement('div');
    const handler = {
      onEditorPointerUp: vi.fn(),
      isMarkerDragging: () => false,
      onPointerDown,
      createSyntheticMouseEvent: (x: number, y: number) => ({ clientX: x, clientY: y, shiftKey: false }) as MouseEvent,
      onEditorPointerMove: vi.fn(),
      commitClip: vi.fn(),
      flipPlane: vi.fn(),
      commitSplit: vi.fn(),
    } as unknown as HandlerClipPlane;
    const editor = new EditorWindow();
    editor.setServices(
      createStubServices({
        getActiveCamera: () => camera,
        getActivePickElement: () => pick,
        resolveInteractiveViewportAtClientPoint: () => ({ camera, pickElement: pick }),
        getInteractiveViewportPickElements: () => [pick],
      }),
    );
    editor.validateTools();
    const clipTool = new ClipTool(placement, handler);
    editor.setClipTool(clipTool);
    editor.userSwitchToClipTool();
    editor.lastPointerClientX = 42;
    editor.lastPointerClientY = 24;
    clipTool.onMouseDown(0);
    expect(onPointerDown).toHaveBeenCalledTimes(1);
    expect(onPointerDown.mock.calls[0]?.[1]).toBe(camera);
    expect(onPointerDown.mock.calls[0]?.[2]).toBe(pick);
  });
});
