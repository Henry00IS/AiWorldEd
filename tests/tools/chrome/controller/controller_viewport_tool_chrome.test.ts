import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import { ControllerViewportToolChrome } from '@/tools/chrome/controller/controller_viewport_tool_chrome.js';
import { EditorToolId } from '@/types/editor_tool_id.js';
import { SelectionMode } from '@/types/selection_mode.js';
import { EditorInteractionMode } from '@/types/editor_interaction_mode.js';
import { EditorComponentMode } from '@/types/editor_component_mode.js';
import { ControllerFaceExtrusion } from '@/tools/face/controller_face_extrusion.js';
import { ToolClipPlane } from '@/tools/clip_plane/tool_clip_plane.js';
import { HandlerClipPlane } from '@/tools/clip_plane/handler_clip_plane.js';
import { ManagerSelection } from '@/selection/object/manager_selection.js';
import { CommandStack } from '@/commands/command_stack.js';
import { GridSnap } from '@/transform/snap/grid_snap.js';
import { PolicyEditorOverlay } from '@/tools/overlay/policy_editor_overlay.js';
import { RegistryModalToolSession } from '@/tools/session/registry_modal_tool_session.js';
import { EditorOverlayId } from '@/tools/overlay/editor_overlay_id.js';
import { CLIP_PLANE_SESSION_KEY } from '@/tools/session/editor_tool_session_keys.js';

