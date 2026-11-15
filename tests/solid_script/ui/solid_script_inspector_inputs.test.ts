import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
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
});
