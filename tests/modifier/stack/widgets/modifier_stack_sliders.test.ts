import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SolidModel } from '@/solid/model/solid_model.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { modifierGeneratorNodeCreate } from '@/modifier/stack/modifier_generator_node.js';
import { modifierStackCompile } from '@/modifier/stack/evaluate/modifier_stack_compile.js';
import { MODIFIER_STACK_SOLID_SCRIPT_KIND } from '@/modifier/stack/kinds/generator/solid_script/modifier_stack_solid_script_keys.js';
import { modifierStackEditSteps, modifierStackSliders } from '@/modifier/stack/widgets/modifier_stack_sliders.js';
import {
  solidScriptDocumentCreate,
  solidScriptDocumentEditModeWith,
} from '@/solid_script/document/solid_script_document.js';

/**
 * Builds a SolidScript generator in a solid, moved away from the origin, whose
 * script clamps an input and shows it with a slider; then evaluates it.
 *
 * @param editMode Has Edit Mode of the script.
 * @param height Stored Height input.
 * @returns Node and its centre.
 */
function sliderScene(editMode: boolean, height: string): { node: THREE.Mesh; centre: THREE.Vector3 } {
  const model = new SolidModel('Sliders');
  const node = modifierGeneratorNodeCreate(MODIFIER_STACK_SOLID_SCRIPT_KIND);
  node.position.set(3, 1, -2);
  model.root.add(node);
  const script = solidScriptDocumentCreate([
    { command: 'input', values: { name: 'Height', type: 'Number', default: '1' } },
    { command: 'variable', values: { name: 'Tall', value: '[=Min([Height], 2)]' } },
    { command: 'widget_slider', values: { shows: '[Tall]', writes: 'Height', at: '1, 0, 0', min: '0' } },
    { command: 'cube' },
  ]);
  const settings = ModifierVolume.read(node);
  const step = settings.modifiers[0];
  if (!step) throw new Error('no step');
  step.parameters = {
    ...step.parameters,
    script: solidScriptDocumentEditModeWith(script, editMode),
    inputs: { Height: height },
  };
  ModifierVolume.write(node, settings);
  model.root.updateMatrixWorld(true);
  modifierStackCompile(model.getBrushes(), model.root);
  return { node, centre: new THREE.Box3().setFromObject(node).getCenter(new THREE.Vector3()) };
}

describe('modifier stack sliders', () => {
  it('records the sliders of an evaluated script in world space, showing the value the script allowed', () => {
    const { node, centre } = sliderScene(true, '5');
    const [slider, ...rest] = modifierStackSliders(node);
    expect(rest).toEqual([]);
    expect(slider?.value).toBe(2);
    expect(slider?.writes).toBe('Height');
    expect(slider?.min).toBe(0);
    expect(slider?.origin.distanceTo(centre.clone().add(new THREE.Vector3(1, 0, 0)))).toBeLessThan(1e-9);
    expect(slider?.direction.distanceTo(new THREE.Vector3(0, 1, 0))).toBeLessThan(1e-9);
  });

  it('offers no edit mode and no sliders while Has Edit Mode is off', () => {
    const { node } = sliderScene(false, '1');
    expect(modifierStackEditSteps(node)).toEqual([]);
    expect(modifierStackSliders(node)).toEqual([]);
  });
});
