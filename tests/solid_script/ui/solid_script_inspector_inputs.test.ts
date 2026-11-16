import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { curveDecode } from '@/curve/model/curve_codec.js';
import { curveEditorCloseActive } from '@/curve/ui/curve_editor.js';
import { CommandStack } from '@/commands/command_stack.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { modifierGeneratorNodeCreate } from '@/modifier/stack/modifier_generator_node.js';
import { modifierStackKindFind } from '@/modifier/stack/modifier_stack_catalog.js';
import {
  MODIFIER_STACK_SOLID_SCRIPT_INPUTS_KEY,
  MODIFIER_STACK_SOLID_SCRIPT_KIND,
} from '@/modifier/stack/kinds/generator/solid_script/modifier_stack_kind_solid_script.js';
import { modifierStackSolidScriptLayout } from '@/modifier/stack/kinds/generator/solid_script/modifier_stack_solid_script_layout.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { ModifierStackFieldRows } from '@/modifier/stack/ui/modifier_stack_field_rows.js';
import {
  solidScriptDocumentCreate,
  solidScriptDocumentNormalize,
  type SolidScriptLine,
} from '@/solid_script/document/solid_script_document.js';

/** A script with a count, a switch and a choice input. */
const SOLID_SCRIPT_INPUT_LINES: SolidScriptLine[] = [
  { command: 'input', values: { name: 'steps', type: 'count', default: '2', min: '1', max: '8', label: 'Steps' } },
  { command: 'input', values: { name: 'rails', type: 'switch', default: 'no', label: 'Rails' } },
  { command: 'input', values: { name: 'look', type: 'choice', default: 'plain', choices: 'plain, fancy' } },
  { command: 'repeat', values: { variable: 'i', from: '1', to: '[steps]' } },
  { command: 'cube' },
  { command: 'end' },
];

/**
 * Renders the inspector rows of a SolidScript generator holding a script.
 *
 * @param lines Script lines.
 * @returns Fixture parts.
 */
function inputsFixture(lines: SolidScriptLine[]) {
  const node = modifierGeneratorNodeCreate(MODIFIER_STACK_SOLID_SCRIPT_KIND);
  new THREE.Group().add(node);
  const settings = ModifierVolume.read(node);
  const [first] = settings.modifiers;
  if (!first) throw new Error('Expected the generator modifier');
  ModifierVolume.write(node, {
    ...settings,
    modifiers: [{ ...first, parameters: { ...first.parameters, script: solidScriptDocumentCreate(lines, 'Inputs') } }],
  });
  const commandStack = new CommandStack(50);
  const kind = modifierStackKindFind(MODIFIER_STACK_SOLID_SCRIPT_KIND);
  if (!kind) throw new Error('Expected the SolidScript kind');
  const parameters = () => kind.normalizeParameters(ModifierVolume.read(node).modifiers[0]?.parameters ?? {});
  const rows = new ModifierStackFieldRows(
    kind.fields,
    () => undefined,
    () => [],
    {},
    (status) => ({ volume: node, stepId: first.id, commandStack, status, refresh: () => rows.update(parameters()) }),
  );
  document.body.append(rows.getElement());
  rows.update(parameters());
  const panel = rows.getElement().querySelector<HTMLElement>('[data-solid-script-inputs]');
  if (!panel) throw new Error('Expected the inputs rows');
  const solids = () => {
    const current = parameters();
    return modifierStackSolidScriptLayout(
      solidScriptDocumentNormalize(current['script']),
      'origin',
      new THREE.Box3(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1)),
      SolidOperation.Additive,
      undefined,
      current[MODIFIER_STACK_SOLID_SCRIPT_INPUTS_KEY] as Record<string, string>,
    ).nodes.length;
  };
  return { panel, rows, commandStack, parameters, solids };
}

