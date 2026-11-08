import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { modifierGeneratorNodeCreate } from '@/modifier/stack/modifier_generator_node.js';
import { modifierStackCompile } from '@/modifier/stack/evaluate/modifier_stack_compile.js';
import { modifierStackKindFind } from '@/modifier/stack/modifier_stack_catalog.js';
import {
  modifierGeneratorOperationCommand,
  modifierGeneratorOperationRead,
  modifierGeneratorOperationToggleCommands,
} from '@/modifier/stack/modifier_generator_operation.js';

/**
 * Builds a solid with a column generator node.
 *
 * @returns Node and a function listing the operations of its compiled pieces.
 */
function generatorFixture(): { node: THREE.Mesh; pieceOperations: () => SolidOperation[] } {
  const world = new THREE.Group();
  const model = new SolidModel('Generator operation');
  world.add(model.root);
  model.addBoxBrush(1, SolidOperation.Additive);
  const node = modifierGeneratorNodeCreate('column');
  model.root.add(node);
  const pieceOperations = (): SolidOperation[] => {
    world.updateMatrixWorld(true);
    return modifierStackCompile(model.getBrushes(), model.root)
      .instances.filter((brush) => brush.id.startsWith(`${node.uuid}#`))
      .map((brush) => brush.operation);
  };
  return { node, pieceOperations };
}

describe('generator node operation', () => {
  it('defaults to additive and drives the operation its pieces inherit, with undo', () => {
    const { node, pieceOperations } = generatorFixture();
    expect(modifierGeneratorOperationRead(node)).toBe(SolidOperation.Additive);
    const command = modifierGeneratorOperationCommand(node, SolidOperation.Subtractive);
    expect(command).not.toBeNull();
    command!.execute();
    expect(modifierGeneratorOperationRead(node)).toBe(SolidOperation.Subtractive);
    const operations = pieceOperations();
    expect(operations.length).toBeGreaterThan(0);
    expect(new Set(operations)).toEqual(new Set([SolidOperation.Subtractive]));
    command!.undo();
    expect(modifierGeneratorOperationRead(node)).toBe(SolidOperation.Additive);
    expect(new Set(pieceOperations())).toEqual(new Set([SolidOperation.Additive]));
  });

  it('returns no command when the operation is already set', () => {
    const { node } = generatorFixture();
    expect(modifierGeneratorOperationCommand(node, SolidOperation.Additive)).toBeNull();
  });

  it('toggles additive and subtractive but leaves intersecting alone', () => {
    const { node } = generatorFixture();
    modifierGeneratorOperationToggleCommands([node]).forEach((command) => command.execute());
    expect(modifierGeneratorOperationRead(node)).toBe(SolidOperation.Subtractive);
    modifierGeneratorOperationToggleCommands([node]).forEach((command) => command.execute());
    expect(modifierGeneratorOperationRead(node)).toBe(SolidOperation.Additive);
    modifierGeneratorOperationCommand(node, SolidOperation.Intersecting)!.execute();
    expect(modifierGeneratorOperationToggleCommands([node])).toEqual([]);
  });

  it('keeps the stored operation of saved stacks but no longer shows it as a field', () => {
    const { node } = generatorFixture();
    const settings = ModifierVolume.read(node);
    const [first, ...rest] = settings.modifiers;
    ModifierVolume.write(node, {
      ...settings,
      modifiers: [{ ...first!, parameters: { ...first!.parameters, operation: 'subtract' } }, ...rest],
    });
    expect(ModifierVolume.read(node).modifiers[0]!.parameters['operation']).toBe('subtract');
    expect(modifierGeneratorOperationRead(node)).toBe(SolidOperation.Subtractive);
    const field = modifierStackKindFind('column')!.fields.find((candidate) => candidate.key === 'operation');
    expect(field?.hidden).toBe(true);
  });
});
