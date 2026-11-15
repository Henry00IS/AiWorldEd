import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { modifierStackOwnerDecode } from '@/modifier/stack/owner/modifier_stack_owner.js';
import { stackFixtureEntries } from '../modifier_stack_fixture.js';
import {
  layoutBox,
  layoutGroup,
  layoutModelBuild,
  meshSignature,
} from '../../../solid/algorithm/compile/solid_csg_pass_through_fixture.js';

/**
 * Builds a wall followed by a group holding one subtractive window cutter that
 * the group's own array stack copies along the wall, and compiles it.
 *
 * @param operation Operation of the group.
 * @returns Volume of the compiled solid.
 */
function arrayedWindowsVolume(operation: SolidOperation): number {
  const { model, groups } = layoutModelBuild('ArrayedWindows', [
    layoutBox([0, 0, 0], [9, 3, 0.5]),
    layoutGroup(operation, [layoutBox([-3, 0, 0], [1, 1, 2], SolidOperation.Subtractive)]),
  ]);
  const world = new THREE.Group();
  world.add(model.root);
  modifierStackOwnerDecode(groups[0]!, {
    modifiers: stackFixtureEntries([{ kind: 'linear', parameters: { mode: 'fixed', offsetX: 3, count: 3 } }]),
  });
  world.updateMatrixWorld(true);
  model.markDirty();
  model.rebuild(true);
  return meshSignature(model).volume;
}

/** A group's own modifier stack keeps working when the group is pass-through. */
describe('modifier stacks owned by pass-through groups', () => {
  it('lets the arrayed cutters of a pass-through group cut the wall outside it', () => {
    const wallVolume = 9 * 3 * 0.5;
    const windowVolume = 1 * 1 * 0.5;
    expect(arrayedWindowsVolume(SolidOperation.Additive)).toBeCloseTo(wallVolume, 4);
    expect(arrayedWindowsVolume(SolidOperation.PassThrough)).toBeCloseTo(wallVolume - 3 * windowVolume, 4);
  });
});
