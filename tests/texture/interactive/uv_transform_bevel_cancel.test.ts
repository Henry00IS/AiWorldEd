import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { CommandStack } from '@/commands/command_stack.js';
import { modifierBevelRefreshScene } from '@/modifier/compile/modifier_bevel_scene_refresh.js';
import { ModifierVolumeBevel } from '@/modifier/volume/modifier_volume_bevel.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { expandFaceSelectionIndices } from '@/selection/face/solid_result_face_indices.js';
import { ControllerUvTransform } from '@/texture/interactive/controller_uv_transform.js';
import type { UvTransformMode } from '@/texture/interactive/uv_transform_mode.js';
import { getDebugCheckerTexture } from '@/texture/library/factory_debug_texture.js';
import { createTextureBrowserEntry } from '@/texture/library/texture_browser_entry.js';
import { TextureLibrary } from '@/texture/library/texture_library.js';
import { TextureMapCache, setTextureMapCacheForTests } from '@/texture/library/texture_map_cache.js';
import { GridSnap } from '@/transform/snap/grid_snap.js';
import { mockObjectUrlApis } from '../library/utils_object_url_test.js';

const CLOTH_TEXTURE_ID = 'cloth.png';

describe('UV transform cancel on a bevel', () => {
  afterEach(() => {
    setTextureMapCacheForTests(null);
    vi.restoreAllMocks();
  });

  it('keeps the volume texture when move, rotate, or scale is cancelled', () => {
    expect(modeKeepsCloth('move')).toBe(true);
    expect(modeKeepsCloth('rotate')).toBe(true);
    expect(modeKeepsCloth('scale')).toBe(true);
  });
});

/**
 * Returns whether cancelling one UV mode leaves the bevel on the volume
 * texture.
 *
 * @param mode Move, rotate, or scale.
 * @returns True when the bevel triangle still uses the cloth map.
 */
function modeKeepsCloth(mode: UvTransformMode): boolean {
  const scene = chamferedClothWorld();
  const triangle = bevelTriangle(scene.mesh);
  if (!triangleUsesCloth(scene.mesh, triangle, scene.cloth)) return false;
  if (!cancelGesture(scene.mesh, triangle, mode)) return false;
  return triangleUsesCloth(scene.mesh, triangle, scene.cloth);
}

/**
 * Builds a chamfered box whose generated faces use one library texture.
 *
 * @returns Result mesh and the resolved cloth texture.
 */
function chamferedClothWorld(): { mesh: THREE.Mesh; cloth: THREE.Texture } {
  mockObjectUrlApis('blob:bevel-cancel');
  const cache = new TextureMapCache();
  cache.setLibrary(clothLibrary());
  setTextureMapCacheForTests(cache);
  const world = new THREE.Group();
  const model = new SolidModel('BevelCancel');
  world.add(model.root);
  model.addBoxBrush(1, SolidOperation.Additive);
  const volume = ModifierVolumeBevel.create();
  volume.scale.set(4, 4, 4);
  ModifierVolumeBevel.writeTextureId(volume, CLOTH_TEXTURE_ID);
  world.add(volume);
  world.updateMatrixWorld(true);
  modifierBevelRefreshScene(world);
  return { mesh: model.getResultMesh(), cloth: cache.resolve(CLOTH_TEXTURE_ID) };
}

/**
 * Builds a library that contains the cloth texture.
 *
 * @returns Library.
 */
function clothLibrary(): TextureLibrary {
  const library = new TextureLibrary();
  const file = new File(['img'], CLOTH_TEXTURE_ID, { type: 'image/png' });
  library.replaceAll('Cloth', [createTextureBrowserEntry(file, CLOTH_TEXTURE_ID)]);
  return library;
}

/**
 * Finds a round bevel triangle.
 *
 * @param mesh Result mesh.
 * @returns Triangle index.
 */
function bevelTriangle(mesh: THREE.Mesh): number {
  const normal = mesh.geometry.getAttribute('normal');
  const count = normal.count / 3;
  for (let triangle = 0; triangle < count; triangle += 1) {
    if (!axialTriangle(normal, triangle)) return triangle;
  }
  return -1;
}

/**
 * Returns whether a triangle normal lies on a world axis.
 *
 * @param normal Normal attribute.
 * @param triangle Triangle index.
 * @returns True when the normal is axial.
 */
function axialTriangle(normal: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, triangle: number): boolean {
  const vertex = triangle * 3;
  const axial = Math.max(Math.abs(normal.getX(vertex)), Math.abs(normal.getY(vertex)), Math.abs(normal.getZ(vertex)));
  return axial > 0.95;
}

/**
 * Starts a gesture, moves the sample, and cancels it.
 *
 * @param mesh Result mesh.
 * @param triangle Seed triangle.
 * @param mode Move, rotate, or scale.
 * @returns True when the gesture started.
 */
function cancelGesture(mesh: THREE.Mesh, triangle: number, mode: UvTransformMode): boolean {
  const controller = new ControllerUvTransform(new CommandStack(4), new GridSnap(false, 1));
  const started = controller.begin(gestureArgs(mesh, triangle, mode));
  if (!started) return false;
  controller.applyWorldSample(new THREE.Vector3(0.4, 1, 0.2));
  controller.cancel();
  return true;
}

/**
 * Builds begin arguments for one bevel face.
 *
 * @param mesh Result mesh.
 * @param triangle Seed triangle.
 * @param mode Move, rotate, or scale.
 * @returns Begin arguments.
 */
function gestureArgs(mesh: THREE.Mesh, triangle: number, mode: UvTransformMode) {
  const faces = expandFaceSelectionIndices(mesh, triangle);
  return {
    mode,
    selections: faces.map((faceIndex) => ({ mesh, faceIndex })),
    worldStart: new THREE.Vector3(0, 1, 0),
    planeNormal: new THREE.Vector3(0, 1, 0),
    snapEnabled: false,
  };
}

/**
 * Returns whether a triangle is drawn with the cloth texture.
 *
 * @param mesh Result mesh.
 * @param triangle Triangle index.
 * @param cloth Resolved cloth texture.
 * @returns True when that triangle's material uses the cloth map.
 */
function triangleUsesCloth(mesh: THREE.Mesh, triangle: number, cloth: THREE.Texture): boolean {
  const map = materialMap(materialForTriangle(mesh, triangle));
  return map === cloth && cloth !== getDebugCheckerTexture();
}

/**
 * Reads the diffuse map on a material.
 *
 * @param material Material or null.
 * @returns Map, or null.
 */
function materialMap(material: THREE.Material | null): THREE.Texture | null {
  if (!material || !('map' in material)) return null;
  const map = material.map;
  return map instanceof THREE.Texture ? map : null;
}

/**
 * Returns the material that draws one triangle.
 *
 * @param mesh Result mesh.
 * @param triangle Triangle index.
 * @returns Material, or null.
 */
function materialForTriangle(mesh: THREE.Mesh, triangle: number): THREE.Material | null {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const group = mesh.geometry.groups.find((entry) => groupOwnsTriangle(entry, triangle));
  const index = group?.materialIndex ?? 0;
  return materials[index] ?? null;
}

/**
 * Returns whether a geometry group covers a triangle.
 *
 * @param group Geometry group.
 * @param triangle Triangle index.
 * @returns True when the triangle starts inside the group.
 */
function groupOwnsTriangle(group: THREE.BufferGeometry['groups'][number], triangle: number): boolean {
  const start = triangle * 3;
  return start >= group.start && start < group.start + group.count;
}
