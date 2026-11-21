import { afterEach, describe, expect, it } from 'vitest';
import { solidScriptCommandFind } from '@/solid_script/commands/solid_script_command_catalog.js';
import { button, configuratorOpen, formulaText, formulaWindow, rows } from './solid_script_formula_window_fixture.js';

afterEach(() => document.body.replaceChildren());

/**
 * The declared default of a field.
 *
 * @param id Command id.
 * @param key Field key.
 * @returns Default text.
 */
function declared(id: string, key: string): string {
  const parameter = solidScriptCommandFind(id)?.parameters.find((entry) => entry.key === key);
  if (!parameter || parameter.default === '') throw new Error(`Expected a default on ${id} ${key}`);
  return parameter.default;
}

describe('SolidScript formula window on an empty field with a default', () => {
  it('opens with the default as blocks, and Cancel or an unchanged OK keeps the field empty', () => {
    const sides = declared('circle', 'sides');
    const { input } = configuratorOpen('circle', {}, 'Sides');
    button('Build Sides from blocks').click();
    expect(formulaText()).toBe(sides);
    expect(rows()).toHaveLength(1);
    button('Cancel', formulaWindow()).click();
    expect(input.value).toBe('');
    button('Build Sides from blocks').click();
    button('OK', formulaWindow()).click();
    expect(input.value).toBe('');
  });

  it('opens a formula default such as the one of Displace as its blocks', () => {
    configuratorOpen('displace', {}, 'Distance');
    button('Build Distance from blocks').click();
    expect(formulaText()).toBe(declared('displace', 'distance'));
    expect(rows().length).toBeGreaterThan(1);
  });

  it('opens with what the user typed instead of the default', () => {
    configuratorOpen('circle', { sides: '7' }, 'Sides');
    button('Build Sides from blocks').click();
    expect(formulaText()).toBe('7');
  });
});
