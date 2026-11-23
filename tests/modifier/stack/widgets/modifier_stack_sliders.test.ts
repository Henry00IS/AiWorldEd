import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SolidModel } from '@/solid/model/solid_model.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { modifierGeneratorNodeCreate } from '@/modifier/stack/modifier_generator_node.js';
import { modifierStackCompile } from '@/modifier/stack/evaluate/modifier_stack_compile.js';
import { MODIFIER_STACK_SOLID_SCRIPT_KIND } from '@/modifier/stack/kinds/generator/solid_script/modifier_stack_solid_script_keys.js';
import {
  modifierStackEditSteps,
  modifierStackPathPatch,
  modifierStackPaths,
  modifierStackSliderPatch,
  modifierStackSliders,
} from '@/modifier/stack/widgets/modifier_stack_sliders.js';
import {
  solidScriptDocumentCreate,
  solidScriptDocumentEditModeWith,
} from '@/solid_script/document/solid_script_document.js';
import { pathAssetDecode, pathAssetEncode, type PathAsset } from '@/path/model/path_asset.js';

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

  it('writes a drag on one face of a Widget Size into that part of the Vector Input', () => {
    const node = modifierGeneratorNodeCreate(MODIFIER_STACK_SOLID_SCRIPT_KIND);
    const model = new SolidModel('Size');
    model.root.add(node);
    const script = solidScriptDocumentCreate([
      { command: 'input', values: { name: 'BoxSize', type: 'Vector', default: '1, 1, 1' } },
      { command: 'widget_size', values: { shows: '[BoxSize]', writes: 'BoxSize' } },
      { command: 'cube', values: { size: '[BoxSize]' } },
    ]);
    const settings = ModifierVolume.read(node);
    const step = settings.modifiers[0];
    if (!step) throw new Error('no step');
    step.parameters = {
      ...step.parameters,
      script: solidScriptDocumentEditModeWith(script, true),
      inputs: { BoxSize: '2, 1, 4' },
    };
    ModifierVolume.write(node, settings);
    modifierStackCompile(model.getBrushes(), model.root);
    const top = modifierStackSliders(node)[2];
    expect(top?.value).toBe(1);
    expect(top && modifierStackSliderPatch(node, top, 3)).toMatchObject({ inputs: { BoxSize: '2, 3, 4' } });
  });

  it('offers no edit mode and no sliders while Has Edit Mode is off', () => {
    const { node } = sliderScene(false, '1');
    expect(modifierStackEditSteps(node)).toEqual([]);
    expect(modifierStackSliders(node)).toEqual([]);
  });

  it('gives Stairs a Landing and a Target Rise handle that write its parameters', () => {
    const model = new SolidModel('Stairs');
    const node = modifierGeneratorNodeCreate('stairs');
    node.position.set(3, 1, -2);
    model.root.add(node);
    model.root.updateMatrixWorld(true);
    modifierStackCompile(model.getBrushes(), model.root);
    const box = new THREE.Box3().setFromObject(node);
    const centre = box.getCenter(new THREE.Vector3());
    const [landing, rise, ...rest] = modifierStackSliders(node);
    expect(rest).toEqual([]);
    expect([landing?.label, landing?.value, landing?.writes, landing?.target]).toEqual([
      'Landing',
      0,
      'landing',
      'parameter',
    ]);
    expect(landing?.origin.distanceTo(new THREE.Vector3(centre.x, box.max.y, box.max.z))).toBeLessThan(1e-9);
    expect(landing?.direction.distanceTo(new THREE.Vector3(0, 0, -1))).toBeLessThan(1e-9);
    expect([rise?.label, rise?.value, rise?.writes, rise?.min]).toEqual(['Target Rise', 0.125, 'rise', 0.01]);
    expect(rise?.origin.distanceTo(new THREE.Vector3(centre.x, box.min.y, box.min.z))).toBeLessThan(1e-9);
    expect(rise?.direction.distanceTo(new THREE.Vector3(0, 1, 0))).toBeLessThan(1e-9);
    expect(landing && modifierStackSliderPatch(node, landing, 0.5)).toEqual({ landing: 0.5 });
  });

  it('records the Path inputs of a script with their stored path and the frame that places them', () => {
    const model = new SolidModel('Paths');
    const node = modifierGeneratorNodeCreate(MODIFIER_STACK_SOLID_SCRIPT_KIND);
    node.position.set(3, 1, -2);
    model.root.add(node);
    const stored: PathAsset = {
      points: [
        [0, 0, 0],
        [2, 0, 0],
        [2, 0, 2],
      ],
      segments: [{ kind: 'Straight' }, { kind: 'Arc', degrees: 90, axis: [0, 1, 0] }],
      closed: false,
    };
    const script = solidScriptDocumentCreate([
      { command: 'input', values: { name: 'Rail', type: 'Path' } },
      { command: 'input', values: { name: 'Off', type: 'Path' }, off: true },
      { command: 'cube' },
    ]);
    const settings = ModifierVolume.read(node);
    const step = settings.modifiers[0];
    if (!step) throw new Error('no step');
    step.parameters = {
      ...step.parameters,
      script: { ...script, editMode: true },
      inputs: { Rail: pathAssetEncode(stored) },
    };
    ModifierVolume.write(node, settings);
    model.root.updateMatrixWorld(true);
    modifierStackCompile(model.getBrushes(), model.root);
    const [rail, ...rest] = modifierStackPaths(node);
    expect(rest).toEqual([]);
    expect([rail?.name, rail?.label, rail?.stepId]).toEqual(['Rail', 'Rail', step.id]);
    expect(rail?.path).toEqual(stored);
    const centre = new THREE.Box3().setFromObject(node).getCenter(new THREE.Vector3());
    expect(new THREE.Vector3().applyMatrix4(rail?.frame ?? new THREE.Matrix4()).distanceTo(centre)).toBeLessThan(1e-9);
    const moved: PathAsset = { ...stored, segments: [...stored.segments, { kind: 'Straight' }], closed: true };
    const patch = rail && modifierStackPathPatch(node, rail, moved);
    expect(pathAssetDecode(String((patch?.['inputs'] as Record<string, string>)['Rail']))).toEqual(moved);
  });
});
