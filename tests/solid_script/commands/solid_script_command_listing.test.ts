import { describe, expect, it } from 'vitest';
import { solidScriptCommandFind } from '@/solid_script/commands/solid_script_command_catalog.js';

/**
 * Returns the listing text of one command line.
 *
 * @param command Command id.
 * @param values Stored values; missing ones use their defaults.
 * @returns Line as the script listing shows it.
 */
function listed(command: string, values: Record<string, string> = {}): string {
  const found = solidScriptCommandFind(command);
  if (!found) throw new Error(`unknown command ${command}`);
  return found.listingText(values);
}

describe('SolidScript listing', () => {
  it('writes the command name, two spaces and its configured values in quotes, without field captions', () => {
    expect(listed('cube', { size: '0.5, 0.5, 2.5' })).toBe("Cube  '0.5, 0.5, 2.5'");
    expect(listed('sphere', { r: '2' })).toBe("Sphere  radius '2'");
    expect(listed('translate', { v: '0, 0, 2.5' })).toBe("Translate  by '0, 0, 2.5'");
    expect(listed('rotate', { a: '0, 0, 90' })).toBe("Rotate  by '0, 0, 90' degrees");
    expect(listed('scale', { v: '1, 1, 2' })).toBe("Scale  by '1, 1, 2'");
    expect(listed('mirror', { v: '1, 0, 0' })).toBe("Mirror  across '1, 0, 0'");
    expect(listed('circle', { r: '1' })).toBe("Circle  radius '1'");
  });

  it('only mentions an option when it differs from its default', () => {
    expect(listed('cube', { size: '1, 1, 1', center: 'false' })).toBe("Cube  '1, 1, 1' (Not Centered)");
    expect(listed('square', { size: '2, 1', center: 'false' })).toBe("Square  '2, 1' (Not Centered)");
    expect(listed('linear_extrude', { height: '2', center: 'true', scale: '1, 1' })).toBe("Linear Extrude  height '2'");
    expect(listed('linear_extrude', { height: '2', center: 'false', scale: '0.5, 0.5' })).toBe(
      "Linear Extrude  height '2' (Not Centered, Top Scale '0.5, 0.5')",
    );
  });

  it('shows the sides and rings of round shapes only when changed', () => {
    expect(listed('sphere', { r: '1', sides: '16', rings: '8' })).toBe("Sphere  radius '1'");
    expect(listed('sphere', { r: '1', sides: '8', rings: '4' })).toBe("Sphere  radius '1' (Sides '8', Rings '4')");
    expect(listed('cylinder', { h: '2', r1: '1', r2: '1', sides: '6' })).toBe(
      "Cylinder  height '2', radius '1' (Sides '6')",
    );
    expect(listed('circle', { r: '1', sides: '6' })).toBe("Circle  radius '1' (Sides '6')");
  });

  it('reads differently depending on how the block is configured', () => {
    expect(listed('cylinder', { h: '2', r1: '0.5', r2: '0.5' })).toBe("Cylinder  height '2', radius '0.5'");
    expect(listed('cylinder', { h: '2', r1: '0.5', r2: '0', center: 'false' })).toBe(
      "Cylinder  height '2', radius '0.5' to '0' (Not Centered)",
    );
    expect(listed('repeat', { variable: 'i', from: '0', to: '3', step: '1' })).toBe("Repeat  [i] from '0' to '3'");
    expect(listed('repeat', { variable: 'i', from: '0', to: '10', step: '2' })).toBe(
      "Repeat  [i] from '0' to '10' (Step '2')",
    );
  });

  it('shows a lone variable as [name] and everything else as typed, in quotes', () => {
    expect(listed('variable', { name: 'width', value: '3' })).toBe("Set  [width]:  '3'");
    expect(listed('translate', { v: '[offset]' })).toBe('Translate  by [offset]');
    expect(listed('sphere', { r: '[radius]' })).toBe('Sphere  radius [radius]');
    expect(listed('translate', { v: '[=[i] * 2], 0, 0' })).toBe("Translate  by '[=[i] * 2], 0, 0'");
    expect(listed('if', { condition: '[width] > 2' })).toBe("If  '[width] > 2'");
    expect(listed('echo', { value: 'Hello' })).toBe("@ Echo  'Hello'");
    expect(listed('echo', { value: '[width]' })).toBe('@ Echo  [width]');
  });

  it('marks notes, parts and plain block lines with their own short forms', () => {
    expect(listed('note', { text: 'Two posts and a lintel' })).toBe('***  Two posts and a lintel');
    expect(listed('part', { name: 'post' })).toBe('::  post');
    expect(listed('use_part', { name: 'post' })).toBe("Use Part  'post'");
    expect(listed('union')).toBe('Union');
    expect(listed('else')).toBe('Else');
    expect(listed('blank')).toBe('');
  });

  it('has no Detail command any more', () => {
    expect(solidScriptCommandFind('detail')).toBeUndefined();
  });

  it('tags every piece so values and variables can be shown in full colour', () => {
    const parts = solidScriptCommandFind('translate')?.listing({ v: '[=[i] * [width]], 0, 0' }) ?? [];
    expect(parts.map((part) => part.kind)).toEqual(['name', 'word', 'value']);
    expect(
      solidScriptCommandFind('repeat')
        ?.listing({ variable: 'i' })
        .map((part) => part.kind),
    ).toEqual(['name', 'variable', 'word', 'value', 'word', 'value']);
    expect(
      solidScriptCommandFind('note')
        ?.listing({ text: 'x' })
        .map((part) => part.kind),
    ).toEqual(['note']);
  });
});