describe('SolidScript inspector inputs', () => {
  it('shows a curve input as a curve field and stores the edited curve as text', () => {
    const { panel, parameters } = inputsFixture([
      { command: 'input', values: { name: 'profile', type: 'curve', default: '', label: 'Profile' } },
      { command: 'cube' },
    ]);
    const field = panel.querySelector<HTMLElement>('[data-solid-script-curve] [role="button"]');
    if (!field) throw new Error('Expected a curve field');
    expect(panel.textContent).toContain('Profile');
    field.click();
    const select = document.querySelector<HTMLSelectElement>('[data-curve-editor] select[aria-label="Curve presets"]');
    if (!select) throw new Error('Expected the preset menu');
    select.value = 'baluster';
    select.dispatchEvent(new Event('change'));
    curveEditorCloseActive();
    const stored = (parameters()[MODIFIER_STACK_SOLID_SCRIPT_INPUTS_KEY] as Record<string, string>)['profile'];
    expect(curveDecode(stored)?.points.length).toBeGreaterThan(2);
  });

  it('shows a texture input as a texture picker and stores the picked id, empty for Default', () => {
    const { panel, parameters } = inputsFixture([
      { command: 'input', values: { name: 'look', type: 'texture', default: 'brick', label: 'Wall Texture' } },
      { command: 'texture', values: { texture: '[look]' } },
      { command: 'cube' },
      { command: 'end' },
    ]);
    const select = panel.querySelector<HTMLSelectElement>('[data-solid-script-texture] select');
    if (!select) throw new Error('Expected a texture picker');
    expect(panel.textContent).toContain('Wall Texture');
    expect(select.value).toBe('brick');
    select.value = 'default';
    select.dispatchEvent(new Event('change'));
    expect((parameters()[MODIFIER_STACK_SOLID_SCRIPT_INPUTS_KEY] as Record<string, string>)['look']).toBe('');
  });

  it('shows a vector input as X, Y and Z fields on one row and stores the three numbers', () => {
    const { panel, parameters } = inputsFixture([
      { command: 'input', values: { name: 'size', type: 'vector', default: '1, 2, 3', label: 'Size' } },
      { command: 'cube', values: { size: '[size]' } },
    ]);
    const fields = ['X', 'Y', 'Z'].map((axis) =>
      panel.querySelector<HTMLInputElement>(`input[aria-label="Size ${axis}"]`),
    );
    expect(fields.map((field) => field?.value)).toEqual(['1.00', '2.00', '3.00']);
    fields[1]!.value = '5';
    fields[1]!.dispatchEvent(new Event('change'));
    expect(parameters()[MODIFIER_STACK_SOLID_SCRIPT_INPUTS_KEY]).toEqual({ size: '1, 5, 3' });
  });

  it('shows the title of an Input Group above its rows and an Input Note as a line of text', () => {
    const { panel, parameters } = inputsFixture([
      { command: 'input_note', values: { text: 'Sizes are in metres.' } },
      { command: 'input_group', values: { title: 'Steps' } },
      { command: 'input', values: { name: 'steps', type: 'count', default: '2', label: 'Steps Count' } },
      { command: 'end' },
      { command: 'cube' },
    ]);
    const text = panel.textContent ?? '';
    expect(text.indexOf('Sizes are in metres.')).toBeGreaterThanOrEqual(0);
    expect(text.indexOf('Sizes are in metres.')).toBeLessThan(text.indexOf('Steps'));
    expect(text.indexOf('Steps')).toBeLessThan(text.indexOf('Steps Count'));
    expect(panel.querySelector('[data-solid-script-group="Steps"]')).not.toBeNull();
    const steps = panel.querySelector<HTMLInputElement>('input[aria-label="Steps Count"]')!;
    expect(steps.value).toBe('2');
    steps.value = '3';
    steps.dispatchEvent(new Event('change'));
    expect(parameters()[MODIFIER_STACK_SOLID_SCRIPT_INPUTS_KEY]).toEqual({ steps: '3' });
  });

  it('puts the inputs of an Input Row side by side and shows Show Inputs When rows only while the condition holds', () => {
    const { panel } = inputsFixture([
      { command: 'input', values: { name: 'rails', type: 'switch', default: 'no', label: 'Rails' } },
      { command: 'show_inputs_when', values: { name: 'rails', value: 'yes' } },
      { command: 'input_group', values: { title: 'Railing' } },
      { command: 'input_row' },
      { command: 'input', values: { name: 'railHeight', type: 'number', default: '1', label: 'Rail Height' } },
      { command: 'input', values: { name: 'railWidth', type: 'number', default: '0.1', label: 'Rail Width' } },
      { command: 'end' },
      { command: 'end' },
      { command: 'end' },
      { command: 'cube' },
    ]);
    const row = panel.querySelector<HTMLElement>('[data-solid-script-row]');
    expect(row?.querySelectorAll('input')).toHaveLength(2);
    expect(row?.style.display).toBe('none');
    expect(panel.querySelector<HTMLElement>('[data-solid-script-group="Railing"]')?.style.display).toBe('none');
    const rails = panel.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    rails.checked = true;
    rails.dispatchEvent(new Event('change'));
    expect(panel.querySelector<HTMLElement>('[data-solid-script-row]')?.style.display).not.toBe('none');
    expect(panel.querySelector<HTMLElement>('[data-solid-script-group="Railing"]')?.style.display).not.toBe('none');
  });

  it('shows one control per Input line with its default', () => {
    const { panel } = inputsFixture(SOLID_SCRIPT_INPUT_LINES);
    expect(panel.style.display).toBe('');
    expect(panel.textContent).toContain('Steps');
    expect(panel.textContent).toContain('Rails');
    expect(panel.textContent).toContain('look');
    expect(panel.querySelector<HTMLInputElement>('input[aria-label="Steps"]')?.value).toBe('2');
    expect(panel.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked).toBe(false);
    expect(panel.querySelector<HTMLSelectElement>('select')?.value).toBe('plain');
  });

  it('stores a changed value as one undo step and rebuilds with it, clamped to the limits', () => {
    const { panel, commandStack, parameters, solids } = inputsFixture(SOLID_SCRIPT_INPUT_LINES);
    expect(solids()).toBe(2);
    const steps = panel.querySelector<HTMLInputElement>('input[aria-label="Steps"]')!;
    steps.value = '5';
    steps.dispatchEvent(new Event('change'));
    expect(parameters()[MODIFIER_STACK_SOLID_SCRIPT_INPUTS_KEY]).toEqual({ steps: '5' });
    expect(solids()).toBe(5);
    steps.value = '99';
    steps.dispatchEvent(new Event('change'));
    expect(parameters()[MODIFIER_STACK_SOLID_SCRIPT_INPUTS_KEY]).toEqual({ steps: '8' });
    const rails = panel.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    rails.checked = true;
    rails.dispatchEvent(new Event('change'));
    expect(parameters()[MODIFIER_STACK_SOLID_SCRIPT_INPUTS_KEY]).toEqual({ steps: '8', rails: 'yes' });
    commandStack.undo();
    commandStack.undo();
    expect(parameters()[MODIFIER_STACK_SOLID_SCRIPT_INPUTS_KEY]).toEqual({ steps: '5' });
  });

  it('hides the rows when the script has no inputs', () => {
    const { panel } = inputsFixture([{ command: 'cube' }]);
    expect(panel.style.display).toBe('none');
  });

  it('runs When Input Changes and When Button Pressed, shows their messages and stores one undo step', () => {
    const { panel, commandStack, parameters } = inputsFixture([
      { command: 'input', values: { name: 'steps', type: 'count', default: '4' } },
      { command: 'input', values: { name: 'reset', type: 'button', label: 'Reset Steps' } },
      { command: 'when_input_changes', values: { name: 'steps' } },
      { command: 'if', values: { condition: '[steps] > 6' } },
      { command: 'set_input', values: { name: 'steps', value: '6' } },
      { command: 'show_message', values: { text: 'Steps is limited to 6' } },
      { command: 'end' },
      { command: 'end' },
      { command: 'when_button_pressed', values: { name: 'reset' } },
      { command: 'set_input', values: { name: 'steps', value: '2' } },
      { command: 'end' },
      { command: 'cube' },
    ]);
    const steps = panel.querySelector<HTMLInputElement>('input[aria-label="Steps"]')!;
    steps.value = '9';
    steps.dispatchEvent(new Event('change'));
    expect(parameters()[MODIFIER_STACK_SOLID_SCRIPT_INPUTS_KEY]).toEqual({ steps: '6' });
    expect(panel.querySelector('[data-solid-script-notices]')?.textContent).toBe('Steps is limited to 6');
    const button = panel.querySelector<HTMLButtonElement>('[data-solid-script-button="reset"]')!;
    expect(button.textContent).toBe('Reset Steps');
    button.click();
    expect(parameters()[MODIFIER_STACK_SOLID_SCRIPT_INPUTS_KEY]).toEqual({ steps: '2' });
    expect(panel.querySelector('[data-solid-script-notices]')?.textContent).toBe('');
    commandStack.undo();
    expect(parameters()[MODIFIER_STACK_SOLID_SCRIPT_INPUTS_KEY]).toEqual({ steps: '6' });
  });
});
