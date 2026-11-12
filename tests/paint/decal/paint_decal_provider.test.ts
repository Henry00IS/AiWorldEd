import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { modifierStackEntryCreate } from '@/modifier/stack/modifier_stack_settings.js';
import { modifierVolumeTemplateCreate } from '@/modifier/stack/modifier_volume_templates.js';
import { modifierVolumeChangesGeometry } from '@/modifier/stack/modifier_volume_geometry.js';
import type { ModifierStackEntry } from '@/modifier/stack/modifier_stack_types.js';
import {
  PaintDecalProvider,
  paintDecalCompare,
  paintDecalSpecRead,
  paintDecalVolumesCollect,
} from '@/paint/decal/paint_decal_provider.js';
import { PaintSceneSystem } from '@/paint/scene/paint_scene_system.js';
import { PAINT_IMAGE_SOURCE_NONE } from '@/paint/raster/paint_image.js';

/**
 * Builds a world with a 4 m box brush (top face at y = 2) and a decal volume
 * hovering over its top.
 *
 * @returns Parts.
 */
function decalWorld(): { world: THREE.Group; model: SolidModel; volume: THREE.Mesh } {
  const world = new THREE.Group();
  const model = new SolidModel('Floor');
  world.add(model.root);
  model.addBoxBrush(4, SolidOperation.Additive);
  model.rebuild(true);
  const volume = modifierVolumeTemplateCreate('decal');
  volume.position.set(0, 2, 0);
  volume.scale.set(2, 1, 2);
  world.add(volume);
  world.updateMatrixWorld(true);
  return { world, model, volume };
}

/**
 * Returns the first decal step of a volume.
 *
 * @param volume Volume.
 * @returns Step.
 */
function decalStep(volume: THREE.Object3D): ModifierStackEntry {
  const step = ModifierVolume.read(volume).modifiers[0];
  if (step === undefined) throw new Error('missing decal step');
  return step;
}

/**
 * Rewrites the parameters of a volume's decal step.
 *
 * @param volume Volume.
 * @param parameters Parameters to merge.
 */
function decalSet(volume: THREE.Object3D, parameters: Record<string, unknown>): void {
  const settings = ModifierVolume.read(volume);
  ModifierVolume.write(volume, {
    ...settings,
    modifiers: settings.modifiers.map((step) => ({ ...step, parameters: { ...step.parameters, ...parameters } })),
  });
}

describe('Paint decal provider', () => {
  it('creates Decal Volumes that never take part in the CSG', () => {
    const { volume } = decalWorld();
    expect(decalStep(volume).kind).toBe('decal');
    expect(volume.name).toContain('Decal Volume');
    expect(modifierVolumeChangesGeometry(volume)).toBe(false);
    const mixed = ModifierVolume.read(volume);
    const array = modifierStackEntryCreate('linear', mixed.modifiers);
    ModifierVolume.write(volume, { ...mixed, modifiers: [...mixed.modifiers, array] });
    expect(modifierVolumeChangesGeometry(volume)).toBe(true);
    expect(modifierVolumeChangesGeometry(modifierVolumeTemplateCreate('empty'))).toBe(true);
  });

  it('collects enabled decals of visible volumes only', () => {
    const { world, volume } = decalWorld();
    expect(paintDecalVolumesCollect(world)).toHaveLength(1);
    volume.visible = false;
    expect(paintDecalVolumesCollect(world)).toHaveLength(0);
    volume.visible = true;
    ModifierVolume.write(volume, { ...ModifierVolume.read(volume), enabled: false });
    expect(paintDecalVolumesCollect(world)).toHaveLength(0);
  });

  it('reaches only the brush faces the projection looks at', () => {
    const { world, model, volume } = decalWorld();
    const provider = new PaintDecalProvider(() => world, PAINT_IMAGE_SOURCE_NONE);
    provider.prepare();
    const brush = model.getBrushes()[0];
    if (brush === undefined) throw new Error('missing brush');
    const layers = provider.layersFor(model, brush);
    expect(layers.bounds).toHaveLength(1);
    const reached = brush.brush.planes.map((plane, face) => (layers.layers(face).length > 0 ? plane.normal.y : 0));
    expect(reached.filter((y) => y !== 0).every((y) => Math.abs(y) > 0.99)).toBe(true);
    expect(reached.some((y) => y > 0.99)).toBe(true);
    const before = layers.signature;
    volume.position.x += 0.5;
    world.updateMatrixWorld(true);
    provider.prepare();
    expect(provider.layersFor(model, brush).signature).not.toBe(before);
    volume.position.set(50, 50, 50);
    world.updateMatrixWorld(true);
    provider.prepare();
    expect(provider.layersFor(model, brush).bounds).toHaveLength(0);
  });

  it('changes its signature when a setting changes', () => {
    const { world, model, volume } = decalWorld();
    const provider = new PaintDecalProvider(() => world, PAINT_IMAGE_SOURCE_NONE);
    const brush = model.getBrushes()[0];
    if (brush === undefined) throw new Error('missing brush');
    provider.prepare();
    const before = provider.layersFor(model, brush).signature;
    decalSet(volume, { blend: 'multiply' });
    provider.prepare();
    expect(provider.layersFor(model, brush).signature).not.toBe(before);
  });

  it('bakes decals into the atlas without any hand paint', () => {
    const { world, volume } = decalWorld();
    decalSet(volume, { color: '#000000', blend: 'multiply', edgeFade: 0 });
    const scene = new THREE.Scene();
    scene.add(world);
    const system = new PaintSceneSystem(scene, () => world, PAINT_IMAGE_SOURCE_NONE);
    system.setLayerProvider(new PaintDecalProvider(() => world, PAINT_IMAGE_SOURCE_NONE));
    system.update();
    expect(system.atlas.pageCount).toBeGreaterThan(0);
    volume.visible = false;
    system.update();
    let triangles = 0;
    scene.getObjectByName('paint_overlays')?.traverse((object) => {
      if (object instanceof THREE.Mesh) triangles += object.geometry.getAttribute('position')?.count ?? 0;
    });
    expect(triangles).toBe(0);
    system.dispose();
  });

  it('reads settings into a spec', () => {
    const spec = paintDecalSpecRead({
      texture: 'grime',
      color: '#ff8000',
      blend: 'multiply',
      opacity: 0.5,
      order: -2,
      edgeFade: 0.2,
      angleFade: false,
    });
    expect(spec.color[0]).toBe(1);
    expect(spec.color[1]).toBeCloseTo(128 / 255);
    expect(spec).toMatchObject({ textureId: 'grime', blend: 'multiply', opacity: 0.5, order: -2, angleFade: false });
  });

  it('orders layers under the paint from the top down, then over it from the bottom up', () => {
    const at = (id: string, order: number) => ({ id, spec: { ...paintDecalSpecRead({}), order } });
    const sorted = [at('a', 3), at('b', -1), at('c', 1), at('d', -5), at('e', 1)].sort(paintDecalCompare);
    expect(sorted.map((entry) => entry.id)).toEqual(['b', 'd', 'c', 'e', 'a']);
  });
});
