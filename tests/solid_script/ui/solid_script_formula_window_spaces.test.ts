import { afterEach, describe, expect, it } from 'vitest';
import {
  button,
  chip,
  configuratorOpen,
  fieldFill,
  formulaWindow,
  press,
  rows,
} from './solid_script_formula_window_fixture.js';

afterEach(() => document.body.replaceChildren());

describe('SolidScript formula window spaces', () => {
  it('shows the kept spaces of a field in its Text block and writes them back as $ and a space', () => {
    const { stored, root, input } = configuratorOpen('echo', { value: '$ Hi$ ' }, 'Message');
    button('Build Message from blocks').click();
    expect(rows()).toEqual(["Text ' Hi '"]);
    press(chip(0), 'Enter');
    const box = document.querySelector<HTMLInputElement>(
      '[data-solid-script-configurator="formula_text"] [aria-label="Text"]',
    );
    expect(box?.value).toBe(' Hi ');
    fieldFill('formula_text', 'Text', '  two  words ');
    expect(rows()).toEqual(["Text '  two  words '"]);
    button('OK', formulaWindow()).click();
    expect(input.value).toBe('$ $ two  words$ ');
    button('OK', root).click();
    expect(stored[0]?.['value']).toBe('$ $ two  words$ ');
  });

  it('trims a field as typed, keeping the spaces a $ keeps', () => {
    const { stored, root, input } = configuratorOpen('echo', { value: '' }, 'Message');
    input.value = '   $ Hi$    ';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    button('OK', root).click();
    expect(stored[0]?.['value']).toBe('$ Hi$ ');
  });
});
