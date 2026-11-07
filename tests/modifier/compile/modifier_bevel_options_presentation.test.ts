import { describe, it, expect } from 'vitest';
import { Group } from 'three';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { ModifierVolumeBevel } from '@/modifier/volume/modifier_volume_bevel.js';
import { modifierBevelOptionsWrite } from '@/modifier/volume/modifier_volume_bevel_options.js';
import { modifierBevelRefreshScene } from '@/modifier/compile/modifier_bevel_scene_refresh.js';
import { isContentViewLitMaterial } from '@/materials/factory_content_view_lit_material.js';
import { getTextureMapCache } from '@/texture/library/texture_map_cache.js';

/**
 * New controls must reach the final rendered mesh, including cached/partial
 * presentation updates.
 */
describe('bevel option mesh presentation', () => {
  it('carries independent cap textures through initial and partial rebuilds and parent repainting', () => {
    const scene = presentationFixture(true);
    scene.brush.setAllFacesTextureId('cap.jpg');
    modifierBevelOptionsWrite(scene.volume, { corner: 'patch', capProjection: 'axis', capTextureId: 'cap.jpg' });
    ModifierVolumeBevel.writeTextureId(scene.volume, 'stripes.jpg');
    modifierBevelRefreshScene(scene.world);
    expect(presentedTextures(scene.model)).toEqual(['cap.jpg', 'photo.jpg', 'stripes.jpg']);
    scene.brush.setAllFacesTextureId('new-photo.jpg');
    scene.model.refreshBrushPresentations([scene.brush.id]);
    expect(presentedTextures(scene.model)).toEqual(['cap.jpg', 'new-photo.jpg', 'photo.jpg', 'stripes.jpg']);
    ModifierVolumeBevel.writeSegments(scene.volume, 16);
    modifierBevelRefreshScene(scene.world);
    expect(presentedTextures(scene.model)).toEqual(['cap.jpg', 'new-photo.jpg', 'photo.jpg', 'stripes.jpg']);
  });
  it('smooths the actual result normal buffer without moving positions or UVs', () => {
    const scene = presentationFixture(false);
    modifierBevelRefreshScene(scene.world);
    const mesh = scene.model.getResultMesh();
    const normal = mesh.geometry.getAttribute('normal').array.slice();
    const position = mesh.geometry.getAttribute('position').array.slice();
    const uv = mesh.geometry.getAttribute('uv').array.slice();
    modifierBevelOptionsWrite(scene.volume, { normals: 'smooth' });
    modifierBevelRefreshScene(scene.world);
    expect(mesh.geometry.getAttribute('normal').array).not.toEqual(normal);
    expect(mesh.geometry.getAttribute('position').array).toEqual(position);
    expect(mesh.geometry.getAttribute('uv').array).toEqual(uv);
  });
});

/**
 * Creates a bevelled solid plus an optional distant untouched brush for partial
 * buffers.
 *
 * @param whole Cover all authored corners instead of one strip.
 */
function presentationFixture(whole: boolean) {
  const world = new Group(),
    model = new SolidModel('bevel-options-presentation');
  const brush = model.addBoxBrush();
  brush.setAllFacesTextureId('photo.jpg');
  if (whole) {
    const distant = model.addBoxBrush(1, SolidOperation.Additive, null, false);
    distant.mesh?.position.set(3, 0, 0);
    distant.setAllFacesTextureId('photo.jpg');
  }
  const volume = ModifierVolumeBevel.create();
  if (whole) volume.scale.setScalar(2);
  else {
    volume.position.set(0.5, 0.5, 0);
    volume.scale.setScalar(0.4);
  }
  ModifierVolumeBevel.writeDistance(volume, 0.1);
  ModifierVolumeBevel.writeSegments(volume, 8);
  world.add(model.root, volume);
  world.updateMatrixWorld(true);
  return { world, model, brush, volume };
}

/**
 * Reads the final material presentation mappings, not intermediate surface
 * resolvers.
 *
 * @param model Live solid model.
 */
function presentedTextures(model: SolidModel): string[] {
  const material = model.getResultMesh().material;
  const materials = Array.isArray(material) ? material : [material];
  return ['cap.jpg', 'new-photo.jpg', 'photo.jpg', 'stripes.jpg']
    .filter((id) =>
      materials.some((entry) => isContentViewLitMaterial(entry) && entry.map === getTextureMapCache().resolve(id)),
    )
    .sort();
}
