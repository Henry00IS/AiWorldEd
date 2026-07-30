import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import * as THREE from 'three';
import { ToolsPaletteController } from '../../../src/managers/tools/tools_palette_controller.js';
import { ToolsPalette } from '../../../src/ui/tools_palette.js';
import { EditorToolId } from '../../../src/types/editor_tool_id.js';
import { SelectionMode } from '../../../src/types/selection_mode.js';
import { FaceExtrusionController } from '../../../src/managers/face/face_extrusion_controller.js';
import { ClipPlaneTool } from '../../../src/managers/clip_plane/clip_plane_tool.js';
import { ClipPlaneHandler } from '../../../src/managers/clip_plane/clip_plane_handler.js';
import { SelectionManager } from '../../../src/selection/object/selection_manager.js';
import { CommandStack } from '../../../src/commands/command_stack.js';
import { GridSnap } from '../../../src/transform/snap/grid_snap.js';
import { EditorOverlayPolicy } from '../../../src/managers/tools/editor_overlay_policy.js';
import { ModalToolSessionRegistry } from '../../../src/managers/tools/modal_tool_session_registry.js';
import { EditorOverlayId } from '../../../src/managers/tools/editor_overlay_id.js';
import { CLIP_PLANE_SESSION_KEY } from '../../../src/managers/tools/editor_tool_session_keys.js';

describe('ToolsPaletteController', () => {
  let host: HTMLElement;
  let palette: ToolsPalette;
  let faceController: FaceExtrusionController;
  let clipTool: ClipPlaneTool;
  let selectionManager: SelectionManager;
  let controller: ToolsPaletteController;
  let showStatus: Mock<(message: string) => void>;
  let overlayPolicy: EditorOverlayPolicy;
  let modalRegistry: ModalToolSessionRegistry;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    palette = new ToolsPalette(host, {
      onSelectTool: (id) => controller.selectTool(id),
      onTransformMode: () => undefined,
      onFlipClipPlane: () => undefined,
      onCommitClip: () => undefined,
      onCommitSplit: () => undefined,
      onOpenUvEditor: () => undefined,
      onExtrudeFaces: () => undefined,
    });
    const scene = new THREE.Scene();
    const world = new THREE.Group();
    faceController = new FaceExtrusionController(scene, new CommandStack(8), new GridSnap(false, 1), world);
    clipTool = new ClipPlaneTool();
    selectionManager = new SelectionManager();
    showStatus = vi.fn<(message: string) => void>();
    overlayPolicy = new EditorOverlayPolicy();
    modalRegistry = new ModalToolSessionRegistry();
    const clipHandler = {
      flipPlane: () => undefined,
      commitClip: () => undefined,
      commitSplit: () => undefined,
      cancel: () => {
        clipTool.deactivate();
      },
    } as unknown as ClipPlaneHandler;
    controller = new ToolsPaletteController({
      toolsPalette: palette,
      faceExtrusionController: faceController,
      clipPlaneTool: clipTool,
      clipPlaneHandler: clipHandler,
      selectionManager,
      editorOverlayPolicy: overlayPolicy,
      modalToolSessionRegistry: modalRegistry,
      showStatusMessage: showStatus,
    });
  });

  it('should start on object tool', () => {
    expect(controller.getActiveTool()).toBe(EditorToolId.OBJECT);
  });

  it('should activate face tool and leave clip inactive', () => {
    controller.selectTool(EditorToolId.FACE);
    expect(controller.getActiveTool()).toBe(EditorToolId.FACE);
    expect(faceController.getSelectionMode()).toBe(SelectionMode.FACE);
    expect(clipTool.isActive()).toBe(false);
  });

  it('should refuse clip tool without a selection', () => {
    controller.selectTool(EditorToolId.CLIP_PLANE);
    expect(clipTool.isActive()).toBe(false);
    expect(showStatus).toHaveBeenCalled();
  });

  it('should activate clip tool when a mesh is selected', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    selectionManager.selectObject(mesh);
    controller.selectTool(EditorToolId.CLIP_PLANE);
    expect(controller.getActiveTool()).toBe(EditorToolId.CLIP_PLANE);
    expect(clipTool.isActive()).toBe(true);
    expect(faceController.getSelectionMode()).toBe(SelectionMode.OBJECT);
    expect(controller.isClipToolActive()).toBe(true);
  });

  it('should deactivate clip when external face mode is entered', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    selectionManager.selectObject(mesh);
    controller.selectTool(EditorToolId.CLIP_PLANE);
    controller.onExternalSelectionModeChanged(SelectionMode.FACE);
    expect(clipTool.isActive()).toBe(false);
    expect(controller.getActiveTool()).toBe(EditorToolId.FACE);
  });

  it('should suppress CAD bounds rulers while clip is active', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    selectionManager.selectObject(mesh);
    expect(overlayPolicy.isAllowed(EditorOverlayId.CAD_BOUNDS_RULERS)).toBe(true);
    controller.selectTool(EditorToolId.CLIP_PLANE);
    expect(overlayPolicy.isAllowed(EditorOverlayId.CAD_BOUNDS_RULERS)).toBe(false);
    controller.selectTool(EditorToolId.OBJECT);
    expect(overlayPolicy.isAllowed(EditorOverlayId.CAD_BOUNDS_RULERS)).toBe(true);
  });

  it('should end clip when selection changes externally via modal registry', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const other = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    selectionManager.selectObject(mesh);
    controller.selectTool(EditorToolId.CLIP_PLANE);
    expect(clipTool.isActive()).toBe(true);
    expect(modalRegistry.has(CLIP_PLANE_SESSION_KEY)).toBe(true);
    selectionManager.selectObject(other);
    modalRegistry.onSelectionChanged();
    expect(clipTool.isActive()).toBe(false);
    expect(controller.getActiveTool()).toBe(EditorToolId.OBJECT);
    expect(overlayPolicy.isAllowed(EditorOverlayId.CAD_BOUNDS_RULERS)).toBe(true);
  });

  it('should not end clip when selection change is suppressed by the modal registry', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const other = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    selectionManager.selectObject(mesh);
    controller.selectTool(EditorToolId.CLIP_PLANE);
    modalRegistry.runWithSelectionEndSuppressed(() => {
      selectionManager.selectObject(other);
      modalRegistry.onSelectionChanged();
    });
    expect(clipTool.isActive()).toBe(true);
    expect(controller.getActiveTool()).toBe(EditorToolId.CLIP_PLANE);
  });
});
