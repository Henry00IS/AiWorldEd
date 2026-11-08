import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GlbExporter } from '@/io/glb/glb_exporter.js';
import { ObjExporter } from '@/io/obj/obj_exporter.js';
import { FbxExporter } from '@/io/fbx/fbx_exporter.js';
import { ModifierVolumeBevel } from '@/modifier/volume/modifier_volume_bevel.js';
import { modifierBevelOptionsWrite } from '@/modifier/volume/modifier_volume_bevel_options.js';
import { stackFixture } from '../../modifier/stack/modifier_stack_fixture.js';

/**
 * Builds a box with a round bevel and returns the scene.
 *
 * @param normals Strip normals.
 * @returns World group and the model's result geometry.
 */
function bevelled(normals: 'flat' | 'smooth') {
  const fixture = stackFixture(['bevel']);
  ModifierVolumeBevel.writeDistance(fixture.volume, 0.2);
  ModifierVolumeBevel.writeSegments(fixture.volume, 4);
  modifierBevelOptionsWrite(fixture.volume, { profile: 0.5, normals });
  fixture.refresh();
  fixture.model.rebuild();
  return { world: fixture.world, geometry: fixture.model.getResultMesh().geometry };
}

/**
 * Returns the distinct normal directions in a flat xyz list, rounded.
 *
 * @param values Normal components.
 * @returns Sorted direction keys.
 */
function directions(values: ArrayLike<number>): string[] {
  const keys = new Set<string>();
  for (let at = 0; at + 2 < values.length; at += 3)
    keys.add([0, 1, 2].map((axis) => (Number(values[at + axis]) + 0).toFixed(3).replace('-0.000', '0.000')).join(','));
  return [...keys].sort();
}

/**
 * Reads the normals of every mesh in a GLB.
 *
 * @param buffer GLB data.
 * @returns Normal components.
 */
async function glbNormals(buffer: ArrayBuffer): Promise<number[]> {
  const gltf = await new GLTFLoader().parseAsync(buffer, '');
  const out: number[] = [];
  gltf.scene.traverse((object) => {
    const normal = object instanceof THREE.Mesh ? object.geometry.getAttribute('normal') : null;
    if (normal) out.push(...Array.from(normal.array as ArrayLike<number>));
  });
  return out;
}

/**
 * Builds a 16-sided column with smooth shading or flat.
 *
 * @param smoothAngle Max angle; 0 is flat.
 * @returns World group and the model's result geometry.
 */
function column(smoothAngle: number) {
  const fixture = stackFixture([{ kind: 'column', parameters: { sides: '16', smoothAngle } }], 2);
  fixture.refresh();
  fixture.model.rebuild();
  return { world: fixture.world, geometry: fixture.model.getResultMesh().geometry };
}

/**
 * Checks every exporter writes exactly the result mesh's normal directions.
 *
 * @param scene Scene and its result geometry.
 * @param scene.world World group.
 * @param scene.geometry Result geometry.
 */
async function expectExported(scene: { world: THREE.Group; geometry: THREE.BufferGeometry }): Promise<void> {
  const expected = directions(scene.geometry.getAttribute('normal').array);
  expect(directions(await glbNormals(await new GlbExporter().export(scene.world)))).toEqual(expected);
  const vn = new ObjExporter()
    .export(scene.world)
    .split('\n')
    .filter((line) => line.startsWith('vn '))
    .flatMap((line) => line.slice(3).split(' ').map(Number));
  expect(directions(vn)).toEqual(expected);
  const block = /Normals: \*\d+ \{\s*a: ([^}]*)\}/.exec(new FbxExporter().export(scene.world))?.[1] ?? '';
  expect(directions(block.split(',').map(Number))).toEqual(expected);
}

describe('exported smooth shading', () => {
  it('keeps smooth-shaded column normals in GLB, OBJ and FBX', async () => {
    const smooth = column(60);
    expect(directions(smooth.geometry.getAttribute('normal').array)).not.toEqual(
      directions(column(0).geometry.getAttribute('normal').array),
    );
    await expectExported(smooth);
  });

  it('keeps the smoothed bevel strip normals in GLB, OBJ and FBX', async () => {
    const smooth = bevelled('smooth');
    expect(directions(smooth.geometry.getAttribute('normal').array)).not.toEqual(
      directions(bevelled('flat').geometry.getAttribute('normal').array),
    );
    await expectExported(smooth);
  });
});
