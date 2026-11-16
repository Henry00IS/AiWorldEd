import { afterEach, describe, expect, it } from 'vitest';
import { solidScriptCommandFind } from '@/solid_script/commands/solid_script_command_catalog.js';
import { solidScriptConfiguratorFieldBuild } from '@/solid_script/ui/solid_script_configurator_fields.js';
import { SolidScriptConfiguratorNames } from '@/solid_script/ui/solid_script_configurator_names.js';
import { SOLID_SCRIPT_EDITOR_VIEW_DEFAULT } from '@/solid_script/ui/solid_script_editor_view.js';

const WORDS = [
  { word: 'All', detail: '' },
  { word: 'Generator', detail: '' },
  { word: 'Modifier', detail: '' },
];

/**
 * Builds a field of words with its suggestions on the page.
 *
 * @param value Field text.
 * @returns Input.
 */
function wordField(value: string): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'text';
  input.value = value;
  document.body.append(input);
  new SolidScriptConfiguratorNames(input, { names: [], extra: [], words: WORDS });
  return input;
}

/**
 * Returns the label of the picked suggestion, or null when the list is closed.
 *
 * @returns Label.
 */
function picked(): string | null {
  return document.querySelector('[role="option"][aria-selected="true"]')?.firstElementChild?.textContent ?? null;
}

afterEach(() => document.body.replaceChildren());

describe('SolidScript configurator suggestions', () => {
  it('opens only on a click or typing, never when the field gets the focus', () => {
    const input = wordField('Modifier');
    input.focus();
    input.dispatchEvent(new FocusEvent('focus'));
    expect(document.querySelector('[role="listbox"]')).toBeNull();
    input.dispatchEvent(new MouseEvent('click'));
    expect(document.querySelector('[role="listbox"]')).not.toBeNull();
  });

  it('reopens on a typed dot with the members of what is before it', () => {
    const input = document.createElement('input');
    input.type = 'text';
    document.body.append(input);
    const names = [{ name: 'Vertex.Position', category: 'System' as const, line: 0, detail: '' }];
    new SolidScriptConfiguratorNames(input, { names, extra: [], words: [] });
    input.focus();
    input.value = '[Vertex.Position.';
    input.setSelectionRange(input.value.length, input.value.length);
    input.dispatchEvent(new Event('input'));
    const shown = [...document.querySelectorAll('[role="option"]')].map((row) => row.firstElementChild?.textContent);
    expect(shown).toEqual(['Vertex.Position.X', 'Vertex.Position.Y', 'Vertex.Position.Z']);
  });

  it('starts on the current value, also after another one is picked', () => {
    const input = wordField('Modifier');
    input.dispatchEvent(new MouseEvent('click'));
    expect(picked()).toBe('Modifier');
    const generator = [...document.querySelectorAll('[role="option"]')].find((row) =>
      row.textContent?.startsWith('Generator'),
    )!;
    generator.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(input.value).toBe('Generator');
    expect(document.querySelector('[role="listbox"]')).toBeNull();
    input.dispatchEvent(new MouseEvent('click'));
    expect(picked()).toBe('Generator');
  });
});

describe('SolidScript configurator fields', () => {
  it('lets Set change a Function variable written Local.Name', () => {
    const set = solidScriptCommandFind('variable')!;
    const target = set.parameters.find((parameter) => parameter.key === 'name')!;
    expect(solidScriptConfiguratorFieldBuild(target, 'Local.Width', () => {}).problem()).toBe('');
    expect(solidScriptConfiguratorFieldBuild(target, 'Persistent.Presses', () => {}).problem()).toBe('');
  });

  it('offers Current Face for In only inside a face round', () => {
    const where = solidScriptCommandFind('for_each_vertex')!.parameters.find((parameter) => parameter.key === 'in')!;
    const offered = (inLoop: boolean): string[] => {
      document.body.replaceChildren();
      const names = inLoop ? [{ name: 'Face.Index', category: 'System' as const, line: 0, detail: '' }] : [];
      const field = solidScriptConfiguratorFieldBuild(where, 'Shapes', () => {}, { names, extra: [] });
      document.body.append(field.element);
      field.element.querySelector('input')!.dispatchEvent(new MouseEvent('click'));
      return [...document.querySelectorAll('[role="option"]')].map((row) => row.firstElementChild?.textContent ?? '');
    };
    expect(offered(true)).toEqual(['Shapes', 'Selected Faces', 'Current Face']);
    expect(offered(false)).toEqual(['Shapes', 'Selected Faces']);
    expect(picked()).toBe('Shapes');
  });

  it('draws a formula highlighted with unknown names underlined', () => {
    const value = setValue();
    const field = solidScriptConfiguratorFieldBuild(
      value,
      '[=Spot([Middle], [Widht])]',
      () => {},
      { names: [{ name: 'Middle', category: 'Variables', line: 0, detail: '' }], extra: [] },
      SOLID_SCRIPT_EDITOR_VIEW_DEFAULT,
    );
    const spans = [...field.element.querySelectorAll('[aria-hidden="true"] span span')];
    const classOf = (text: string): string => spans.find((span) => span.textContent === text)?.className ?? '';
    expect(classOf('Middle')).toContain('token-name');
    expect(classOf('Widht')).toContain('squiggle');
    expect(classOf('Spot')).toContain('squiggle');
    expect(field.warning()).toContain('[Widht]');
  });
});

/**
 * Returns the Value parameter of Set.
 *
 * @returns Parameter.
 */
function setValue() {
  return solidScriptCommandFind('variable')!.parameters.find((parameter) => parameter.key === 'value')!;
}
