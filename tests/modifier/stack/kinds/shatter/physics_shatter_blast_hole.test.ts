import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { modifierGeneratorNodeCreate } from '@/modifier/stack/modifier_generator_node.js';
import { modifierGeneratorOperationCommand } from '@/modifier/stack/modifier_generator_operation.js';
import { modifierStackCompile } from '@/modifier/stack/evaluate/modifier_stack_compile.js';
import { modifierStackEntryCreate } from '@/modifier/stack/modifier_stack_settings.js';
import { physicsShatterLastRunOf } from '@/modifier/stack/kinds/shatter/physics_shatter_last_run.js';
import { physicsShatterTestExpectSound, physicsShatterTestWorst } from './fracture/physics_shatter_fixtures.js';

/**
 * Builds a 6 x 4 m wall with a bricks Blast Hole through it, filled back and
 * shattered as bricks, and returns the fill and the fracture.
 *
 * @param depth Wall depth in metres.
 * @returns Filled-back bricks and the last shatter run.
 */
function blastHoleBricks(depth: number) {
  const world = new THREE.Group();
  const model = new SolidModel('Blast hole bricks');
  world.add(model.root);
  const wall = model.addBoxBrush(1, SolidOperation.Additive, null, false);
  wall.mesh?.scale.set(6, 4, depth);
  const node = modifierGeneratorNodeCreate('blastHole');
  node.scale.z = depth;
  model.root.add(node);
  modifierGeneratorOperationCommand(node, SolidOperation.Subtractive)?.execute();
  const settings = ModifierVolume.read(node);
  const [hole, ...rest] = settings.modifiers;
  const bricks = { style: 'bricks', seed: 9, brickLength: 0.4, brickHeight: 0.2, jut: 0.5, fillBack: true };
  const shatter = modifierStackEntryCreate('physicsShatter', settings.modifiers);
  shatter.parameters = { ...shatter.parameters, material: 'brick', brickLength: 0.4, brickHeight: 0.2, mortarGap: 0 };
  ModifierVolume.write(node, {
    ...settings,
    modifiers: [{ ...hole!, parameters: { ...hole!.parameters, ...bricks } }, ...rest, shatter],
  });
  world.updateMatrixWorld(true);
  modifierStackCompile(model.getBrushes(), model.root);
  return physicsShatterLastRunOf(node.uuid, shatter.id);
}

describe('physics shatter of a Blast Hole bricks fill', () => {
  it.each([0.3, 0.6])('keeps every filled-back brick whole, one piece each, in a %s m wall', (depth) => {
    const run = blastHoleBricks(depth);
    const pieces = run?.fracture.pieces ?? [];
    expect(run?.inputBrushIds.length ?? 0).toBeGreaterThan(10);
    expect(pieces.length).toBe(new Set(pieces.map((piece) => piece.sourceBrushId)).size);
    expect(physicsShatterTestWorst(pieces).thickness).toBeGreaterThanOrEqual(0.02);
    if (run) physicsShatterTestExpectSound(run.fracture, 0.2);
  });
});
