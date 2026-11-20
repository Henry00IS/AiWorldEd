import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { modifierGeneratorNodeCreate } from '@/modifier/stack/modifier_generator_node.js';
import { modifierStackSolidScriptHostMode } from '@/modifier/stack/kinds/generator/solid_script/modifier_stack_solid_script_host_mode.js';
import { MODIFIER_STACK_SOLID_SCRIPT_KIND } from '@/modifier/stack/kinds/generator/solid_script/modifier_stack_solid_script_keys.js';
import { markAsSolidCsgGroup, setSolidGroupOperation } from '@/solid/model/solid_group.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';

/**
 * Stores the Operation of a generator node's first step.
 *
 * @param node Generator node.
 * @param operation Stored choice: add, subtract or intersect.
 */
function generatorOperation(node: THREE.Object3D, operation: string): void {
  const settings = ModifierVolume.read(node);
  const [first, ...rest] = settings.modifiers;
  if (!first) throw new Error('Expected the generator modifier');
  ModifierVolume.write(node, {
    ...settings,
    modifiers: [{ ...first, parameters: { ...first.parameters, operation } }, ...rest],
  });
}

describe('SolidScript host mode', () => {
  it('reads Additive, Subtractive and Intersecting from a generator node', () => {
    const node = modifierGeneratorNodeCreate(MODIFIER_STACK_SOLID_SCRIPT_KIND);
    expect(modifierStackSolidScriptHostMode(node)).toBe('Additive');
    generatorOperation(node, 'subtract');
    expect(modifierStackSolidScriptHostMode(node)).toBe('Subtractive');
    generatorOperation(node, 'intersect');
    expect(modifierStackSolidScriptHostMode(node)).toBe('Intersecting');
  });

  it('reads every brush mode, and Pass-Through from a group', () => {
    const model = new SolidModel('Host mode');
    const additive = model.addBoxBrush(1, SolidOperation.Additive).mesh as THREE.Mesh;
    const subtractive = model.addBoxBrush(1, SolidOperation.Subtractive).mesh as THREE.Mesh;
    const intersecting = model.addBoxBrush(1, SolidOperation.Intersecting).mesh as THREE.Mesh;
    expect(modifierStackSolidScriptHostMode(additive)).toBe('Additive');
    expect(modifierStackSolidScriptHostMode(subtractive)).toBe('Subtractive');
    expect(modifierStackSolidScriptHostMode(intersecting)).toBe('Intersecting');
    const group = new THREE.Group();
    markAsSolidCsgGroup(group, SolidOperation.PassThrough);
    setSolidGroupOperation(group, SolidOperation.PassThrough);
    expect(modifierStackSolidScriptHostMode(group)).toBe('Pass-Through');
    expect(modifierStackSolidScriptHostMode(new THREE.Group())).toBe('Additive');
  });
});
