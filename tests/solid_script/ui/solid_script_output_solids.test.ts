import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CommandStack } from '@/commands/command_stack.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { modifierGeneratorNodeCreate } from '@/modifier/stack/modifier_generator_node.js';
import { modifierStackKindFind } from '@/modifier/stack/modifier_stack_catalog.js';
import { MODIFIER_STACK_SOLID_SCRIPT_KIND } from '@/modifier/stack/kinds/generator/solid_script/modifier_stack_solid_script_keys.js';
import { ModifierStackFieldRows } from '@/modifier/stack/ui/modifier_stack_field_rows.js';
import { modifierStackParametersCommit } from '@/modifier/stack/modifier_stack_parameters_commit.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptEditorCurrentGet } from '@/solid_script/ui/solid_script_editor_open.js';
import { editorFixture, find, tool } from './solid_script_editor_fixture.js';

/** Solids count and five-decimal time, as the output writes it. */
const SOLIDS_TIME = /^\d+ solids?(?: so far)? \(\d+\.\d{5}ms\)/;

/**
 * Reads the solids count and time at the start of the editor output.
 *
 * @returns Solids line, without warnings appended after it.
 */
function outputLine(): string {
  const text = find('.solid-script-editor-output-text').textContent ?? '';
  return text.match(SOLIDS_TIME)?.[0] ?? text.split('\n')[0] ?? '';
}

/**
 * Renders the inspector rows of a SolidScript generator with a script.
 *
 * @param lines Command lines of the script.
 * @returns The script field.
 */
function inspectorField(lines: SolidScriptLine[]): HTMLElement {
  const world = new THREE.Group();
  const node = modifierGeneratorNodeCreate(MODIFIER_STACK_SOLID_SCRIPT_KIND);
  world.add(node);
  const stepId = ModifierVolume.read(node).modifiers[0]?.id ?? '';
  modifierStackParametersCommit(node, stepId, { script: solidScriptDocumentCreate(lines, 'Timed') }, null);
  const kind = modifierStackKindFind(MODIFIER_STACK_SOLID_SCRIPT_KIND);
  if (!kind) throw new Error('Expected the SolidScript kind');
  const parameters = () => kind.normalizeParameters(ModifierVolume.read(node).modifiers[0]?.parameters ?? {});
  const commandStack = new CommandStack(50);
  const rows = new ModifierStackFieldRows(
    kind.fields,
    () => undefined,
    () => [],
    {},
    (status) => ({ volume: node, stepId, commandStack, status, refresh: () => rows.update(parameters()) }),
  );
  document.body.append(rows.getElement());
  rows.update(parameters());
  const field = rows.getElement().querySelector<HTMLElement>('[data-solid-script-field]');
  if (!field) throw new Error('Expected the script row');
  return field;
}

afterEach(() => {
  solidScriptEditorCurrentGet()?.close();
  document.body.replaceChildren();
});

describe('SolidScript generation time in the output', () => {
  it('shows 0, 1 and 5 solids with the time the run took', () => {
    editorFixture([]);
    expect(outputLine()).toMatch(/^0 solids \(\d+\.\d{5}ms\)$/);

    solidScriptEditorCurrentGet()?.close();
    document.body.replaceChildren();
    editorFixture([{ command: 'cube' }]);
    expect(outputLine()).toMatch(/^1 solid \(\d+\.\d{5}ms\)$/);

    solidScriptEditorCurrentGet()?.close();
    document.body.replaceChildren();
    editorFixture([
      { command: 'cube' },
      { command: 'cube' },
      { command: 'cube' },
      { command: 'cube' },
      { command: 'cube' },
    ]);
    expect(outputLine()).toMatch(/^5 solids \(\d+\.\d{5}ms\)$/);
  });

  it('keeps the error text when a run fails, with no solids line', () => {
    editorFixture([{ command: 'cube' }, { command: 'sphere', values: { r: '1 +' } }]);
    const text = find('.solid-script-editor-output-text').textContent ?? '';
    expect(text).toMatch(/^Line 2/);
    expect(text).not.toMatch(SOLIDS_TIME);
  });

  it('shows the time of the solids built so far at a breakpoint', () => {
    editorFixture([
      { command: 'cube' },
      { command: 'cube' },
      { command: 'cube' },
      { command: 'cube' },
      { command: 'cube' },
    ]);
    find('[data-line="2"] .solid-script-editor-gutter').click();
    tool('Start').click();
    expect(outputLine()).toMatch(/^2 solids so far \(\d+\.\d{5}ms\)$/);
  });
});

describe('SolidScript generation time on a generator row', () => {
  it('appends the run time after the solids count', () => {
    const field = inspectorField([{ command: 'cube' }, { command: 'sphere' }]);
    expect(field.textContent).toMatch(/2 lines · 2 solids \(\d+\.\d{5}ms\)/);
  });

  it('keeps only the line count when the script fails', () => {
    const field = inspectorField([{ command: 'cube', values: { size: '1 +' } }]);
    expect(field.textContent).toMatch(/1 line/);
    expect(field.textContent).not.toMatch(SOLIDS_TIME);
  });
});
