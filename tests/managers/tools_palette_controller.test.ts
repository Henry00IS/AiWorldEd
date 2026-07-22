import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import { ToolsPaletteController } from '../../src/managers/tools_palette_controller.js';
import { ToolsPalette } from '../../src/ui/tools_palette.js';
import { EditorToolId } from '../../src/types/editor_tool_id.js';
import { SelectionMode } from '../../src/types/selection_mode.js';
import { FaceExtrusionController } from '../../src/managers/face_extrusion_controller.js';
import { ClipPlaneTool } from '../../src/managers/clip_plane_tool.js';
import { ClipPlaneHandler } from '../../src/managers/clip_plane_handler.js';
import { SelectionManager } from '../../src/managers/selection_manager.js';
import { CommandStack } from '../../src/commands/command_stack.js';
import { GridSnap } from '../../src/transform/grid_snap.js';

describe('ToolsPaletteController', () => {
  let host: HTMLElement;
  let palette: ToolsPalette;
  let faceController: FaceExtrusionController;
  let clipTool: ClipPlaneTool;
  let selectionManager: SelectionManager;
  let controller: ToolsPaletteController;
  let showStatus: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    palette = new ToolsPalette(host, {
      onSelectTool: (id) => controller.selectTool(id),
      onFlipClipPlane: () => undefined,
      onCommitClip: () => undefined,
      onCommitSplit: () => undefined
    });
    const scene = new THREE.Scene();
    const world = new THREE.Group();
    faceController = new FaceExtrusionController(
      scene,
      new CommandStack(8),
      new GridSnap(false, 1),
      world
    );
    clipTool = new ClipPlaneTool();
    selectionManager = new SelectionManager();
    showStatus = vi.fn();
    const clipHandler = {
      flipPlane: () => undefined,
      commitClip: () => undefined,
      commitSplit: () => undefined,
      cancel: () => undefined
    } as unknown as ClipPlaneHandler;
    controller = new ToolsPaletteController({
      toolsPalette: palette,
      faceExtrusionController: faceController,
      clipPlaneTool: clipTool,
      clipPlaneHandler: clipHandler,
      selectionManager,
      showStatusMessage: showStatus
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
});
