import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { modifierGeneratorNodeCreate } from '@/modifier/stack/modifier_generator_node.js';
import { modifierBevelRefreshScene } from '@/modifier/compile/modifier_bevel_scene_refresh.js';
import { CommandModifierVolumeBake } from '@/modifier/stack/bake/command_modifier_volume_bake.js';
import { getSolidGroupOperation, isSolidCsgGroup } from '@/solid/model/solid_group.js';

/**
 * Builds a solid with a box brush and an intersecting arch generator around it.
 *
 * @returns Fixture parts and a result bounds probe.
 */
function intersectFixture() {
  const world = new THREE.Group();
  const model = new SolidModel('Bake groups');
  world.add(model.root);
  model.addBoxBrush(2, SolidOperation.Additive);
  const node = modifierGeneratorNodeCreate('arch');
  const settings = ModifierVolume.read(node);
  const [first] = settings.modifiers;
  if (!first) throw new Error('Expected the arch modifier');
  first.parameters = { ...first.parameters, operation: 'intersect' };
  ModifierVolume.write(node, settings);
  model.root.add(node);
  const bounds = () => {
    world.updateMatrixWorld(true);
    modifierBevelRefreshScene(world);
    model.rebuild();
    const geometry = model.getResultMesh().geometry;
    geometry.computeBoundingBox();
    return geometry.boundingBox?.clone() ?? new THREE.Box3();
  };
  return { world, model, node, bounds };
}

/**
 * Lists the CSG groups directly under a solid root.
 *
 * @param root Solid root.
 * @returns Groups.
 */
function rootGroups(root: THREE.Object3D): THREE.Object3D[] {
  return root.children.filter((child) => isSolidCsgGroup(child));
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

describe('baking generators that build CSG groups', () => {
  it('keeps the intersecting group, so the baked result matches the live one, and undoes and redoes it', () => {
    const fixture = intersectFixture();
    const live = fixture.bounds();
    expect(live.isEmpty()).toBe(false);
    const bake = new CommandModifierVolumeBake(fixture.node);
    bake.execute();
    const [group] = rootGroups(fixture.model.root);
    expect(group && getSolidGroupOperation(group)).toBe(SolidOperation.Intersecting);
    expect(group?.children.length).toBeGreaterThan(1);
    expectBox(fixture.bounds(), live);
    bake.undo();
    expect(rootGroups(fixture.model.root)).toHaveLength(0);
    expect(fixture.node.parent).toBe(fixture.model.root);
    expectBox(fixture.bounds(), live);
    bake.execute();
    expect(rootGroups(fixture.model.root)).toHaveLength(1);
    expectBox(fixture.bounds(), live);
  });
});
