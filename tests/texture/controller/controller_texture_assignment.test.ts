import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { ControllerTextureAssignment } from '@/texture/controller/controller_texture_assignment.js';
import { ControllerFaceExtrusion } from '@/tools/face/controller_face_extrusion.js';
import { ManagerSelection } from '@/selection/object/manager_selection.js';
import { CommandStack } from '@/commands/command_stack.js';
import { GridSnap } from '@/transform/snap/grid_snap.js';
import { createContentMaterial } from '@/materials/factory_content_material.js';
import { initializeMeshTextureUVs } from '@/texture/uv/face_texture_applier.js';
import { getFaceTextureMaps } from '@/texture/uv/face_texture_storage.js';
import { DEFAULT_CHECKER_TEXTURE_ID } from '@/texture/library/texture_id.js';
import { getDefaultCheckerBrowserEntry } from '@/texture/library/default_checker_entry.js';
import {
  setStateTexturePaintForTests,
  StateTexturePaint,
  getStateTexturePaint,
} from '@/texture/paint/state_texture_paint.js';
import { setTextureMapCacheForTests, TextureMapCache } from '@/texture/library/texture_map_cache.js';
import { createTextureBrowserEntry } from '@/texture/library/texture_browser_entry.js';
import { ModifierVolumeBevel } from '@/modifier/volume/modifier_volume_bevel.js';
import { mockObjectUrlApis } from '../../texture/library/utils_object_url_test.js';

describe('TextureAssignmentController', () => {
  let scene: THREE.Scene;
  let world: THREE.Group;
  let selection: ManagerSelection;
  let faceController: ControllerFaceExtrusion;
  let commandStack: CommandStack;
  let controller: ControllerTextureAssignment;

  beforeEach(() => {
    mockObjectUrlApis('blob:assign');
    setStateTexturePaintForTests(new StateTexturePaint());
    setTextureMapCacheForTests(new TextureMapCache());
    scene = new THREE.Scene();
    world = new THREE.Group();
    selection = new ManagerSelection();
    commandStack = new CommandStack(64);
    faceController = new ControllerFaceExtrusion(scene, commandStack, new GridSnap(false, 1), world);
    controller = new ControllerTextureAssignment(selection, faceController, commandStack);
  });

  afterEach(() => {
    setStateTexturePaintForTests(null);
    setTextureMapCacheForTests(null);
    vi.restoreAllMocks();
  });

  it('should update paint state without assigning when nothing is selected', () => {
    const status = vi.fn();
    controller.setStatusCallback(status);
    const entry = getDefaultCheckerBrowserEntry();
    controller.onTextureSelected(entry);
    expect(getStateTexturePaint().getLastTextureId()).toBe(DEFAULT_CHECKER_TEXTURE_ID);
    expect(status).toHaveBeenCalled();
    expect(commandStack.getUndoCount()).toBe(0);
  });

  it('should assign texture to a selected object with undo', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), createContentMaterial(0x888888));
    mesh.updateMatrixWorld(true);
    initializeMeshTextureUVs(mesh, DEFAULT_CHECKER_TEXTURE_ID);
    world.add(mesh);
    selection.selectObject(mesh);
    const entry = createTextureBrowserEntry(new File(['x'], 'rock.png', { type: 'image/png' }), 'rock.png');
    controller.onTextureSelected(entry);
    expect(getFaceTextureMaps(mesh)[0]!.mapping.textureId).toBe('rock.png');
    expect(commandStack.getUndoCount()).toBe(1);
    commandStack.undo();
    expect(getFaceTextureMaps(mesh)[0]!.mapping.textureId).toBe(DEFAULT_CHECKER_TEXTURE_ID);
  });

  it('leaves a bevel volume unpainted when the browser texture is chosen', () => {
    const status = vi.fn();
    controller.setStatusCallback(status);
    const volume = ModifierVolumeBevel.create();
    const before = getFaceTextureMaps(volume);
    world.add(volume);
    selection.selectObject(volume);
    const entry = createTextureBrowserEntry(new File(['x'], 'rock.png', { type: 'image/png' }), 'rock.png');
    controller.onTextureSelected(entry);
    expect(commandStack.getUndoCount()).toBe(0);
    expect(getFaceTextureMaps(volume)).toEqual(before);
    expect(status).toHaveBeenCalledWith('Bevel volumes keep their texture in the volume settings');
  });
});
