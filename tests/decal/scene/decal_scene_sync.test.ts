import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { isEditorHelperObject } from '@/utils/mesh_edge_sync.js';
import { DecalSceneSync } from '@/decal/scene/decal_scene_sync.js';
import { ShadingMode } from '@/types/shading_mode.js';
import { decalSceneSyncEditorCreate } from '@/decal/scene/decal_scene_sync_editor.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { decalTestLevelCreate, decalTestProjector, decalTestServices } from '../decal_test_fixture.js';

describe('DecalSceneSync', () => {
  it('finds visible projectors in a world and draws them on its solid model', () => {
    const level = decalTestLevelCreate();
    const shown = decalTestProjector();
    shown.position.set(1, 0, 1);
    const hidden = decalTestProjector();
    hidden.visible = false;
    level.world.add(shown, hidden);
    expect(DecalSceneSync.projectorsCollect(level.world)).toEqual([shown]);
    const sync = new DecalSceneSync(decalTestServices());
    const report = sync.sync(level.world);
    expect(report.rebuiltDecals).toBe(1);
    expect(sync.layerOf(level.model)?.presentationOf(shown)?.triangleCount()).toBeGreaterThan(0);
  });

  it('removes a model layer when the model leaves the world', () => {
    const level = decalTestLevelCreate();
    level.world.add(decalTestProjector());
    const sync = new DecalSceneSync(decalTestServices());
    sync.sync(level.world);
    expect(sync.layerOf(level.model)).toBeDefined();
    level.world.remove(level.model.root);
    sync.sync(level.world);
    expect(sync.layerOf(level.model)).toBeUndefined();
  });

  it('draws into an overlay outside the world that follows the model and leaves world walks untouched', () => {
    const level = decalTestLevelCreate();
    const decal = decalTestProjector();
    decal.position.set(1, 0, 1);
    level.world.add(decal);
    const overlay = new THREE.Group();
    const sync = new DecalSceneSync({ ...decalTestServices(), overlay });
    sync.sync(level.world);
    const mesh = sync.layerOf(level.model)?.presentationOf(decal)?.mesh;
    expect(mesh?.parent).toBe(overlay);
    const worldMeshes: THREE.Object3D[] = [];
    level.world.traverse((object) => {
      if (object instanceof THREE.Mesh && !isEditorHelperObject(object) && object.userData['isDecalPresentation'])
        worldMeshes.push(object);
    });
    expect(worldMeshes).toEqual([]);
    level.model.root.position.set(0, 3, 0);
    level.world.updateMatrixWorld(true);
    sync.sync(level.world);
    expect(new THREE.Vector3().setFromMatrixPosition(mesh!.matrix).y).toBeCloseTo(3, 6);
    level.model.root.visible = false;
    sync.sync(level.world);
    expect(mesh?.visible).toBe(false);
  });

  it('keeps drawing when another editor pass swaps the mesh material', () => {
    const level = decalTestLevelCreate();
    const decal = decalTestProjector();
    level.world.add(decal);
    const sync = new DecalSceneSync(decalTestServices());
    sync.sync(level.world);
    const presentation = sync.layerOf(level.model)?.presentationOf(decal);
    presentation!.mesh.material = new THREE.MeshBasicMaterial();
    const stack = ModifierVolume.read(decal);
    stack.modifiers[0]!.parameters = { ...stack.modifiers[0]!.parameters, opacity: 0.3 };
    ModifierVolume.write(decal, stack);
    expect(() => sync.sync(level.world)).not.toThrow();
  });
});

describe('decalSceneSyncEditorCreate', () => {
  it('keeps every decal mesh under the helpers root, never inside the editable world', () => {
    const level = decalTestLevelCreate();
    level.world.add(decalTestProjector());
    const helpers = new THREE.Group();
    decalSceneSyncEditorCreate().sync(level.world, helpers);
    const inWorld: THREE.Object3D[] = [];
    level.world.traverse((object) => object.userData['isDecalPresentation'] === true && inWorld.push(object));
    const inHelpers: THREE.Object3D[] = [];
    helpers.traverse((object) => object instanceof THREE.Mesh && inHelpers.push(object));
    expect(inWorld).toEqual([]);
    expect(inHelpers.length).toBe(1);
    expect(isEditorHelperObject(inHelpers[0]!)).toBe(true);
  });

  it('shows decals only in perspective panes with filled shading', () => {
    const level = decalTestLevelCreate();
    level.world.add(decalTestProjector());
    const helpers = new THREE.Group();
    const decals = decalSceneSyncEditorCreate();
    decals.sync(level.world, helpers);
    const overlay = helpers.children[0]!;
    const pane = (camera: THREE.Camera, shading: ShadingMode) => ({
      getCamera: () => camera,
      getShadingMode: () => shading,
    });
    decals.paneShow(pane(new THREE.OrthographicCamera(), ShadingMode.WIREFRAME));
    expect(overlay.visible).toBe(false);
    decals.paneShow(pane(new THREE.PerspectiveCamera(), ShadingMode.SOLID));
    expect(overlay.visible).toBe(true);
    decals.paneShow(pane(new THREE.OrthographicCamera(), ShadingMode.SOLID));
    expect(overlay.visible).toBe(false);
    decals.paneShow(pane(new THREE.PerspectiveCamera(), ShadingMode.WIREFRAME));
    expect(overlay.visible).toBe(false);
  });
});
