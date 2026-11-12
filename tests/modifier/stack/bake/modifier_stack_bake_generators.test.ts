import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { SceneSerializer } from '@/io/scene/scene_serializer.js';
import { SceneDeserializer } from '@/io/scene/scene_deserializer.js';
import { SolidModelRegistry } from '@/solid/model/solid_model_registry.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { modifierGeneratorNodeCreate } from '@/modifier/stack/modifier_generator_node.js';
import { modifierBevelRefreshScene } from '@/modifier/compile/modifier_bevel_scene_refresh.js';
import { CommandModifierVolumeBake } from '@/modifier/stack/bake/command_modifier_volume_bake.js';
import { stackFixture, stackFixtureEntries } from '../modifier_stack_fixture.js';

/**
 * Builds a solid with a far-away box and a column generator node.
 *
 * @returns Fixture parts and a shading probe.
 */
function columnFixture() {
  const world = new THREE.Group();
  const model = new SolidModel('Bake test');
  world.add(model.root);
  model.addBoxBrush(1, SolidOperation.Additive).mesh?.position.set(0, 0, 20);
  const node = modifierGeneratorNodeCreate('column');
  model.root.add(node);
  return { world, model, node, shade: () => shade(world, model) };
}

/**
 * Rebuilds a solid and measures its result.
 *
 * @param world Scene root.
 * @param model Solid model.
 * @returns Result bounds and how many vertex normals are smoothed.
 */
function shade(world: THREE.Object3D, model: SolidModel) {
  world.updateMatrixWorld(true);
  modifierBevelRefreshScene(world);
  model.rebuild();
  const geometry = model.getResultMesh().geometry;
  const positions = geometry.getAttribute('position');
  const normals = geometry.getAttribute('normal');
  let smooth = 0;
  const [a, b, c, n] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  for (let vertex = 0; vertex < positions.count; vertex++) {
    const first = vertex - (vertex % 3);
    a.fromBufferAttribute(positions, first);
    b.fromBufferAttribute(positions, first + 1);
    c.fromBufferAttribute(positions, first + 2);
    if (n.fromBufferAttribute(normals, vertex).dot(b.sub(a).cross(c.sub(a)).normalize()) < 0.9999) smooth++;
  }
  geometry.computeBoundingBox();
  return { smooth, box: geometry.boundingBox!.clone(), vertices: positions.count };
}

/**
 * Expects two boxes to match within a millimetre.
 *
 * @param actual Measured box.
 * @param expected Expected box.
 */
function expectBox(actual: THREE.Box3, expected: THREE.Box3): void {
  for (const key of ['min', 'max'] as const)
    for (const axis of ['x', 'y', 'z'] as const) expect(actual[key][axis]).toBeCloseTo(expected[key][axis], 3);
}

describe('baking generator pieces', () => {
  it('keeps a baked column smooth shaded, also after saving and loading', () => {
    const fixture = columnFixture();
    const live = fixture.shade();
    expect(live.smooth).toBeGreaterThan(0);
    new CommandModifierVolumeBake(fixture.node).execute();
    const baked = fixture.shade();
    expect(fixture.node.parent).toBeNull();
    expect(baked.smooth).toBe(live.smooth);
    const loaded = new THREE.Group();
    new SceneDeserializer().deserialize(new SceneSerializer().serialize(fixture.world) as never, loaded);
    const [model] = [...SolidModelRegistry.collectUnder(loaded)];
    if (!model) throw new Error('Expected the loaded solid');
    expect(shade(loaded, model).smooth).toBe(live.smooth);
  });

  it('bakes a volume together with the generator pieces it changes, and undoes both', () => {
    const fixture = columnFixture();
    const volume = ModifierVolume.create({
      modifiers: stackFixtureEntries([{ kind: 'mirror', parameters: { axis: 'x', plane: 'max' } }]),
    });
    volume.scale.set(4, 8, 4);
    fixture.world.add(volume);
    const live = fixture.shade();
    expect(live.box.max.x).toBeGreaterThan(3);
    const bake = new CommandModifierVolumeBake(volume);
    bake.execute();
    expect([volume.parent, fixture.node.parent]).toEqual([null, null]);
    const baked = fixture.shade();
    expectBox(baked.box, live.box);
    expect(baked.smooth).toBe(live.smooth);
    bake.undo();
    expect([volume.parent, fixture.node.parent]).toEqual([fixture.world, fixture.model.root]);
    expect(fixture.shade()).toMatchObject({ smooth: live.smooth, vertices: live.vertices });
  });

  it('leaves generators the volume does not touch alone', () => {
    const fixture = columnFixture();
    const volume = ModifierVolume.create({ modifiers: stackFixtureEntries(['bevel']) });
    volume.position.set(0, 0, 20);
    volume.scale.setScalar(2);
    fixture.world.add(volume);
    fixture.shade();
    new CommandModifierVolumeBake(volume).execute();
    expect(fixture.node.parent).toBe(fixture.model.root);
  });

  it('keeps the smoothing of reshaped authored brushes and new copies', () => {
    const fixture = stackFixture([
      'bevel',
      { kind: 'mirror', parameters: { axis: 'x', planeOffset: 1 } },
      { kind: 'smooth', parameters: { maxAngle: 50 } },
    ]);
    const live = shade(fixture.world, fixture.model);
    expect(live.smooth).toBeGreaterThan(0);
    new CommandModifierVolumeBake(fixture.volume).execute();
    expect(fixture.model.getBrushCount()).toBeGreaterThan(1);
    const baked = shade(fixture.world, fixture.model);
    expect(baked.smooth).toBe(live.smooth);
    expectBox(baked.box, live.box);
  });
});
