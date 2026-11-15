import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { modifierGeneratorNodeCreate } from '@/modifier/stack/modifier_generator_node.js';
import { modifierGeneratorOperationCommand } from '@/modifier/stack/modifier_generator_operation.js';
import { modifierStackCompile } from '@/modifier/stack/evaluate/modifier_stack_compile.js';
import { modifierStackEntryCreate } from '@/modifier/stack/modifier_stack_settings.js';
import { physicsShatterSimulateAction } from '@/modifier/stack/kinds/shatter/sim/physics_shatter_simulate.js';

/**
 * Builds a 6 x 4 x 0.5 m wall with a filled-back Jagged Blast Hole and a
 * concrete Physics Shatter step whose blast reaches the whole 3 x 3 m hole.
 *
 * @param seed Blast Hole seed.
 * @returns Node, shatter step id and a compile function.
 */
function jaggedWall(seed: number) {
  const world = new THREE.Group();
  const model = new SolidModel('Jagged wall');
  world.add(model.root);
  model.addBoxBrush(1, SolidOperation.Additive, null, false).mesh?.scale.set(6, 4, 0.5);
  const node = modifierGeneratorNodeCreate('blastHole');
  model.root.add(node);
  modifierGeneratorOperationCommand(node, SolidOperation.Subtractive)?.execute();
  const settings = ModifierVolume.read(node);
  const [hole, ...rest] = settings.modifiers;
  const shatter = modifierStackEntryCreate('physicsShatter', settings.modifiers);
  shatter.parameters = { ...shatter.parameters, material: 'concrete', crackSize: 0.35, duration: 2, radius: 3 };
  const filled = { ...hole!, parameters: { ...hole!.parameters, seed, fillBack: true } };
  ModifierVolume.write(node, { ...settings, modifiers: [filled, ...rest, shatter] });
  world.updateMatrixWorld(true);
  return { node, stepId: shatter.id, compile: () => modifierStackCompile(model.getBrushes(), model.root) };
}

describe('physics shatter of a Jagged Blast Hole fill', () => {
  it.each([1, 2, 3])(
    'blows every piece out of the rim on seed %s, none stuck',
    async (seed) => {
      const { node, stepId, compile } = jaggedWall(seed);
      compile();
      const statuses: string[] = [];
      await physicsShatterSimulateAction({ volume: node, stepId, commandStack: null, status: (t) => statuses.push(t) });
      expect(statuses.at(-1)).toMatch(/, 0 stuck/);
      const pieces = compile().instances.filter(
        (brush) => brush.id.startsWith(`${node.uuid}#`) && brush.visible && brush.operation === SolidOperation.Additive,
      );
      expect(pieces.length).toBeGreaterThan(20);
      const inWall = pieces.filter((piece) => {
        const center = piece.getModelSpaceBrush().computeLocalBounds().getCenter(new THREE.Vector3());
        return Math.abs(center.x) < 3 && Math.abs(center.y) < 2 && Math.abs(center.z) < 0.25;
      });
      expect(inWall).toHaveLength(0);
    },
    120_000,
  );
});
