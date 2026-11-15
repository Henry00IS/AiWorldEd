import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { getSolidGroupOperation, isSolidCsgGroup } from '@/solid/model/solid_group.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { modifierGeneratorNodeCreate } from '@/modifier/stack/modifier_generator_node.js';
import { modifierStackCompile } from '@/modifier/stack/evaluate/modifier_stack_compile.js';
import { CommandModifierVolumeBake } from '@/modifier/stack/bake/command_modifier_volume_bake.js';

/** Unique hierarchy name of a kind: its label and a hex suffix, never a number. */
const suffixed = (label: string) => new RegExp(`^${label}\\.[0-9A-F]{3,5}$`);

/**
 * Builds a solid holding one generator node with an operation.
 *
 * @param kind Generator kind.
 * @param operation Stored Operation choice.
 * @returns Fixture parts.
 */
function bakeFixture(kind: string, operation: 'add' | 'subtract' | 'intersect' = 'add') {
  const world = new THREE.Group();
  const model = new SolidModel('Bake group test');
  world.add(model.root);
  const node = modifierGeneratorNodeCreate(kind);
  const settings = ModifierVolume.read(node);
  const [first, ...rest] = settings.modifiers;
  ModifierVolume.write(node, {
    ...settings,
    modifiers: [{ ...first!, parameters: { ...first!.parameters, operation } }, ...rest],
  });
  model.root.add(node);
  world.updateMatrixWorld(true);
  const pieces = modifierStackCompile(model.getBrushes(), model.root).instances.length;
  return { world, model, node, pieces };
}

/**
 * Returns the CSG groups directly under the solid root.
 *
 * @param model Solid model.
 * @returns Groups.
 */
function groupsOf(model: SolidModel): THREE.Group[] {
  return model.root.children.filter((child): child is THREE.Group => isSolidCsgGroup(child));
}

describe('baking a generator into brushes', () => {
  for (const [operation, expected] of [
    ['add', SolidOperation.Additive],
    ['subtract', SolidOperation.Subtractive],
    ['intersect', SolidOperation.Intersecting],
  ] as const) {
    it(`puts many pieces in one ${operation} group of additive brushes named with suffix ids`, () => {
      const { model, node, pieces } = bakeFixture('column', operation);
      expect(pieces).toBeGreaterThan(1);
      new CommandModifierVolumeBake(node).execute();
      const groups = groupsOf(model);
      expect(groups).toHaveLength(1);
      const group = groups[0]!;
      expect(getSolidGroupOperation(group)).toBe(expected);
      expect(group.name).toMatch(suffixed('Column'));
      expect(model.getBrushes()).toHaveLength(pieces);
      for (const brush of model.getBrushes()) {
        expect(brush.operation).toBe(SolidOperation.Additive);
        expect(brush.name).toMatch(suffixed('Column'));
        expect(brush.mesh?.parent).toBe(group);
      }
    });
  }

  it('leaves a single piece ungrouped with the generator operation', () => {
    const { model, node, pieces } = bakeFixture('cylinder', 'subtract');
    expect(pieces).toBe(1);
    new CommandModifierVolumeBake(node).execute();
    expect(groupsOf(model)).toHaveLength(0);
    const [brush] = model.getBrushes();
    expect(brush?.operation).toBe(SolidOperation.Subtractive);
    expect(brush?.name).toMatch(suffixed('Cylinder'));
    expect(brush?.mesh?.parent).toBe(model.root);
  });

  it('undoes and redoes the whole bake, group included, as one step', () => {
    const { model, node } = bakeFixture('torus', 'subtract');
    const command = new CommandModifierVolumeBake(node);
    command.execute();
    const group = groupsOf(model)[0];
    const names = model.getBrushes().map((brush) => brush.name);
    command.undo();
    expect(groupsOf(model)).toHaveLength(0);
    expect(model.getBrushes()).toHaveLength(0);
    expect(node.parent).toBe(model.root);
    command.execute();
    expect(groupsOf(model)).toEqual([group]);
    expect(model.getBrushes().map((brush) => brush.name)).toEqual(names);
  });
});