describe('ControllerViewportToolChrome', () => {
  let pane: HTMLElement;
  let faceController: ControllerFaceExtrusion;
  let clipTool: ToolClipPlane;
  let selectionManager: ManagerSelection;
  let controller: ControllerViewportToolChrome;
  let showStatus: ReturnType<typeof vi.fn<(message: string) => void>>;
  let overlayPolicy: PolicyEditorOverlay;
  let modalRegistry: RegistryModalToolSession;

  beforeEach(() => {
    pane = document.createElement('div');
    document.body.appendChild(pane);
    const scene = new THREE.Scene();
    const world = new THREE.Group();
    faceController = new ControllerFaceExtrusion(scene, new CommandStack(8), new GridSnap(false, 1), world);
    clipTool = new ToolClipPlane();
    selectionManager = new ManagerSelection();
    showStatus = vi.fn<(message: string) => void>();
    overlayPolicy = new PolicyEditorOverlay();
    modalRegistry = new RegistryModalToolSession();
    const clipHandler = {
      flipPlane: () => undefined,
      commitClip: () => undefined,
      commitSplit: () => undefined,
      cancel: () => {
        clipTool.deactivate();
      },
    } as unknown as HandlerClipPlane;
    controller = new ControllerViewportToolChrome({
      faceExtrusionController: faceController,
      clipPlaneTool: clipTool,
      clipPlaneHandler: clipHandler,
      selectionManager,
      editorOverlayPolicy: overlayPolicy,
      modalToolSessionRegistry: modalRegistry,
      showStatusMessage: showStatus,
      onTransformMode: () => undefined,
      onOpenUvEditor: () => undefined,
      onExtrudeFaces: () => undefined,
    });
    controller.attachPane(pane);
  });

  it('should start on object tool', () => {
    expect(controller.getActiveTool()).toBe(EditorToolId.OBJECT);
  });

  it('should activate the grid tool without opening clip', () => {
    const switchToGrid = vi.fn();
    const onPrimaryToolChanged = vi.fn();
    const gridController = new ControllerViewportToolChrome({
      faceExtrusionController: faceController,
      clipPlaneTool: clipTool,
      clipPlaneHandler: {
        flipPlane: () => undefined,
        commitClip: () => undefined,
        commitSplit: () => undefined,
        cancel: () => {
          clipTool.deactivate();
        },
      } as unknown as HandlerClipPlane,
      selectionManager,
      editorOverlayPolicy: overlayPolicy,
      modalToolSessionRegistry: modalRegistry,
      showStatusMessage: showStatus,
      onTransformMode: () => undefined,
      onOpenUvEditor: () => undefined,
      onExtrudeFaces: () => undefined,
      switchToGridTool: switchToGrid,
      onGridReset: () => undefined,
      onGridAlignToFace: () => undefined,
      onGridAlignAxis: () => undefined,
      onGridOriginVertex: () => undefined,
      onCameraReset: () => undefined,
      onCameraAlignToFace: () => undefined,
      onPrimaryToolChanged,
    });
    gridController.attachPane(pane);
    gridController.selectTool(EditorToolId.GRID);
    expect(gridController.getActiveTool()).toBe(EditorToolId.GRID);
    expect(switchToGrid).toHaveBeenCalled();
    expect(onPrimaryToolChanged).toHaveBeenCalled();
    expect(clipTool.isActive()).toBe(false);
    gridController.dispose();
  });

  it('should refuse tool switches while the editor tool is busy', () => {
    const busy = new ControllerViewportToolChrome({
      faceExtrusionController: faceController,
      clipPlaneTool: clipTool,
      clipPlaneHandler: {
        flipPlane: () => undefined,
        commitClip: () => undefined,
        commitSplit: () => undefined,
        cancel: () => {
          clipTool.deactivate();
        },
      } as unknown as HandlerClipPlane,
      selectionManager,
      editorOverlayPolicy: overlayPolicy,
      modalToolSessionRegistry: modalRegistry,
      showStatusMessage: showStatus,
      onTransformMode: () => undefined,
      onOpenUvEditor: () => undefined,
      onExtrudeFaces: () => undefined,
      isEditorToolBusy: () => true,
    });
    busy.attachPane(document.createElement('div'));
    busy.selectTool(EditorToolId.FACE);
    expect(busy.getActiveTool()).toBe(EditorToolId.OBJECT);
  });

  it('should activate face tool and leave clip inactive', () => {
    controller.selectTool(EditorToolId.FACE);
    expect(controller.getActiveTool()).toBe(EditorToolId.FACE);
    expect(clipTool.isActive()).toBe(false);
  });

  it('should switch the editor FaceSelectTool when face palette is chosen', () => {
    const switchToFaceSelect = vi.fn();
    const wired = new ControllerViewportToolChrome({
      faceExtrusionController: faceController,
      clipPlaneTool: clipTool,
      clipPlaneHandler: {
        flipPlane: () => undefined,
        commitClip: () => undefined,
        commitSplit: () => undefined,
        cancel: () => {
          clipTool.deactivate();
        },
      } as unknown as HandlerClipPlane,
      selectionManager,
      editorOverlayPolicy: overlayPolicy,
      modalToolSessionRegistry: modalRegistry,
      showStatusMessage: showStatus,
      onTransformMode: () => undefined,
      onOpenUvEditor: () => undefined,
      onExtrudeFaces: () => undefined,
      switchToFaceSelect,
    });
    wired.attachPane(document.createElement('div'));
    wired.selectTool(EditorToolId.FACE);
    expect(switchToFaceSelect).toHaveBeenCalled();
  });

  it('should refuse clip tool without a selection', () => {
    controller.selectTool(EditorToolId.CLIP_PLANE);
    expect(controller.getActiveTool()).toBe(EditorToolId.OBJECT);
    expect(showStatus).toHaveBeenCalledWith('Select a mesh to clip');
  });

  it('should activate clip tool when a mesh is selected', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    selectionManager.selectObject(mesh);
    controller.selectTool(EditorToolId.CLIP_PLANE);
    expect(controller.getActiveTool()).toBe(EditorToolId.CLIP_PLANE);
    expect(clipTool.isActive()).toBe(true);
    expect(overlayPolicy.isAllowed(EditorOverlayId.CAD_BOUNDS_RULERS)).toBe(false);
    expect(overlayPolicy.isAllowed(EditorOverlayId.TRANSFORM_GIZMOS)).toBe(false);
    expect(modalRegistry.has(CLIP_PLANE_SESSION_KEY)).toBe(true);
  });

  it('should opt into CAD rulers and gizmos only for object select', () => {
    expect(overlayPolicy.isAllowed(EditorOverlayId.CAD_BOUNDS_RULERS)).toBe(true);
    expect(overlayPolicy.isAllowed(EditorOverlayId.TRANSFORM_GIZMOS)).toBe(true);
    controller.selectTool(EditorToolId.GRID);
    expect(overlayPolicy.isAllowed(EditorOverlayId.CAD_BOUNDS_RULERS)).toBe(false);
    expect(overlayPolicy.isAllowed(EditorOverlayId.TRANSFORM_GIZMOS)).toBe(false);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    selectionManager.selectObject(mesh);
    controller.selectTool(EditorToolId.CLIP_PLANE);
    expect(overlayPolicy.isAllowed(EditorOverlayId.CAD_BOUNDS_RULERS)).toBe(false);
    expect(overlayPolicy.isAllowed(EditorOverlayId.TRANSFORM_GIZMOS)).toBe(false);
    controller.selectTool(EditorToolId.OBJECT);
    expect(overlayPolicy.isAllowed(EditorOverlayId.CAD_BOUNDS_RULERS)).toBe(true);
    expect(overlayPolicy.isAllowed(EditorOverlayId.TRANSFORM_GIZMOS)).toBe(true);
  });

  it('should end clip when selection changes externally via modal registry', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const other = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    selectionManager.selectObject(mesh);
    controller.selectTool(EditorToolId.CLIP_PLANE);
    selectionManager.selectObject(other);
    modalRegistry.onSelectionChanged();
    expect(controller.getActiveTool()).toBe(EditorToolId.OBJECT);
    expect(clipTool.isActive()).toBe(false);
  });

  it('should not end clip when selection change is suppressed by the modal registry', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const other = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    selectionManager.selectObject(mesh);
    controller.selectTool(EditorToolId.CLIP_PLANE);
    modalRegistry.runWithSelectionEndSuppressed(() => {
      selectionManager.selectObject(other);
    });
    expect(controller.getActiveTool()).toBe(EditorToolId.CLIP_PLANE);
  });

  it('should sync external face selection mode', () => {
    controller.onExternalSelectionModeChanged(SelectionMode.FACE);
    expect(controller.getActiveTool()).toBe(EditorToolId.FACE);
  });

  it('mounts rail and top options bar, both hidden until hover ownership', () => {
    const rail = pane.querySelector('.editor-viewport-tool-rail') as HTMLElement;
    const options = pane.querySelector('.editor-viewport-tool-options-bar') as HTMLElement;
    expect(rail).not.toBeNull();
    expect(options).not.toBeNull();
    expect(rail.style.display).toBe('none');
    expect(options.style.display).toBe('none');
  });

  it('starts in Object Mode and toggles to Edit Mode', () => {
    expect(controller.getActiveInteractionMode()).toBe(EditorInteractionMode.OBJECT_MODE);
    controller.toggleInteractionMode();
    expect(controller.getActiveInteractionMode()).toBe(EditorInteractionMode.EDIT_MODE);
    controller.toggleInteractionMode();
    expect(controller.getActiveInteractionMode()).toBe(EditorInteractionMode.OBJECT_MODE);
    expect(showStatus).toHaveBeenCalledWith('Object Mode');
  });

  it('cancels Edit Mode when onEnterEditMode returns false', () => {
    const blocked = new ControllerViewportToolChrome({
      faceExtrusionController: faceController,
      clipPlaneTool: clipTool,
      clipPlaneHandler: {
        flipPlane: () => undefined,
        commitClip: () => undefined,
        commitSplit: () => undefined,
        cancel: () => {
          clipTool.deactivate();
        },
      } as unknown as HandlerClipPlane,
      selectionManager,
      editorOverlayPolicy: overlayPolicy,
      modalToolSessionRegistry: modalRegistry,
      showStatusMessage: showStatus,
      onTransformMode: () => undefined,
      onOpenUvEditor: () => undefined,
      onExtrudeFaces: () => undefined,
      onEnterEditMode: () => false,
    });
    blocked.attachPane(document.createElement('div'));
    blocked.toggleInteractionMode();
    expect(blocked.getActiveInteractionMode()).toBe(EditorInteractionMode.OBJECT_MODE);
  });

  it('sets interaction mode from the dropdown path', () => {
    controller.setInteractionMode(EditorInteractionMode.EDIT_MODE);
    expect(controller.getActiveInteractionMode()).toBe(EditorInteractionMode.EDIT_MODE);
    controller.setInteractionMode(EditorInteractionMode.OBJECT_MODE);
    expect(controller.getActiveInteractionMode()).toBe(EditorInteractionMode.OBJECT_MODE);
  });

  it('sets component mode only while Edit Mode is active', () => {
    controller.setComponentMode(EditorComponentMode.EDGE);
    expect(controller.getActiveComponentMode()).toBe(EditorComponentMode.VERTEX);
    controller.setInteractionMode(EditorInteractionMode.EDIT_MODE);
    controller.setComponentMode(EditorComponentMode.EDGE);
    expect(controller.getActiveComponentMode()).toBe(EditorComponentMode.EDGE);
  });

  it('refuses Face Select and Clip while Edit Mode is active', () => {
    controller.setInteractionMode(EditorInteractionMode.EDIT_MODE);
    controller.selectTool(EditorToolId.FACE);
    expect(controller.getActiveTool()).not.toBe(EditorToolId.FACE);
    expect(showStatus).toHaveBeenCalledWith('Face Select, Clip, Grid, and Paint are Object Mode tools');
    showStatus.mockClear();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    selectionManager.selectObject(mesh);
    controller.selectTool(EditorToolId.CLIP_PLANE);
    expect(controller.getActiveTool()).not.toBe(EditorToolId.CLIP_PLANE);
    expect(showStatus).toHaveBeenCalledWith('Face Select, Clip, Grid, and Paint are Object Mode tools');
    controller.selectTool(EditorToolId.PAINT);
    expect(controller.getActiveTool()).not.toBe(EditorToolId.PAINT);
  });

  it('should activate the paint tool and hide object overlays', () => {
    const switchToPaint = vi.fn();
    const paintOverlays = new PolicyEditorOverlay();
    const paintController = new ControllerViewportToolChrome({
      faceExtrusionController: faceController,
      clipPlaneTool: clipTool,
      clipPlaneHandler: { cancel: () => clipTool.deactivate() } as unknown as HandlerClipPlane,
      selectionManager,
      editorOverlayPolicy: paintOverlays,
      modalToolSessionRegistry: modalRegistry,
      showStatusMessage: showStatus,
      onTransformMode: () => undefined,
      onOpenUvEditor: () => undefined,
      onExtrudeFaces: () => undefined,
      switchToPaintTool: switchToPaint,
    });
    paintController.attachPane(document.createElement('div'));
    paintController.selectTool(EditorToolId.PAINT);
    expect(paintController.getActiveTool()).toBe(EditorToolId.PAINT);
    expect(switchToPaint).toHaveBeenCalledTimes(1);
    expect(paintOverlays.isAllowed(EditorOverlayId.TRANSFORM_GIZMOS)).toBe(false);
    paintController.selectTool(EditorToolId.OBJECT);
    expect(paintController.getActiveTool()).toBe(EditorToolId.OBJECT);
    expect(paintOverlays.isAllowed(EditorOverlayId.TRANSFORM_GIZMOS)).toBe(true);
    paintController.dispose();
  });
});
