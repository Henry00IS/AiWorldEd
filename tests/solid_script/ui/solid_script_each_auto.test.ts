import { describe, expect, it } from 'vitest';
import { solidScriptCommandFind } from '@/solid_script/commands/solid_script_command_catalog.js';
import {
  solidScriptCommandFieldFills,
  solidScriptParameterEachActive,
  solidScriptParameterEachKind,
} from '@/solid_script/commands/solid_script_command_each.js';
import { solidScriptEachUsed } from '@/solid_script/language/solid_script_each_uses.js';

/**
 * Returns a parameter of a command by key.
 *
 * @param id Command id.
 * @param key Field key.
 * @returns Parameter.
 */
function parameter(id: string, key: string) {
  const found = solidScriptCommandFind(id)?.parameters.find((entry) => entry.key === key);
  if (!found) throw new Error(`${id} has no ${key} field`);
  return found;
}

describe('SolidScript automatic per-item fields', () => {
  it('counts a field as per item only when it reads a per-item value', () => {
    expect(solidScriptEachUsed('[=[$Index] * 2]')).toBe(true);
    expect(solidScriptEachUsed('[$Vertex.Position.Y]')).toBe(true);
    expect(solidScriptEachUsed('[=[Height] * 2]')).toBe(false);
    expect(solidScriptEachUsed('Index')).toBe(false);
    expect(solidScriptEachUsed('')).toBe(false);
  });

  it('marks a field only when its text uses a per-item value, while still offering the fills', () => {
    const distance = parameter('displace', 'distance');
    expect(solidScriptParameterEachKind(distance, { distance: '0.5' })).toBe('Vertex');
    expect(solidScriptParameterEachActive(distance, { distance: '0.5' })).toBeUndefined();
    expect(solidScriptParameterEachActive(distance, { distance: '[=[$Y] * 0.1]' })).toBe('Vertex');
    const command = solidScriptCommandFind('displace');
    if (!command) throw new Error('Displace is missing');
    expect(solidScriptCommandFieldFills(command, distance, { distance: '0.5' })).toContain('$Vertex');
    expect(command.listing({ distance: '0.5' }).some((part) => part.each)).toBe(false);
  });

  it('keeps Set marked by its Variable and its value', () => {
    const value = parameter('variable', 'value');
    const write = { name: '$Selected.Vertices.Positions' };
    expect(solidScriptParameterEachKind(value, write)).toBe('Vertex');
    expect(solidScriptParameterEachActive(value, { ...write, value: '[0, 1, 0]' })).toBeUndefined();
    expect(solidScriptParameterEachActive(value, { ...write, value: '[$Vertex.Position]' })).toBe('Vertex');
    expect(solidScriptParameterEachKind(value, { name: 'Width' })).toBeUndefined();
  });
});
