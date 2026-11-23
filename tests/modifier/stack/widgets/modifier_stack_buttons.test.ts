import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SolidModel } from '@/solid/model/solid_model.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { modifierGeneratorNodeCreate } from '@/modifier/stack/modifier_generator_node.js';
import { modifierStackCompile } from '@/modifier/stack/evaluate/modifier_stack_compile.js';
import { MODIFIER_STACK_SOLID_SCRIPT_KIND } from '@/modifier/stack/kinds/generator/solid_script/modifier_stack_solid_script_keys.js';
import {
  modifierStackButtonPress,
  modifierStackButtons,
} from '@/modifier/stack/widgets/modifier_stack_button_record.js';
import { modifierStackDraws } from '@/modifier/stack/widgets/modifier_stack_draw_record.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';

/**
 * Builds a SolidScript generator moved away from the origin with Has Edit Mode
 * on, and evaluates it.
 *
 * @param lines Script lines.
 * @param inputs Stored inputs.
 * @param editMode Has Edit Mode of the script.
 * @returns Node and its centre.
 */
function scene(lines: SolidScriptLine[], inputs: Record<string, string> = {}, editMode = true) {
  const model = new SolidModel('Buttons');
  const node = modifierGeneratorNodeCreate(MODIFIER_STACK_SOLID_SCRIPT_KIND);
  node.position.set(3, 1, -2);
  model.root.add(node);
  const settings = ModifierVolume.read(node);
  const step = settings.modifiers[0]!;
  step.parameters = { ...step.parameters, script: { ...solidScriptDocumentCreate(lines), editMode }, inputs };
  ModifierVolume.write(node, settings);
  model.root.updateMatrixWorld(true);
  modifierStackCompile(model.getBrushes(), model.root);
  return { node, centre: new THREE.Box3().setFromObject(node).getCenter(new THREE.Vector3()) };
}

const RAILS: SolidScriptLine = { command: 'input', values: { name: 'ShowRails', type: 'Switch', default: 'No' } };
const PICK: SolidScriptLine = { command: 'input', values: { name: 'PickRails', type: 'Button' } };

describe('modifier stack buttons and drawings', () => {
  it('records a toggle in the world and flips the Switch it writes in one patch', () => {
    const { node, centre } = scene([
      RAILS,
      { command: 'widget_toggle', values: { shows: '[ShowRails]', writes: 'ShowRails', at: '0, 1, 0' } },
      { command: 'cube' },
    ]);
    const [toggle, ...rest] = modifierStackButtons(node);
    expect(rest).toEqual([]);
    expect([toggle?.kind, toggle?.label, toggle?.on]).toEqual(['Toggle', 'Show Rails', false]);
    expect(toggle?.at.distanceTo(centre.clone().add(new THREE.Vector3(0, 1, 0)))).toBeLessThan(1e-9);
    expect(modifierStackButtonPress(node, toggle!)).toEqual({
      patch: { inputs: { ShowRails: 'Yes' } },
      notices: [],
      error: null,
    });
  });

  it('presses a Button Input, keeps the Persistent value its When Button Pressed sets and passes on its messages', () => {
    const { node } = scene([
      PICK,
      { command: 'when_button_pressed', values: { name: 'PickRails' } },
      { command: 'variable', values: { name: 'Persistent.Page', value: 'Rails' } },
      { command: 'show_message', values: { text: 'Rails picked' } },
      { command: 'end' },
      { command: 'widget_button', values: { writes: 'PickRails' } },
      { command: 'cube' },
    ]);
    const [button] = modifierStackButtons(node);
    const pressed = modifierStackButtonPress(node, button!);
    expect(JSON.stringify(pressed?.patch)).toContain('Rails');
    expect(pressed?.notices).toEqual(['Rails picked']);
  });

  it('records Debug Draw in the world, also without an edit mode', () => {
    const { node, centre } = scene(
      [{ command: 'debug_draw', values: { shape: 'Line', at: '0, 0, 0', to: '1, 0, 0' } }, { command: 'cube' }],
      {},
      false,
    );
    const [draw, ...rest] = modifierStackDraws(node);
    expect(rest).toEqual([]);
    expect(draw?.segments[0]?.[0].distanceTo(centre)).toBeLessThan(1e-9);
    expect(modifierStackButtons(node)).toEqual([]);
  });
});
