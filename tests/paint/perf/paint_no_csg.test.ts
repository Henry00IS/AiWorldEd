import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { modifierVolumeTemplateCreate } from '@/modifier/stack/modifier_volume_templates.js';
import { CommandModifierStackSet } from '@/modifier/stack/command_modifier_stack_set.js';
import {
  modifierBevelRefreshAfterHistory,
  modifierBevelRefreshAfterVisibility,
  modifierBevelRefreshIfVolumesMoved,
  modifierBevelRefreshScene,
} from '@/modifier/compile/modifier_bevel_scene_refresh.js';
import { modifierBevelLiveRefreshIfVolumesPosed } from '@/modifier/compile/modifier_bevel_live_refresh.js';
import { CommandPaintStrokes } from '@/paint/commands/command_paint_strokes.js';
import { PaintDecalProvider } from '@/paint/decal/paint_decal_provider.js';
import { PaintSceneSystem } from '@/paint/scene/paint_scene_system.js';
import { PAINT_IMAGE_SOURCE_NONE } from '@/paint/raster/paint_image.js';
import { testFloorStroke } from '../paint_test_strokes.js';

/**
 * Builds a world with a floor brush, a decal over it and, elsewhere, a brush
 * repeated by an Array Volume, so the model also has derived (copied) brushes.
 *
 * @returns Parts.
 */
function world(): {
  world: THREE.Group;
  model: SolidModel;
  floorId: string;
  decal: THREE.Mesh;
  system: PaintSceneSystem;
} {
  const scene = new THREE.Scene();
  const root = new THREE.Group();
  scene.add(root);
  const model = new SolidModel('World');
  root.add(model.root);
  const floor = model.addBoxBrush(4, SolidOperation.Additive);
  const pillar = model.addBoxBrush(1, SolidOperation.Additive);
  pillar.mesh?.position.set(10, 0, 0);
  model.rebuild(true);
  const array = modifierVolumeTemplateCreate('linear');
  array.position.set(10, 0, 0);
  array.scale.set(2, 2, 2);
  root.add(array);
  const decal = modifierVolumeTemplateCreate('decal');
  decal.position.set(0, 2, 0);
  decal.scale.set(2, 1, 2);
  root.add(decal);
  modifierBevelRefreshScene(root);
  const system = new PaintSceneSystem(scene, () => root, PAINT_IMAGE_SOURCE_NONE);
  system.setLayerProvider(new PaintDecalProvider(() => root, PAINT_IMAGE_SOURCE_NONE));
  system.update();
  return { world: root, model, floorId: floor.id, decal, system };
}

/**
 * Records CSG work and the result geometry, to compare after an action.
 *
 * @param model Model.
 * @returns Reader of what changed since.
 */
function watchCsg(model: SolidModel): () => { rebuilds: number; dirtied: number; geometryChanged: boolean } {
  const rebuild = vi.spyOn(SolidModel.prototype, 'rebuild');
  const markDirty = vi.spyOn(SolidModel.prototype, 'markDirty');
  const markBrushesDirty = vi.spyOn(SolidModel.prototype, 'markBrushesDirty');
  const result = model.getResultMesh();
  const geometry = result.geometry;
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  const version = position.version;
  return () => ({
    rebuilds: rebuild.mock.calls.length,
    dirtied: markDirty.mock.calls.length + markBrushesDirty.mock.calls.length,
    geometryChanged:
      model.getResultMesh() !== result || model.getResultMesh().geometry !== geometry || position.version !== version,
  });
}

const NONE = { rebuilds: 0, dirtied: 0, geometryChanged: false };

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Paint never touches the CSG', () => {
  it('paints strokes and undoes them without a rebuild or a geometry change', () => {
    const { model, floorId, system } = world();
    const changes = watchCsg(model);
    const command = new CommandPaintStrokes([
      { model, brushId: floorId, stroke: testFloorStroke('s', 1, [[0, 2, 0]], { radius: 0.5 }) },
    ]);
    command.execute();
    for (let frame = 0; frame < 5; frame++) system.update();
    command.undo();
    system.update();
    command.execute();
    system.update();
    expect(changes()).toEqual(NONE);
  });

  it('moves a decal, live and committed, without a rebuild or a geometry change', () => {
    const { world: root, model, decal, system } = world();
    const changes = watchCsg(model);
    for (let step = 1; step <= 5; step++) {
      decal.position.x = step * 0.1;
      decal.updateMatrixWorld(true);
      modifierBevelLiveRefreshIfVolumesPosed(root);
      system.update();
    }
    modifierBevelRefreshIfVolumesMoved([decal], root);
    system.update();
    decal.position.x = 0;
    decal.updateMatrixWorld(true);
    modifierBevelRefreshAfterHistory(root);
    system.update();
    expect(changes()).toEqual(NONE);
  });

  it('edits and hides a decal without a rebuild or a geometry change', () => {
    const { model, decal, system } = world();
    const changes = watchCsg(model);
    const before = ModifierVolume.read(decal);
    const after = {
      ...before,
      modifiers: before.modifiers.map((step) => ({ ...step, parameters: { ...step.parameters, color: '#3366ff' } })),
    };
    const command = new CommandModifierStackSet(decal, before, after);
    command.execute();
    system.update();
    command.undo();
    system.update();
    decal.visible = false;
    modifierBevelRefreshAfterVisibility(decal);
    system.update();
    expect(changes()).toEqual(NONE);
  });

  it('still rebuilds when a volume that changes geometry moves', () => {
    const { world: root, model } = world();
    const array = root.children.find((child) => ModifierVolume.isVolume(child) && child.name.includes('Array'));
    expect(array).toBeDefined();
    const changes = watchCsg(model);
    array!.position.x = 10.5;
    array!.updateMatrixWorld(true);
    modifierBevelRefreshIfVolumesMoved([array!], root);
    expect(changes().rebuilds).toBeGreaterThan(0);
  });
});
