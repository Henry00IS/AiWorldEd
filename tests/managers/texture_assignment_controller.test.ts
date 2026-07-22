import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { TextureAssignmentController } from '../../src/managers/texture_assignment_controller.js';
import { FaceExtrusionController } from '../../src/managers/face_extrusion_controller.js';
import { SelectionManager } from '../../src/managers/selection_manager.js';
import { CommandStack } from '../../src/commands/command_stack.js';
import { GridSnap } from '../../src/transform/grid_snap.js';
import { createContentMaterial } from '../../src/materials/content_material_factory.js';
import { initializeMeshTextureUVs } from '../../src/texture/face_texture_applier.js';
import { getFaceTextureMaps } from '../../src/texture/face_texture_storage.js';
import { DEFAULT_CHECKER_TEXTURE_ID } from '../../src/texture/texture_id.js';
import { getDefaultCheckerBrowserEntry } from '../../src/texture/default_checker_entry.js';
import {
  setTexturePaintStateForTests,
  TexturePaintState,
  getTexturePaintState
} from '../../src/texture/texture_paint_state.js';
import {
  setTextureMapCacheForTests,
  TextureMapCache
} from '../../src/texture/texture_map_cache.js';
import { createTextureBrowserEntry } from '../../src/texture/texture_browser_entry.js';
import { mockObjectUrlApis } from '../texture/object_url_test_utils.js';

describe('TextureAssignmentController', () => {
  let scene: THREE.Scene;
  let world: THREE.Group;
  let selection: SelectionManager;
  let faceController: FaceExtrusionController;
  let commandStack: CommandStack;
  let controller: TextureAssignmentController;

  beforeEach(() => {
    mockObjectUrlApis('blob:assign');
    setTexturePaintStateForTests(new TexturePaintState());
    setTextureMapCacheForTests(new TextureMapCache());
    scene = new THREE.Scene();
    world = new THREE.Group();
    selection = new SelectionManager();
    commandStack = new CommandStack(64);
    faceController = new FaceExtrusionController(
      scene,
      commandStack,
      new GridSnap(false, 1),
      world
    );
    controller = new TextureAssignmentController(
      selection,
      faceController,
      commandStack
    );
  });

  afterEach(() => {
    setTexturePaintStateForTests(null);
    setTextureMapCacheForTests(null);
    vi.restoreAllMocks();
  });

  it('should update paint state without assigning when nothing is selected', () => {
    const status = vi.fn();
    controller.setStatusCallback(status);
    const entry = getDefaultCheckerBrowserEntry();
    controller.onTextureSelected(entry);
    expect(getTexturePaintState().getLastTextureId()).toBe(
      DEFAULT_CHECKER_TEXTURE_ID
    );
    expect(status).toHaveBeenCalled();
    expect(commandStack.getUndoCount()).toBe(0);
  });

  it('should assign texture to a selected object with undo', () => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      createContentMaterial(0x888888)
    );
    mesh.updateMatrixWorld(true);
    initializeMeshTextureUVs(mesh, DEFAULT_CHECKER_TEXTURE_ID);
    world.add(mesh);
    selection.selectObject(mesh);
    const entry = createTextureBrowserEntry(
      new File(['x'], 'rock.png', { type: 'image/png' }),
      'rock.png'
    );
    controller.onTextureSelected(entry);
    expect(getFaceTextureMaps(mesh)[0].mapping.textureId).toBe('rock.png');
    expect(commandStack.getUndoCount()).toBe(1);
    commandStack.undo();
    expect(getFaceTextureMaps(mesh)[0].mapping.textureId).toBe(
      DEFAULT_CHECKER_TEXTURE_ID
    );
  });
});
