import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SolidModel } from '@/solid/model/solid_model.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { modifierGeneratorNodeCreate } from '@/modifier/stack/modifier_generator_node.js';
import { modifierStackCompile } from '@/modifier/stack/evaluate/modifier_stack_compile.js';
import { MODIFIER_STACK_SOLID_SCRIPT_KIND } from '@/modifier/stack/kinds/generator/solid_script/modifier_stack_solid_script_keys.js';
import { modifierStackAimPatch, modifierStackAims } from '@/modifier/stack/widgets/modifier_stack_aim_record.js';
import {
  solidScriptDocumentCreate,
  solidScriptDocumentEditModeWith,
} from '@/solid_script/document/solid_script_document.js';

/**
 * Builds a SolidScript generator turned a quarter about y, with a Widget
 * Direction showing its Facing input, and evaluates it.
 *
 * @returns Node.
 */
function aimScene(): THREE.Mesh {
  const model = new SolidModel('Aims');
  const node = modifierGeneratorNodeCreate(MODIFIER_STACK_SOLID_SCRIPT_KIND);
  node.rotation.y = Math.PI / 2;
  model.root.add(node);
  const script = solidScriptDocumentCreate([
    { command: 'input', values: { name: 'Facing', type: 'Vector', default: '0, 0, 1' } },
    { command: 'widget_direction', values: { shows: '[Facing]', writes: 'Facing' } },
    { command: 'cube' },
  ]);
  const settings = ModifierVolume.read(node);
  const step = settings.modifiers[0];
  if (!step) throw new Error('no step');
  step.parameters = { ...step.parameters, script: solidScriptDocumentEditModeWith(script, true), inputs: {} };
  ModifierVolume.write(node, settings);
  model.root.updateMatrixWorld(true);
  modifierStackCompile(model.getBrushes(), model.root);
  return node;
}

describe('modifier stack aims', () => {
  it('records a Widget Direction as a world arrow and writes a world direction back in script coordinates', () => {
    const node = aimScene();
    const [aim, ...rest] = modifierStackAims(node);
    expect(rest).toEqual([]);
    expect(aim?.direction.distanceTo(new THREE.Vector3(1, 0, 0))).toBeLessThan(1e-9);
    expect(aim && modifierStackAimPatch(node, aim, new THREE.Vector3(0, 0, -3))).toMatchObject({
      inputs: { Facing: '1, 0, 0' },
    });
  });
});
