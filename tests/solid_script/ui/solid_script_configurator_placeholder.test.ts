import { describe, expect, it } from 'vitest';
import { solidScriptCommandFind } from '@/solid_script/commands/solid_script_command_catalog.js';
import type { SolidScriptCommandParameter } from '@/solid_script/commands/solid_script_command.js';
import { solidScriptConfiguratorFieldBuild } from '@/solid_script/ui/solid_script_configurator_fields.js';

/**
 * Returns a field of a command.
 *
 * @param command Command id.
 * @param key Field key.
 * @returns Parameter.
 */
function parameterOf(command: string, key: string): SolidScriptCommandParameter {
  const parameter = solidScriptCommandFind(command)?.parameters.find((entry) => entry.key === key);
  if (!parameter) throw new Error(`${command} has no ${key} field`);
  return parameter;
}

/**
 * Reads the placeholder of a field built with a stored value.
 *
 * @param command Command id.
 * @param key Field key.
 * @param value Stored value.
 * @returns Placeholder and the typed value.
 */
function shown(command: string, key: string, value: string): { placeholder: string; value: string } {
  const field = solidScriptConfiguratorFieldBuild(parameterOf(command, key), value, () => {});
  const input = field.element.querySelector('input[type="text"]');
  if (!(input instanceof HTMLInputElement)) throw new Error(`${command}.${key} has no text input`);
  return { placeholder: input.placeholder, value: input.value };
}

describe('SolidScript empty fields show their default as placeholder text', () => {
  it('shows Additive in an empty Cube Mode, and keeps the box empty', () => {
    expect(shown('cube', 'mode', '')).toEqual({ placeholder: 'Additive', value: '' });
  });

  it('shows the same default on other choice and number fields when they are empty', () => {
    expect(shown('select_objects', 'which', '').placeholder).toBe('All');
    expect(shown('project_uvs', 'mode', '').placeholder).toBe('Box');
    expect(shown('cube', 'size', '').placeholder).toBe('1, 1, 1');
    expect(shown('cube', 'anchor', '').placeholder).toBe('Center, Center, Center');
  });

  it('keeps an explicit Of placeholder, not a blank default', () => {
    expect(shown('move_by', 'of', '').placeholder).toBe('[$Selected.Objects]');
  });

  it('shows no placeholder when empty is not a value that can be typed', () => {
    expect(shown('select_objects', 'of', '').placeholder).toBe('');
    expect(shown('output', 'of', '').placeholder).toBe('');
  });
});
