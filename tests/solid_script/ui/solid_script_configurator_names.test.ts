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
    new SolidScriptConfiguratorNames(input, { names: [], extra: [], words: [] });
    input.focus();
    input.value = '[$Box.Size.';
    input.setSelectionRange(input.value.length, input.value.length);
    input.dispatchEvent(new Event('input'));
    const shown = [...document.querySelectorAll('[role="option"]')].map((row) => row.firstElementChild?.textContent);
    expect(shown).toEqual(['$Box.Size.x', '$Box.Size.y', '$Box.Size.z', '$Box.Size.Length']);
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

  it('offers the parts the script defines for Use Part', () => {
    const name = solidScriptCommandFind('use_part')!.parameters[0]!;
    const names = [
      { name: 'Post', category: 'Parts' as const, line: 0, detail: 'Define Part' },
      { name: 'Rail', category: 'Parts' as const, line: 3, detail: 'Define Part' },
      { name: 'Width', category: 'Variables' as const, line: 1, detail: '' },
    ];
    const field = solidScriptConfiguratorFieldBuild(name, 'Post', () => {}, { names, extra: [] });
    document.body.append(field.element);
    field.element.querySelector('input')!.dispatchEvent(new MouseEvent('click'));
    const offered = [...document.querySelectorAll('[role="option"]')].map((row) => row.firstElementChild?.textContent);
    expect(offered.slice(0, 2)).toEqual(['Post', 'Rail']);
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
