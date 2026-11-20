import { afterEach, describe, expect, it } from 'vitest';
import { solidScriptCommandFind } from '@/solid_script/commands/solid_script_command_catalog.js';
import type { SolidScriptCommandParameter } from '@/solid_script/commands/solid_script_command.js';
import { solidScriptConfiguratorFieldBuild } from '@/solid_script/ui/solid_script_configurator_fields.js';
import { solidScriptConfiguratorQueryApplies } from '@/solid_script/ui/solid_script_configurator_query.js';

afterEach(() => document.body.replaceChildren());

/**
 * Returns a command parameter by command id and field key.
 *
 * @param command Command id.
 * @param key Field key.
 * @returns Parameter.
 */
function parameter(command: string, key: string): SolidScriptCommandParameter {
  const found = solidScriptCommandFind(command)?.parameters.find((entry) => entry.key === key);
  if (found === undefined) throw new Error(`${command} has no ${key} field`);
  return found;
}

/**
 * Puts a query field on the page.
 *
 * @param command Command id.
 * @param key Field key.
 * @param value Stored field text.
 * @param extra Fills the field may use.
 * @returns Field.
 */
function field(command: string, key: string, value: string, extra: readonly string[] = []) {
  const built = solidScriptConfiguratorFieldBuild(parameter(command, key), value, () => {}, { names: [], extra });
  document.body.append(built.element);
  return built;
}

/**
 * Returns the Easy or Code button of a query field.
 *
 * @param label Easy or Code.
 * @returns Button.
 */
function mode(label: 'Easy' | 'Code'): HTMLButtonElement {
  const button = document.body.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (!button) throw new Error(`${label} is missing`);
  return button;
}

describe('SolidScript query editor in the configurator', () => {
  it('applies to Select and Filter List Where and If, not Scatter Points Where', () => {
    expect(solidScriptConfiguratorQueryApplies(parameter('select_faces', 'where'))).toBe(true);
    expect(solidScriptConfiguratorQueryApplies(parameter('select_brushes', 'where'))).toBe(true);
    expect(solidScriptConfiguratorQueryApplies(parameter('filter_list', 'where'))).toBe(true);
    expect(solidScriptConfiguratorQueryApplies(parameter('if', 'condition'))).toBe(true);
    expect(solidScriptConfiguratorQueryApplies(parameter('scatter_points', 'where'))).toBe(false);
  });

  it('shows an empty Where in Easy mode and keeps it empty', () => {
    const built = field('select_faces', 'where', '');
    expect(mode('Easy').getAttribute('aria-pressed')).toBe('true');
    expect(built.read()).toBe('');
    expect(built.problem()).toBe('');
  });

  it('shows In Box without the hidden face center, and keeps hand-typed text until a row changes', () => {
    const stored = '[=InBox([$Face.Center], Vector(0, 0, 0), 2)]';
    const built = field('select_faces', 'where', stored, ['$Face', '$Index']);
    expect(document.body.querySelector('[aria-label="Point"]')).toBeNull();
    const center = document.body.querySelector<HTMLInputElement>('[aria-label="Center"]');
    const size = document.body.querySelector<HTMLInputElement>('[aria-label="Size"]');
    expect(center?.value).toBe('0, 0, 0');
    expect(size?.value).toBe('2');
    mode('Code').click();
    expect(mode('Code').getAttribute('aria-pressed')).toBe('true');
    expect(built.read()).toBe(stored);
    mode('Easy').click();
    expect(built.read()).toBe(stored);
    const edited = document.body.querySelector<HTMLInputElement>('[aria-label="Size"]');
    if (!edited) throw new Error('Size is missing');
    edited.value = '4';
    edited.dispatchEvent(new Event('input', { bubbles: true }));
    expect(built.read()).toBe('[=InBox([$Face.Center], Vector(0, 0, 0), 4)]');
  });

  it('hides [$Brush] on Hits and writes HitsBox from Center and Size', () => {
    const stored = '[=HitsBox([$Brush], Vector(0, 0, 0), 2, "Overlapping")]';
    const built = field('select_brushes', 'where', stored, ['$Brush', '$Index']);
    expect(document.body.querySelector('[aria-label="Element"]')).toBeNull();
    expect(document.body.querySelector<HTMLInputElement>('[aria-label="How"]')?.value).toBe('Overlapping');
    const size = document.body.querySelector<HTMLInputElement>('[aria-label="Size"]');
    if (!size) throw new Error('Size is missing');
    size.value = '3';
    size.dispatchEvent(new Event('input', { bubbles: true }));
    expect(built.read()).toBe('[=HitsBox([$Brush], Vector(0, 0, 0), 3, "Overlapping")]');
  });

  it('keeps an If condition without [= ] wrapping', () => {
    const stored = 'HitsBox([$Brush], Vector(0, 0, 0), 2)';
    const built = field('if', 'condition', stored, ['$Brush']);
    expect(built.read()).toBe(stored);
    mode('Code').click();
    expect(built.read()).toBe(stored);
  });
});
