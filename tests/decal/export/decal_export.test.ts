import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildExportScene } from '@/io/scene/builder_export_scene.js';
import { ObjExporter } from '@/io/obj/obj_exporter.js';
import { exportTargetFind } from '@/io/export/export_targets.js';
import { setTextureMapCacheForTests, TextureMapCache } from '@/texture/library/texture_map_cache.js';
import { DECAL_EXPORT_USERDATA_KEY } from '@/decal/export/builder_decal_export.js';
import { DECAL_DIRECTION_ARROW_USERDATA_KEY } from '@/decal/volume/decal_direction_arrow.js';
import { mockObjectUrlApis } from '../../texture/library/utils_object_url_test.js';
import { decalTestLevelCreate, decalTestProjector, type DecalTestLevel } from '../decal_test_fixture.js';

/**
 * Adds a downward projector over the floor next to the level's pillar.
 *
 * @param level Test level.
 * @param parameters Decal modifier parameters.
 * @returns Projector.
 */
function floorProjector(level: DecalTestLevel, parameters: Record<string, unknown>): THREE.Mesh {
  const projector = decalTestProjector('projector', parameters);
  projector.name = 'Stain';
  projector.position.set(4, 2.625, 4);
  projector.scale.set(2, 5.75, 2);
  level.world.add(projector);
  return projector;
}

/**
 * Returns every exported decal mesh.
 *
 * @param root Export scene.
 * @returns Decal meshes.
 */
function exportedDecals(root: THREE.Object3D): THREE.Mesh[] {
  const decals: THREE.Mesh[] = [];
  root.traverse((object) => {
    if (object instanceof THREE.Mesh && object.userData[DECAL_EXPORT_USERDATA_KEY] === true) decals.push(object);
  });
  return decals;
}

describe('decal export', () => {
  beforeEach(() => {
    setTextureMapCacheForTests(new TextureMapCache());
    mockObjectUrlApis();
  });
  afterEach(() => setTextureMapCacheForTests(null));

  it('writes each decal as a lifted, textured child of the model it lands on, without its volume or arrow', () => {
    const level = decalTestLevelCreate();
    floorProjector(level, { liftDistance: 0.01, opacity: 0.5 });
    const root = buildExportScene(level.world);
    const decals = exportedDecals(root);
    expect(decals.length).toBe(1);
    const decal = decals[0]!;
    expect(decal.name).toBe('Stain Decal');
    expect(decal.parent?.name).toBe(level.model.root.name || 'SolidModel');
    const material = decal.material as THREE.MeshStandardMaterial;
    expect(material.transparent).toBe(true);
    expect(material.opacity).toBe(0.5);
    expect(material.map).not.toBeNull();
    const positions = decal.geometry.getAttribute('position');
    const floorHeights = Array.from({ length: positions.count }, (_, index) => positions.getY(index)).filter(
      (y) => y < 1,
    );
    expect(floorHeights.length).toBeGreaterThan(0);
    for (const y of floorHeights) expect(y).toBeCloseTo(0.01, 4);
    root.traverse((object) => {
      expect(object.userData[DECAL_DIRECTION_ARROW_USERDATA_KEY]).toBeUndefined();
      expect(object.userData['isModifierVolume']).toBeUndefined();
    });
  });

  it('honours first hit only', () => {
    const triangles = (firstHitOnly: boolean) => {
      const level = decalTestLevelCreate();
      floorProjector(level, { firstHitOnly });
      return exportedDecals(buildExportScene(level.world))[0]?.geometry.getAttribute('position').count ?? 0;
    };
    expect(triangles(true)).not.toBe(triangles(false));
  });

  it('leaves the live scene untouched', () => {
    const level = decalTestLevelCreate();
    floorProjector(level, {});
    const before = level.model.getResultMesh().children.length;
    buildExportScene(level.world);
    expect(level.model.getResultMesh().children.length).toBe(before);
  });

  it('reaches OBJ files as their own object', async () => {
    const level = decalTestLevelCreate();
    floorProjector(level, {});
    const pkg = await new ObjExporter().exportPackage(level.world, exportTargetFind('blender').space, 'level', {
      mode: 'copy',
      folder: '',
    });
    expect(pkg.objText).toMatch(/^o Stain_Decal$/m);
  });
});
